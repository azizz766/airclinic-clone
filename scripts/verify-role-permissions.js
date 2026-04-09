require('dotenv').config()

const { Client } = require('pg')
const { randomUUID } = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const { createServerClient } = require('@supabase/ssr')

const BASE_URL = process.env.VERIFY_BASE_URL || 'http://localhost:3000'
const TEST_PASSWORD = 'Temp#12345678'

function nowIso() {
  return new Date().toISOString()
}

function nextWeekdayAtUtc(targetDay, hour, minute) {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0))
  const diff = (targetDay - d.getUTCDay() + 7) % 7
  d.setUTCDate(d.getUTCDate() + (diff === 0 ? 7 : diff))
  return d
}

async function createCookieHeaderFromSession(session) {
  const cookieJar = new Map()

  const ssrClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value }))
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            if (!value) {
              cookieJar.delete(name)
            } else {
              cookieJar.set(name, value)
            }
          }
        },
      },
    }
  )

  const { error } = await ssrClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })

  if (error) {
    throw new Error(`Failed to set SSR session cookie: ${error.message}`)
  }

  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

async function fetchPage(path, cookieHeader, redirectMode = 'manual') {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    redirect: redirectMode,
    signal: AbortSignal.timeout(30000),
    headers: {
      cookie: cookieHeader,
    },
  })

  const text = await response.text()

  return {
    status: response.status,
    ok: response.ok,
    location: response.headers.get('location'),
    text,
  }
}

async function postJson(path, cookieHeader, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      cookie: cookieHeader,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  })

  const payload = await response.json().catch(() => null)

  return {
    status: response.status,
    ok: response.ok,
    payload,
  }
}

