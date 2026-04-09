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

async function postJsonWithCookie(path, cookieHeader, body) {
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

async function main() {
  const runId = `verify_operator_audit_${Date.now()}`
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  const evidence = {
    runId,
    startedAt: nowIso(),
    baseUrl: BASE_URL,
    fixtures: {},
    calls: {},
    audit: {},
    finalVerdict: {},
    commands: ['node scripts/verify-operator-audit.js'],
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
  const clinicAId = randomUUID()
  const clinicBId = randomUUID()
  const membershipAId = randomUUID()
  const membershipBId = randomUUID()

  const doctorAId = randomUUID()
  const doctorBId = randomUUID()
  const serviceAId = randomUUID()
  const serviceBId = randomUUID()
  const patientAId = randomUUID()
  const patientBId = randomUUID()

  const confirmAppointmentId = randomUUID()
  const cancelAppointmentId = randomUUID()
  const rescheduleAppointmentId = randomUUID()
  const retryAppointmentId = randomUUID()
  const clinicBAppointmentId = randomUUID()

  const rescheduleReminderPendingId = randomUUID()
  const rescheduleReminderQueuedId = randomUUID()
  const retryReminderId = randomUUID()

  const rescheduleJobPendingId = randomUUID()
  const rescheduleJobQueuedId = randomUUID()
  const retryJobFailedId = randomUUID()

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
  const clinicBAt = new Date(baseDay)
  clinicBAt.setUTCHours(15, 0, 0, 0)

  const patientPhoneA = `+966520${String(suffix).slice(-6)}`
  const patientPhoneB = `+966521${String(suffix).slice(-6)}`

  evidence.fixtures = {
    authUserId,
    authEmailMasked: authEmail.replace(/^[^@]+/, '***'),
    clinicAId,
    clinicBId,
    confirmAppointmentId,
    cancelAppointmentId,
    rescheduleAppointmentId,
    retryJobFailedId,
    patientPhoneA,
  }

  try {
    await db.query(
      `insert into clinics (id, name, slug, timezone, "isActive", "subscriptionPlan", "createdAt", "updatedAt")
       values ($1, $2, $3, 'UTC', true, 'free', now(), now())`,
      [clinicAId, `Audit Verify Clinic A ${suffix}`, `audit-verify-a-${suffix}`]
    )

    await db.query(
      `insert into clinics (id, name, slug, timezone, "isActive", "subscriptionPlan", "createdAt", "updatedAt")
       values ($1, $2, $3, 'UTC', true, 'free', now(), now())`,
      [clinicBId, `Audit Verify Clinic B ${suffix}`, `audit-verify-b-${suffix}`]
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
      [membershipAId, authUserId, clinicAId]
    )

    await db.query(
      `insert into memberships (id, "userId", "clinicId", role, "isActive", "createdAt", "updatedAt")
       values ($1, $2, $3, 'admin', true, now(), now())`,
      [membershipBId, authUserId, clinicBId]
    )

    await db.query(
      `insert into doctors (id, "clinicId", "firstName", "lastName", "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Audit', 'Doctor A', true, now(), now())`,
      [doctorAId, clinicAId]
    )

    await db.query(
      `insert into doctors (id, "clinicId", "firstName", "lastName", "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Audit', 'Doctor B', true, now(), now())`,
      [doctorBId, clinicBId]
    )

    await db.query(
      `insert into services (id, "clinicId", name, "durationMinutes", "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Audit Service A', 30, true, now(), now())`,
      [serviceAId, clinicAId]
    )

    await db.query(
      `insert into services (id, "clinicId", name, "durationMinutes", "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Audit Service B', 30, true, now(), now())`,
      [serviceBId, clinicBId]
    )

    await db.query(
      `insert into patients (id, "clinicId", "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Audit', 'Patient A', $3, true, now(), now())`,
      [patientAId, clinicAId, patientPhoneA]
    )

    await db.query(
      `insert into patients (id, "clinicId", "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Audit', 'Patient B', $3, true, now(), now())`,
      [patientBId, clinicBId, patientPhoneB]
    )

    await db.query(
      `insert into appointments (
        id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5, $6, 30, 'scheduled', 'audit verify confirm', $7, now(), now()
      )`,
      [confirmAppointmentId, clinicAId, patientAId, doctorAId, serviceAId, confirmAt.toISOString(), authUserId]
    )

    await db.query(
      `insert into appointments (
        id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5, $6, 30, 'scheduled', 'audit verify cancel', $7, now(), now()
      )`,
      [cancelAppointmentId, clinicAId, patientAId, doctorAId, serviceAId, cancelAt.toISOString(), authUserId]
    )

    await db.query(
      `insert into appointments (
        id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5, $6, 30, 'scheduled', 'audit verify reschedule', $7, now(), now()
      )`,
      [rescheduleAppointmentId, clinicAId, patientAId, doctorAId, serviceAId, rescheduleOriginalAt.toISOString(), authUserId]
    )

    await db.query(
      `insert into appointments (
        id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5, $6, 30, 'scheduled', 'audit verify retry', $7, now(), now()
      )`,
      [retryAppointmentId, clinicAId, patientAId, doctorAId, serviceAId, retryAt.toISOString(), authUserId]
    )

    await db.query(
      `insert into appointments (
        id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5, $6, 30, 'scheduled', 'audit verify clinic b control', $7, now(), now()
      )`,
      [clinicBAppointmentId, clinicBId, patientBId, doctorBId, serviceBId, clinicBAt.toISOString(), authUserId]
    )

    const scheduleA = new Date(rescheduleOriginalAt.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const scheduleB = new Date(rescheduleOriginalAt.getTime() - 3 * 60 * 60 * 1000).toISOString()
    const scheduleRetry = new Date(retryAt.getTime() - 2 * 60 * 60 * 1000).toISOString()

    await db.query(
      `insert into reminders (id, "clinicId", "appointmentId", type, template, "scheduledAt", status, "createdAt", "updatedAt")
       values ($1, $2, $3, 'whatsapp', 'appointment_reminder_24h', $4, 'pending', now(), now())`,
      [rescheduleReminderPendingId, clinicAId, rescheduleAppointmentId, scheduleA]
    )

    await db.query(
      `insert into reminders (id, "clinicId", "appointmentId", type, template, "scheduledAt", status, "createdAt", "updatedAt")
       values ($1, $2, $3, 'whatsapp', 'appointment_reminder_3h', $4, 'pending', now(), now())`,
      [rescheduleReminderQueuedId, clinicAId, rescheduleAppointmentId, scheduleB]
    )

    await db.query(
      `insert into reminders (id, "clinicId", "appointmentId", type, template, "scheduledAt", status, "createdAt", "updatedAt")
       values ($1, $2, $3, 'whatsapp', 'appointment_confirmation', $4, 'failed', now(), now())`,
      [retryReminderId, clinicAId, retryAppointmentId, scheduleRetry]
    )

    await db.query(
      `insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", status, "scheduledFor", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, 'whatsapp', $6, 'audit pending reschedule', 'pending', $7, now(), now())`,
      [rescheduleJobPendingId, clinicAId, rescheduleReminderPendingId, rescheduleAppointmentId, patientAId, patientPhoneA, scheduleA]
    )

    await db.query(
      `insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", status, "scheduledFor", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, 'whatsapp', $6, 'audit queued reschedule', 'queued', $7, now(), now())`,
      [rescheduleJobQueuedId, clinicAId, rescheduleReminderQueuedId, rescheduleAppointmentId, patientAId, patientPhoneA, scheduleB]
    )

    await db.query(
      `insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", provider, status, "errorMessage", "scheduledFor", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, 'whatsapp', $6, 'audit failed retry', 'twilio-whatsapp', 'failed', 'Temporary provider timeout while sending.', $7, now(), now())`,
      [retryJobFailedId, clinicAId, retryReminderId, retryAppointmentId, patientAId, patientPhoneA, scheduleRetry]
    )

    const confirmCall = await postJsonWithCookie(`/api/appointments/${confirmAppointmentId}/confirm`, cookieHeader, {})
    const cancelCall = await postJsonWithCookie(`/api/appointments/${cancelAppointmentId}/cancel`, cookieHeader, {})
    const rescheduleCall = await postJsonWithCookie(
      `/api/appointments/${rescheduleAppointmentId}/reschedule`,
      cookieHeader,
      { scheduledAt: rescheduleTargetAt.toISOString() }
    )
    const retryCall = await postJsonWithCookie(
      `/api/clinics/${clinicAId}/notification-jobs/${retryJobFailedId}/retry`,
      cookieHeader,
      {}
    )

    evidence.calls = {
      confirm: confirmCall,
      cancel: cancelCall,
      reschedule: rescheduleCall,
      retry: retryCall,
    }

    const appointmentStates = await db.query(
      `select id, status, "scheduledAt" from appointments where id in ($1, $2, $3) order by id`,
      [confirmAppointmentId, cancelAppointmentId, rescheduleAppointmentId]
    )

    const auditLogsClinicA = await db.query(
      `select "clinicId", "eventType", "userId", metadata, "createdAt"
       from escalation_logs
       where "clinicId" = $1
         and "eventType" like 'whatsapp_%'
       order by "createdAt" desc`,
      [clinicAId]
    )

    const auditLogsClinicB = await db.query(
      `select "clinicId", "eventType"
       from escalation_logs
       where "clinicId" = $1
         and "eventType" in (
           'whatsapp_operator_appointment_confirm',
           'whatsapp_operator_appointment_cancel',
           'whatsapp_operator_appointment_reschedule',
           'whatsapp_operator_notification_retry',
           'whatsapp_reschedule_reminders_regenerated',
           'whatsapp_reschedule_confirmation_dispatch'
         )`,
      [clinicBId]
    )

    const expectedRequiredEvents = [
      'whatsapp_operator_appointment_confirm',
      'whatsapp_operator_appointment_cancel',
      'whatsapp_operator_appointment_reschedule',
      'whatsapp_operator_notification_retry',
    ]

    const optionalPreferredEvents = [
      'whatsapp_reschedule_reminders_regenerated',
      'whatsapp_reschedule_confirmation_dispatch',
    ]

    const seenEvents = new Set(auditLogsClinicA.rows.map((row) => row.eventType))

    const requiredEventsPresent = expectedRequiredEvents.every((eventType) => seenEvents.has(eventType))
    const preferredEventsPresent = optionalPreferredEvents.some((eventType) => seenEvents.has(eventType))

    const actorIdsPresent = auditLogsClinicA.rows
      .filter((row) => expectedRequiredEvents.includes(row.eventType))
      .every((row) => {
        const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : null
        const actor = metadata && typeof metadata.actorUserId === 'string' ? metadata.actorUserId : null
        return row.userId === authUserId && actor === authUserId
      })

    const confirmState = appointmentStates.rows.find((row) => row.id === confirmAppointmentId)
    const cancelState = appointmentStates.rows.find((row) => row.id === cancelAppointmentId)
    const rescheduleState = appointmentStates.rows.find((row) => row.id === rescheduleAppointmentId)
    const rescheduleChangedFromOriginal =
      Boolean(rescheduleState?.scheduledAt)
      && new Date(rescheduleState.scheduledAt).getTime() !== rescheduleOriginalAt.getTime()

    evidence.audit = {
      clinicALogCount: auditLogsClinicA.rows.length,
      clinicBLogCount: auditLogsClinicB.rows.length,
      seenEventTypes: Array.from(seenEvents),
      requiredEventsPresent,
      preferredEventsPresent,
      actorIdsPresent,
      clinicScopingOk: auditLogsClinicB.rows.length === 0,
      confirmState,
      cancelState,
      rescheduleState,
      rescheduleChangedFromOriginal,
      rescheduleTargetIso: rescheduleTargetAt.toISOString(),
    }

    evidence.finalVerdict = {
      routeCallsSucceeded:
        confirmCall.status === 200
        && cancelCall.status === 200
        && rescheduleCall.status === 200
        && retryCall.status === 200,
      requiredAuditEventsWritten: requiredEventsPresent,
      actorAndClinicMetadataSafe: actorIdsPresent,
      clinicScopingSafe: auditLogsClinicB.rows.length === 0,
      statusRegressionCheck:
        confirmState?.status === 'confirmed'
        && cancelState?.status === 'cancelled'
        && rescheduleState?.status === 'scheduled'
        && rescheduleChangedFromOriginal,
      preferredEventsObserved: preferredEventsPresent,
    }
  } finally {
    await db.query(
      `delete from escalation_logs where "clinicId" in ($1, $2) and "eventType" like 'whatsapp_%'`,
      [clinicAId, clinicBId]
    ).catch(() => {})

    await db.query(
      `delete from notification_jobs where id in ($1, $2, $3)`,
      [rescheduleJobPendingId, rescheduleJobQueuedId, retryJobFailedId]
    ).catch(() => {})

    await db.query(
      `delete from reminders where id in ($1, $2, $3)`,
      [rescheduleReminderPendingId, rescheduleReminderQueuedId, retryReminderId]
    ).catch(() => {})

    await db.query(
      `delete from appointments where id in ($1, $2, $3, $4, $5)`,
      [confirmAppointmentId, cancelAppointmentId, rescheduleAppointmentId, retryAppointmentId, clinicBAppointmentId]
    ).catch(() => {})

    await db.query(
      `delete from memberships where id in ($1, $2)`,
      [membershipAId, membershipBId]
    ).catch(() => {})

    await db.query(
      `delete from patients where id in ($1, $2)`,
      [patientAId, patientBId]
    ).catch(() => {})

    await db.query(
      `delete from services where id in ($1, $2)`,
      [serviceAId, serviceBId]
    ).catch(() => {})

    await db.query(
      `delete from doctors where id in ($1, $2)`,
      [doctorAId, doctorBId]
    ).catch(() => {})

    await db.query(
      `delete from clinics where id in ($1, $2)`,
      [clinicAId, clinicBId]
    ).catch(() => {})

    await db.end()
  }

  evidence.finishedAt = nowIso()
  console.log(JSON.stringify(evidence, null, 2))
}

main().catch((error) => {
  console.error('[VERIFY_OPERATOR_AUDIT_ERROR]', error)
  process.exit(1)
})
