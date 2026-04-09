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

async function fetchTextWithCookie(path, cookieHeader) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    signal: AbortSignal.timeout(30000),
    headers: {
      cookie: cookieHeader,
    },
  })

  const text = await response.text()

  return {
    status: response.status,
    ok: response.ok,
    text,
  }
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
  const runId = `verify_notification_center_${Date.now()}`
  const startedAt = nowIso()
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  const evidence = {
    runId,
    startedAt,
    baseUrl: BASE_URL,
    fixtures: {},
    cases: {},
    finalVerdict: {},
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
  const appointmentAId = randomUUID()
  const appointmentBId = randomUUID()

  const reminderPendingId = randomUUID()
  const reminderQueuedId = randomUUID()
  const reminderSentId = randomUUID()
  const reminderFailedRetryableId = randomUUID()
  const reminderInvalidatedId = randomUUID()
  const reminderClinicBId = randomUUID()

  const jobPendingId = randomUUID()
  const jobQueuedId = randomUUID()
  const jobSentId = randomUUID()
  const jobFailedRetryableId = randomUUID()
  const jobFailedInvalidatedId = randomUUID()
  const jobClinicBId = randomUUID()

  const baseDay = nextWeekdayAtUtc(1, 0, 0)
  const appointmentAtA = new Date(baseDay)
  appointmentAtA.setUTCHours(12, 0, 0, 0)
  const appointmentAtB = new Date(baseDay)
  appointmentAtB.setUTCHours(13, 0, 0, 0)

  const destinationPending = `+966510${String(suffix).slice(-6)}`
  const destinationQueued = `+966511${String(suffix).slice(-6)}`
  const destinationSent = `+966512${String(suffix).slice(-6)}`
  const destinationFailedRetryable = `+966513${String(suffix).slice(-6)}`
  const destinationFailedInvalidated = `+966514${String(suffix).slice(-6)}`
  const destinationClinicB = `+966515${String(suffix).slice(-6)}`

  evidence.fixtures = {
    authUserId,
    authEmailMasked: authEmail.replace(/^[^@]+/, '***'),
    clinicAId,
    clinicBId,
    jobFailedRetryableId,
    destinationPending,
    destinationQueued,
    destinationSent,
    destinationFailedRetryable,
    destinationFailedInvalidated,
    destinationClinicB,
  }

  try {
    await db.query(
      `insert into clinics (id, name, slug, timezone, "isActive", "subscriptionPlan", "createdAt", "updatedAt")
       values ($1, $2, $3, 'UTC', true, 'free', now(), now())`,
      [clinicAId, `Notify Verify Clinic A ${suffix}`, `notify-verify-clinic-a-${suffix}`]
    )

    await db.query(
      `insert into clinics (id, name, slug, timezone, "isActive", "subscriptionPlan", "createdAt", "updatedAt")
       values ($1, $2, $3, 'UTC', true, 'free', now(), now())`,
      [clinicBId, `Notify Verify Clinic B ${suffix}`, `notify-verify-clinic-b-${suffix}`]
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
       values ($1, $2, 'Notify', 'Doctor A', true, now(), now())`,
      [doctorAId, clinicAId]
    )

    await db.query(
      `insert into doctors (id, "clinicId", "firstName", "lastName", "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Notify', 'Doctor B', true, now(), now())`,
      [doctorBId, clinicBId]
    )

    await db.query(
      `insert into services (id, "clinicId", name, "durationMinutes", "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Notify Service A', 30, true, now(), now())`,
      [serviceAId, clinicAId]
    )

    await db.query(
      `insert into services (id, "clinicId", name, "durationMinutes", "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Notify Service B', 30, true, now(), now())`,
      [serviceBId, clinicBId]
    )

    await db.query(
      `insert into patients (id, "clinicId", "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Notify', 'Patient A', $3, true, now(), now())`,
      [patientAId, clinicAId, destinationPending]
    )

    await db.query(
      `insert into patients (id, "clinicId", "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Notify', 'Patient B', $3, true, now(), now())`,
      [patientBId, clinicBId, destinationClinicB]
    )

    await db.query(
      `insert into appointments (
        id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5, $6, 30, 'scheduled', 'notification center verify', $7, now(), now()
      )`,
      [appointmentAId, clinicAId, patientAId, doctorAId, serviceAId, appointmentAtA.toISOString(), authUserId]
    )

    await db.query(
      `insert into appointments (
        id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5, $6, 30, 'scheduled', 'notification center verify clinic b', $7, now(), now()
      )`,
      [appointmentBId, clinicBId, patientBId, doctorBId, serviceBId, appointmentAtB.toISOString(), authUserId]
    )

    const scheduledBaseMs = Date.now() + 30 * 60 * 1000
    const schedulePending = new Date(scheduledBaseMs).toISOString()
    const scheduleQueued = new Date(scheduledBaseMs + 60 * 1000).toISOString()
    const scheduleSent = new Date(scheduledBaseMs + 2 * 60 * 1000).toISOString()
    const scheduleRetryable = new Date(scheduledBaseMs + 3 * 60 * 1000).toISOString()
    const scheduleInvalidated = new Date(scheduledBaseMs + 4 * 60 * 1000).toISOString()
    const scheduleClinicB = new Date(scheduledBaseMs + 5 * 60 * 1000).toISOString()

    await db.query(`insert into reminders (id, "clinicId", "appointmentId", type, template, "scheduledAt", status, "createdAt", "updatedAt") values ($1, $2, $3, 'whatsapp', 'appointment_reminder_24h', $4, 'pending', now(), now())`, [reminderPendingId, clinicAId, appointmentAId, schedulePending])
    await db.query(`insert into reminders (id, "clinicId", "appointmentId", type, template, "scheduledAt", status, "createdAt", "updatedAt") values ($1, $2, $3, 'whatsapp', 'appointment_reminder_3h', $4, 'pending', now(), now())`, [reminderQueuedId, clinicAId, appointmentAId, scheduleQueued])
    await db.query(`insert into reminders (id, "clinicId", "appointmentId", type, template, "scheduledAt", status, "createdAt", "updatedAt") values ($1, $2, $3, 'whatsapp', 'appointment_confirmation', $4, 'sent', now(), now())`, [reminderSentId, clinicAId, appointmentAId, scheduleSent])
    await db.query(`insert into reminders (id, "clinicId", "appointmentId", type, template, "scheduledAt", status, "createdAt", "updatedAt") values ($1, $2, $3, 'whatsapp', 'appointment_confirmation', $4, 'failed', now(), now())`, [reminderFailedRetryableId, clinicAId, appointmentAId, scheduleRetryable])
    await db.query(`insert into reminders (id, "clinicId", "appointmentId", type, template, "scheduledAt", status, "createdAt", "updatedAt") values ($1, $2, $3, 'whatsapp', 'appointment_reminder_24h', $4, 'failed', now(), now())`, [reminderInvalidatedId, clinicAId, appointmentAId, scheduleInvalidated])
    await db.query(`insert into reminders (id, "clinicId", "appointmentId", type, template, "scheduledAt", status, "createdAt", "updatedAt") values ($1, $2, $3, 'whatsapp', 'appointment_reminder_24h', $4, 'sent', now(), now())`, [reminderClinicBId, clinicBId, appointmentBId, scheduleClinicB])

    await db.query(`insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", status, "scheduledFor", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, 'whatsapp', $6, 'pending body', 'pending', $7, now(), now())`, [jobPendingId, clinicAId, reminderPendingId, appointmentAId, patientAId, destinationPending, schedulePending])
    await db.query(`insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", status, "scheduledFor", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, 'whatsapp', $6, 'queued body', 'queued', $7, now(), now())`, [jobQueuedId, clinicAId, reminderQueuedId, appointmentAId, patientAId, destinationQueued, scheduleQueued])
    await db.query(`insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", provider, "providerMessageId", status, "scheduledFor", "sentAt", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, 'whatsapp', $6, 'sent body', 'twilio-whatsapp', 'sid_sent_verify', 'sent', $7, now(), now(), now())`, [jobSentId, clinicAId, reminderSentId, appointmentAId, patientAId, destinationSent, scheduleSent])
    await db.query(`insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", provider, status, "errorMessage", "scheduledFor", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, 'whatsapp', $6, 'failed body', 'twilio-whatsapp', 'failed', 'Temporary provider timeout while sending.', $7, now(), now())`, [jobFailedRetryableId, clinicAId, reminderFailedRetryableId, appointmentAId, patientAId, destinationFailedRetryable, scheduleRetryable])
    await db.query(`insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", provider, status, "errorMessage", "scheduledFor", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, 'whatsapp', $6, 'invalidated body', 'twilio-whatsapp', 'failed', 'Appointment was rescheduled from inbox. This job is no longer valid.', $7, now(), now())`, [jobFailedInvalidatedId, clinicAId, reminderInvalidatedId, appointmentAId, patientAId, destinationFailedInvalidated, scheduleInvalidated])
    await db.query(`insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", provider, "providerMessageId", status, "scheduledFor", "sentAt", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, 'whatsapp', $6, 'clinic b sent body', 'twilio-whatsapp', 'sid_b_sent_verify', 'sent', $7, now(), now(), now())`, [jobClinicBId, clinicBId, reminderClinicBId, appointmentBId, patientBId, destinationClinicB, scheduleClinicB])

    const pageAll = await fetchTextWithCookie(`/${clinicAId}/notifications`, cookieHeader)
    evidence.cases.case1_page_loads = {
      status: pageAll.status,
      containsTitle: pageAll.text.includes('Notification Center'),
      containsPendingDestination: pageAll.text.includes(destinationPending),
    }

    evidence.cases.case2_clinic_scope = {
      status: pageAll.status,
      containsClinicAJobs: pageAll.text.includes(destinationSent),
      excludesClinicBJobs: !pageAll.text.includes(destinationClinicB),
    }

    const pageActive = await fetchTextWithCookie(`/${clinicAId}/notifications?status=active`, cookieHeader)
    const pageSent = await fetchTextWithCookie(`/${clinicAId}/notifications?status=sent`, cookieHeader)
    const pageFailed = await fetchTextWithCookie(`/${clinicAId}/notifications?status=failed`, cookieHeader)

    evidence.cases.case3_filters = {
      active: {
        status: pageActive.status,
        includesPending: pageActive.text.includes(destinationPending),
        includesQueued: pageActive.text.includes(destinationQueued),
        excludesSent: !pageActive.text.includes(destinationSent),
        excludesFailed: !pageActive.text.includes(destinationFailedRetryable),
      },
      sent: {
        status: pageSent.status,
        includesSent: pageSent.text.includes(destinationSent),
        excludesPending: !pageSent.text.includes(destinationPending),
      },
      failed: {
        status: pageFailed.status,
        includesFailedRetryable: pageFailed.text.includes(destinationFailedRetryable),
        includesFailedInvalidated: pageFailed.text.includes(destinationFailedInvalidated),
        excludesPending: !pageFailed.text.includes(destinationPending),
      },
    }

    evidence.cases.case4_failed_error_visible = {
      failedPageStatus: pageFailed.status,
      hasRetryableErrorText: pageFailed.text.includes('Temporary provider timeout while sending.'),
      hasInvalidatedLabel: pageFailed.text.toLowerCase().includes('invalidated'),
    }

    const retryResponse = await postJsonWithCookie(
      `/api/clinics/${clinicAId}/notification-jobs/${jobFailedRetryableId}/retry`,
      cookieHeader,
      {}
    )

    const retriedJob = await db.query(
      `select id, status, "providerMessageId", "errorMessage", "sentAt" from notification_jobs where id = $1`,
      [jobFailedRetryableId]
    )

    evidence.cases.case5_retry = {
      routeResponse: retryResponse,
      retriedJobAfter: retriedJob.rows[0] ?? null,
      routeOk: retryResponse.status === 200 && retryResponse.ok,
      jobNoLongerFailed: retriedJob.rows[0] ? retriedJob.rows[0].status !== 'failed' : false,
    }

    evidence.finalVerdict = {
      notificationCenterSafe:
        evidence.cases.case1_page_loads.status === 200
        && evidence.cases.case1_page_loads.containsTitle
        && evidence.cases.case2_clinic_scope.excludesClinicBJobs
        && evidence.cases.case3_filters.active.includesPending
        && evidence.cases.case3_filters.active.includesQueued
        && evidence.cases.case3_filters.sent.includesSent
        && evidence.cases.case3_filters.failed.includesFailedRetryable
        && evidence.cases.case4_failed_error_visible.hasRetryableErrorText,
      retrySafeToUse:
        evidence.cases.case5_retry.routeOk
        && evidence.cases.case5_retry.jobNoLongerFailed,
    }
  } finally {
    await db.query(`delete from notification_jobs where id in ($1, $2, $3, $4, $5, $6)`, [jobPendingId, jobQueuedId, jobSentId, jobFailedRetryableId, jobFailedInvalidatedId, jobClinicBId]).catch(() => {})
    await db.query(`delete from reminders where id in ($1, $2, $3, $4, $5, $6)`, [reminderPendingId, reminderQueuedId, reminderSentId, reminderFailedRetryableId, reminderInvalidatedId, reminderClinicBId]).catch(() => {})
    await db.query(`delete from appointments where id in ($1, $2)`, [appointmentAId, appointmentBId]).catch(() => {})
    await db.query(`delete from memberships where id in ($1, $2)`, [membershipAId, membershipBId]).catch(() => {})
    await db.query(`delete from patients where id in ($1, $2)`, [patientAId, patientBId]).catch(() => {})
    await db.query(`delete from services where id in ($1, $2)`, [serviceAId, serviceBId]).catch(() => {})
    await db.query(`delete from doctors where id in ($1, $2)`, [doctorAId, doctorBId]).catch(() => {})
    await db.query(`delete from clinics where id in ($1, $2)`, [clinicAId, clinicBId]).catch(() => {})
    await db.end()
  }

  evidence.finishedAt = nowIso()
  console.log(JSON.stringify(evidence, null, 2))
}

main().catch((error) => {
  console.error('[VERIFY_NOTIFICATION_CENTER_ERROR]', error)
  process.exit(1)
})