async function updateMembershipRole(db, membershipId, role) {
  await db.query(
    `update memberships set role = $1::"Role", "updatedAt" = now() where id = $2`,
    [role, membershipId]
  )
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  const evidence = {
    runId: `verify_role_permissions_${Date.now()}`,
    startedAt: nowIso(),
    baseUrl: BASE_URL,
    fixtures: {},
    admin: {},
    receptionist: {},
    doctor: {},
    finalVerdict: {},
    commands: [
      'node scripts/verify-role-permissions.js',
      'node scripts/verify-reschedule-auth.js',
      'node scripts/verify-dashboard-metrics.js',
      'node scripts/verify-notification-center.js',
    ],
  }

  const authUserResult = await db.query(
    `
      select id, email
      from auth.users
      where email is not null
        and email not like 'reschedule.sql.%@example.com'
        and email not like 'reschedule.probe.%@example.com'
        and deleted_at is null
      order by created_at asc
      limit 1
    `
  )

  if (!authUserResult.rows[0]) {
    throw new Error('No auth user found in auth.users. Cannot run authenticated verification.')
  }

  const authUserId = authUserResult.rows[0].id
  const authEmail = authUserResult.rows[0].email

  await db.query(
    `
      update auth.users
      set encrypted_password = crypt($1, gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = $2
    `,
    [TEST_PASSWORD, authUserId]
  )

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const signIn = await supabase.auth.signInWithPassword({
    email: authEmail,
    password: TEST_PASSWORD,
  })

  if (!signIn.data.session) {
    throw new Error(`Authenticated sign-in failed: ${signIn.error ? signIn.error.message : 'no session'}`)
  }

  const cookieHeader = await createCookieHeaderFromSession(signIn.data.session)

  const suffix = Date.now()
  const clinicId = randomUUID()
  const membershipId = randomUUID()
  const doctorId = randomUUID()
  const serviceId = randomUUID()
  const patientId = randomUUID()
  const confirmAppointmentId = randomUUID()
  const cancelAppointmentId = randomUUID()
  const rescheduleAppointmentId = randomUUID()
  const retryAppointmentId = randomUUID()
  const adminRetryReminderId = randomUUID()
  const receptionistRetryReminderId = randomUUID()
  const adminRetryJobId = randomUUID()
  const receptionistRetryJobId = randomUUID()

  const baseDay = nextWeekdayAtUtc(1, 0, 0)
  const confirmAt = new Date(baseDay)
  confirmAt.setUTCHours(10, 0, 0, 0)
  const cancelAt = new Date(baseDay)
  cancelAt.setUTCHours(11, 0, 0, 0)
  const rescheduleOriginalAt = new Date(baseDay)
  rescheduleOriginalAt.setUTCHours(12, 0, 0, 0)
  const rescheduleTargetAt = new Date(baseDay)
  rescheduleTargetAt.setUTCHours(13, 0, 0, 0)
  const retryAt = new Date(baseDay)
  retryAt.setUTCHours(14, 0, 0, 0)

  evidence.fixtures = {
    authUserId,
    authEmailMasked: authEmail.replace(/^[^@]+/, '***'),
    clinicId,
    membershipId,
    confirmAppointmentId,
    cancelAppointmentId,
    rescheduleAppointmentId,
    adminRetryJobId,
    receptionistRetryJobId,
  }

  try {
    await db.query(
      `insert into clinics (id, name, slug, timezone, "isActive", "subscriptionPlan", "createdAt", "updatedAt")
       values ($1, $2, $3, 'UTC', true, 'free', now(), now())`,
      [clinicId, `Role Verify Clinic ${suffix}`, `role-verify-${suffix}`]
    )

    await db.query(
      `insert into users (id, email, "passwordHash", "createdAt", "updatedAt")
       values ($1, $2, '', now(), now())
       on conflict (id) do update set email = excluded.email`,
      [authUserId, authEmail]
    )

    await db.query(
      `insert into memberships (id, "userId", "clinicId", role, "isActive", "createdAt", "updatedAt")
       values ($1, $2, $3, 'admin', true, now(), now())`,
      [membershipId, authUserId, clinicId]
    )

    await db.query(
      `insert into doctors (id, "clinicId", "firstName", "lastName", "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Role', 'Doctor', true, now(), now())`,
      [doctorId, clinicId]
    )

    await db.query(
      `insert into services (id, "clinicId", name, "durationMinutes", "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Role Service', 30, true, now(), now())`,
      [serviceId, clinicId]
    )

    await db.query(
      `insert into patients (id, "clinicId", "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Role', 'Patient', '+966530123456', true, now(), now())`,
      [patientId, clinicId]
    )

    await db.query(
      `insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, 30, 'scheduled', 'role verify confirm', $7, now(), now())`,
      [confirmAppointmentId, clinicId, patientId, doctorId, serviceId, confirmAt.toISOString(), authUserId]
    )

    await db.query(
      `insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, 30, 'scheduled', 'role verify cancel', $7, now(), now())`,
      [cancelAppointmentId, clinicId, patientId, doctorId, serviceId, cancelAt.toISOString(), authUserId]
    )

    await db.query(
      `insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, 30, 'scheduled', 'role verify reschedule', $7, now(), now())`,
      [rescheduleAppointmentId, clinicId, patientId, doctorId, serviceId, rescheduleOriginalAt.toISOString(), authUserId]
    )

    await db.query(
      `insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, 30, 'scheduled', 'role verify retry', $7, now(), now())`,
      [retryAppointmentId, clinicId, patientId, doctorId, serviceId, retryAt.toISOString(), authUserId]
    )

    await db.query(
      `insert into reminders (id, "clinicId", "appointmentId", type, template, "scheduledAt", status, "createdAt", "updatedAt")
       values ($1, $2, $3, 'whatsapp', 'appointment_confirmation', $4, 'failed', now(), now())`,
      [adminRetryReminderId, clinicId, retryAppointmentId, new Date(retryAt.getTime() - 2 * 60 * 60 * 1000).toISOString()]
    )

    await db.query(
      `insert into reminders (id, "clinicId", "appointmentId", type, template, "scheduledAt", status, "createdAt", "updatedAt")
       values ($1, $2, $3, 'whatsapp', 'appointment_confirmation', $4, 'failed', now(), now())`,
      [receptionistRetryReminderId, clinicId, retryAppointmentId, new Date(retryAt.getTime() - 90 * 60 * 1000).toISOString()]
    )

    await db.query(
      `insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", provider, status, "errorMessage", "scheduledFor", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, 'whatsapp', '+966530123456', 'admin retry body', 'twilio-whatsapp', 'failed', 'Temporary provider timeout while sending.', $6, now(), now())`,
      [adminRetryJobId, clinicId, adminRetryReminderId, retryAppointmentId, patientId, new Date(retryAt.getTime() - 2 * 60 * 60 * 1000).toISOString()]
    )

    await db.query(
      `insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", provider, status, "errorMessage", "scheduledFor", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, 'whatsapp', '+966530123456', 'receptionist retry body', 'twilio-whatsapp', 'failed', 'Temporary provider timeout while sending.', $6, now(), now())`,
      [receptionistRetryJobId, clinicId, receptionistRetryReminderId, retryAppointmentId, patientId, new Date(retryAt.getTime() - 90 * 60 * 1000).toISOString()]
    )

    const adminDashboard = await fetchPage(`/${clinicId}/dashboard`, cookieHeader, 'follow')
    const adminNotifications = await fetchPage(`/${clinicId}/notifications`, cookieHeader, 'follow')
    const adminActivity = await fetchPage(`/${clinicId}/activity`, cookieHeader, 'follow')
    const adminInbox = await fetchPage(`/${clinicId}/inbox`, cookieHeader, 'follow')
    const adminRetry = await postJson(`/api/clinics/${clinicId}/notification-jobs/${adminRetryJobId}/retry`, cookieHeader, {})
    const adminRetryJob = await db.query(
      `select status, "providerMessageId" from notification_jobs where id = $1`,
      [adminRetryJobId]
    )

    evidence.admin = {
      dashboardStatus: adminDashboard.status,
      notificationsStatus: adminNotifications.status,
      activityStatus: adminActivity.status,
      inboxStatus: adminInbox.status,
      retryResponse: adminRetry,
      retriedJob: adminRetryJob.rows[0] ?? null,
      allowedPathsWork:
        adminDashboard.status === 200
        && adminNotifications.status === 200
        && adminActivity.status === 200
        && adminInbox.status === 200
        && adminRetry.status === 200,
    }

    await updateMembershipRole(db, membershipId, 'receptionist')

    const receptionistDashboard = await fetchPage(`/${clinicId}/dashboard`, cookieHeader, 'follow')
    const receptionistNotifications = await fetchPage(`/${clinicId}/notifications`, cookieHeader, 'follow')
    const receptionistActivity = await fetchPage(`/${clinicId}/activity`, cookieHeader, 'follow')
    const receptionistInbox = await fetchPage(`/${clinicId}/inbox`, cookieHeader, 'follow')
    const receptionistConfirm = await postJson(`/api/appointments/${confirmAppointmentId}/confirm`, cookieHeader, {})
    const receptionistCancel = await postJson(`/api/appointments/${cancelAppointmentId}/cancel`, cookieHeader, {})
    const receptionistReschedule = await postJson(`/api/appointments/${rescheduleAppointmentId}/reschedule`, cookieHeader, {
      scheduledAt: rescheduleTargetAt.toISOString(),
    })
    const receptionistRetry = await postJson(`/api/clinics/${clinicId}/notification-jobs/${receptionistRetryJobId}/retry`, cookieHeader, {})
    const receptionistAppointmentStates = await db.query(
      `select id, status, "scheduledAt" from appointments where id in ($1, $2, $3) order by id`,
      [confirmAppointmentId, cancelAppointmentId, rescheduleAppointmentId]
    )

    evidence.receptionist = {
      dashboardStatus: receptionistDashboard.status,
      notificationsStatus: receptionistNotifications.status,
      activityStatus: receptionistActivity.status,
      inboxStatus: receptionistInbox.status,
      confirmStatus: receptionistConfirm.status,
      cancelStatus: receptionistCancel.status,
      rescheduleStatus: receptionistReschedule.status,
      retryStatus: receptionistRetry.status,
      appointmentStates: receptionistAppointmentStates.rows,
      allowedPathsWork:
        receptionistDashboard.status === 200
        && receptionistNotifications.status === 200
        && receptionistActivity.status === 200
        && receptionistInbox.status === 200
        && receptionistConfirm.status === 200
        && receptionistCancel.status === 200
        && receptionistReschedule.status === 200,
      retryBlocked: receptionistRetry.status === 403,
    }

    await updateMembershipRole(db, membershipId, 'doctor')

    const doctorDashboard = await fetchPage(`/${clinicId}/dashboard`, cookieHeader)
    const doctorNotifications = await fetchPage(`/${clinicId}/notifications`, cookieHeader)
    const doctorActivity = await fetchPage(`/${clinicId}/activity`, cookieHeader)
    const doctorInbox = await fetchPage(`/${clinicId}/inbox`, cookieHeader)
    const doctorConfirm = await postJson(`/api/appointments/${confirmAppointmentId}/confirm`, cookieHeader, {})
    const doctorCancel = await postJson(`/api/appointments/${cancelAppointmentId}/cancel`, cookieHeader, {})
    const doctorReschedule = await postJson(`/api/appointments/${rescheduleAppointmentId}/reschedule`, cookieHeader, {
      scheduledAt: new Date(rescheduleTargetAt.getTime() + 60 * 60 * 1000).toISOString(),
    })
    const doctorRetry = await postJson(`/api/clinics/${clinicId}/notification-jobs/${receptionistRetryJobId}/retry`, cookieHeader, {})

    const pageRedirectBlocked = [doctorDashboard, doctorNotifications, doctorActivity, doctorInbox].every((response) => {
      return response.status >= 300 && response.status < 400 && response.location === `/${clinicId}/appointments`
    })

    evidence.doctor = {
      dashboard: { status: doctorDashboard.status, location: doctorDashboard.location },
      notifications: { status: doctorNotifications.status, location: doctorNotifications.location },
      activity: { status: doctorActivity.status, location: doctorActivity.location },
      inbox: { status: doctorInbox.status, location: doctorInbox.location },
      confirmStatus: doctorConfirm.status,
      cancelStatus: doctorCancel.status,
      rescheduleStatus: doctorReschedule.status,
      retryStatus: doctorRetry.status,
      blockedPages: pageRedirectBlocked,
      blockedMutations:
        doctorConfirm.status === 403
        && doctorCancel.status === 403
        && doctorReschedule.status === 403
        && doctorRetry.status === 403,
    }

    evidence.finalVerdict = {
      adminAllowedPathsWork: evidence.admin.allowedPathsWork,
      receptionistAllowedPathsWork: evidence.receptionist.allowedPathsWork,
      receptionistRetryBlocked: evidence.receptionist.retryBlocked,
      doctorBlockedFromOperatorPages: evidence.doctor.blockedPages,
      doctorBlockedFromMutations: evidence.doctor.blockedMutations,
      permissionTighteningSafe:
        evidence.admin.allowedPathsWork
        && evidence.receptionist.allowedPathsWork
        && evidence.receptionist.retryBlocked
        && evidence.doctor.blockedPages
        && evidence.doctor.blockedMutations,
    }
  } finally {
    await db.query(`delete from notification_jobs where id in ($1, $2)`, [adminRetryJobId, receptionistRetryJobId]).catch(() => {})
    await db.query(`delete from reminders where id in ($1, $2)`, [adminRetryReminderId, receptionistRetryReminderId]).catch(() => {})
    await db.query(`delete from appointments where id in ($1, $2, $3, $4)`, [confirmAppointmentId, cancelAppointmentId, rescheduleAppointmentId, retryAppointmentId]).catch(() => {})
    await db.query(`delete from patients where id = $1`, [patientId]).catch(() => {})
    await db.query(`delete from services where id = $1`, [serviceId]).catch(() => {})
    await db.query(`delete from doctors where id = $1`, [doctorId]).catch(() => {})
    await db.query(`delete from memberships where id = $1`, [membershipId]).catch(() => {})
    await db.query(`delete from clinics where id = $1`, [clinicId]).catch(() => {})
    await db.end()
  }

  evidence.finishedAt = nowIso()
  console.log(JSON.stringify(evidence, null, 2))
}

main().catch((error) => {
  console.error('[VERIFY_ROLE_PERMISSIONS_ERROR]', error)
  process.exit(1)
})