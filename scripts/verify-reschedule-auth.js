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

function formatDateTimeForUi(value) {
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildExpectedReminderTimes(scheduledAt) {
  const offsetsHours = [24, 3]
  const now = new Date()

  return offsetsHours
    .map((offsetHours) => new Date(scheduledAt.getTime() - offsetHours * 60 * 60 * 1000))
    .filter((candidate) => candidate.getTime() > now.getTime())
    .map((candidate) => candidate.toISOString())
}

function plusDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
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

async function fetchJsonWithCookie(path, cookieHeader, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      cookie: cookieHeader,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => null)

  return {
    status: response.status,
    ok: response.ok,
    payload,
  }
}

async function main() {
  const startedAt = nowIso()
  const runId = `verify_reschedule_${Date.now()}`
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  const evidence = {
    runId,
    startedAt,
    baseUrl: BASE_URL,
    fixtures: {},
    cases: {},
    commands: [
      'node scripts/verify-reschedule-auth.js',
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
  const clinicAId = randomUUID()
  const clinicBId = randomUUID()
  const doctorId = randomUUID()
  const serviceId = randomUUID()
  const patientId = randomUUID()
  const noPhonePatientId = randomUUID()
  const appointmentId = randomUUID()
  const noPhoneAppointmentId = randomUUID()
  const conflictAppointmentId = randomUUID()
  const disallowedAppointmentId = randomUUID()
  const reminderPendingId = randomUUID()
  const reminderQueuedId = randomUUID()
  const jobPendingId = randomUUID()
  const jobQueuedId = randomUUID()
  const membershipAId = randomUUID()
  const membershipBId = randomUUID()
  const escalationLogId = randomUUID()

  const baseDay = nextWeekdayAtUtc(1, 0, 0) // next Monday UTC midnight anchor
  const originalAt = new Date(baseDay)
  originalAt.setUTCHours(10, 0, 0, 0)
  const conflictAt = new Date(baseDay)
  conflictAt.setUTCHours(11, 0, 0, 0)
  const validRescheduleAt = new Date(baseDay)
  validRescheduleAt.setUTCHours(12, 0, 0, 0)
  const secondRescheduleAt = new Date(baseDay)
  secondRescheduleAt.setUTCHours(13, 0, 0, 0)
  const wrongClinicAttemptAt = new Date(baseDay)
  wrongClinicAttemptAt.setUTCHours(14, 0, 0, 0)
  const disallowedAttemptAt = new Date(baseDay)
  disallowedAttemptAt.setUTCHours(15, 0, 0, 0)
  const noPhoneOriginalAt = new Date(baseDay)
  noPhoneOriginalAt.setUTCHours(16, 0, 0, 0)
  const noPhoneRescheduleAt = new Date(baseDay)
  noPhoneRescheduleAt.setUTCHours(12, 30, 0, 0)

  const patientPhone = `+966500${String(suffix).slice(-6)}`

  evidence.fixtures = {
    authUserId,
    authEmailMasked: authEmail.replace(/^[^@]+/, '***'),
    clinicAId,
    clinicBId,
    doctorId,
    serviceId,
    patientId,
    noPhonePatientId,
    appointmentId,
    noPhoneAppointmentId,
    conflictAppointmentId,
    disallowedAppointmentId,
    originalAt: originalAt.toISOString(),
    validRescheduleAt: validRescheduleAt.toISOString(),
    secondRescheduleAt: secondRescheduleAt.toISOString(),
    conflictAt: conflictAt.toISOString(),
  }

  try {
    await db.query(
      `insert into clinics (id, name, slug, timezone, "isActive", "subscriptionPlan", "createdAt", "updatedAt")
       values ($1, $2, $3, 'UTC', true, 'free', now(), now())`,
      [clinicAId, `Verify Clinic A ${suffix}`, `verify-clinic-a-${suffix}`]
    )

    await db.query(
      `insert into clinics (id, name, slug, timezone, "isActive", "subscriptionPlan", "createdAt", "updatedAt")
       values ($1, $2, $3, 'UTC', true, 'free', now(), now())`,
      [clinicBId, `Verify Clinic B ${suffix}`, `verify-clinic-b-${suffix}`]
    )

    await db.query(
      `insert into users (id, email, "passwordHash", "createdAt", "updatedAt")
       values ($1, $2, '', now(), now())
       on conflict (id) do update set email = excluded.email`,
      [authUserId, authEmail]
    )

    await db.query(
      `insert into memberships (id, "userId", "clinicId", role, "isActive", "createdAt", "updatedAt")
       values ($1, $2, $3, 'staff', true, now(), now())`,
      [membershipAId, authUserId, clinicAId]
    )

    await db.query(
      `insert into doctors (id, "clinicId", "firstName", "lastName", "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Verify', 'Doctor', true, now(), now())`,
      [doctorId, clinicAId]
    )

    await db.query(
      `insert into services (id, "clinicId", name, "durationMinutes", "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Verify Service', 30, true, now(), now())`,
      [serviceId, clinicAId]
    )

    await db.query(
      `insert into patients (id, "clinicId", "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Verify', 'Patient', $3, true, now(), now())`,
      [patientId, clinicAId, patientPhone]
    )

    await db.query(
      `insert into patients (id, "clinicId", "firstName", "lastName", phone, email, "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'NoPhone', 'Patient', null, null, true, now(), now())`,
      [noPhonePatientId, clinicAId]
    )

    await db.query(
      `insert into appointments (
        id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5, $6, 30, 'scheduled', 'verify target', $7, now(), now()
      )`,
      [appointmentId, clinicAId, patientId, doctorId, serviceId, originalAt.toISOString(), authUserId]
    )

    await db.query(
      `insert into appointments (
        id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5, $6, 30, 'scheduled', 'verify no-phone target', $7, now(), now()
      )`,
      [noPhoneAppointmentId, clinicAId, noPhonePatientId, doctorId, serviceId, noPhoneOriginalAt.toISOString(), authUserId]
    )

    await db.query(
      `insert into appointments (
        id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5, $6, 30, 'scheduled', 'verify conflict blocker', $7, now(), now()
      )`,
      [conflictAppointmentId, clinicAId, patientId, doctorId, serviceId, conflictAt.toISOString(), authUserId]
    )

    await db.query(
      `insert into appointments (
        id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5, $6, 30, 'completed', 'verify disallowed', $7, now(), now()
      )`,
      [disallowedAppointmentId, clinicAId, patientId, doctorId, serviceId, disallowedAttemptAt.toISOString(), authUserId]
    )

    await db.query(
      `insert into reminders (id, "clinicId", "appointmentId", type, "scheduledAt", status, "createdAt", "updatedAt")
       values ($1, $2, $3, 'sms', $4, 'pending', now(), now())`,
      [reminderPendingId, clinicAId, appointmentId, plusDays(originalAt, -1).toISOString()]
    )

    await db.query(
      `insert into reminders (id, "clinicId", "appointmentId", type, "scheduledAt", status, "createdAt", "updatedAt")
       values ($1, $2, $3, 'whatsapp', $4, 'pending', now(), now())`,
      [reminderQueuedId, clinicAId, appointmentId, plusDays(originalAt, -1).toISOString()]
    )

    await db.query(
      `insert into notification_jobs (
        id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", status, "scheduledFor", "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5, 'sms', $6, 'pending verify job', 'pending', $7, now(), now()
      )`,
      [jobPendingId, clinicAId, reminderPendingId, appointmentId, patientId, patientPhone, plusDays(originalAt, -1).toISOString()]
    )

    await db.query(
      `insert into notification_jobs (
        id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", status, "scheduledFor", "createdAt", "updatedAt"
      ) values (
        $1, $2, $3, $4, $5, 'whatsapp', $6, 'queued verify job', 'queued', $7, now(), now()
      )`,
      [jobQueuedId, clinicAId, reminderQueuedId, appointmentId, patientId, patientPhone, plusDays(originalAt, -1).toISOString()]
    )

    await db.query(
      `insert into escalation_logs (
        id, "clinicId", "entityType", "entityId", "eventType", severity, message, metadata, "createdAt"
      ) values (
        $1, $2, 'system', $3, 'whatsapp_inbound_test', 'info', 'verify inbox conversation seed', $4::jsonb, now()
      )`,
      [
        escalationLogId,
        clinicAId,
        patientPhone,
        JSON.stringify({ phoneNormalized: patientPhone, messageBody: 'seed conversation for sidebar verification' }),
      ]
    )

    const beforeAppointment = await db.query(
      `select id, "scheduledAt", status, notes from appointments where id = $1`,
      [appointmentId]
    )

    const beforeJobs = await db.query(
      `select id, status, "errorMessage" from notification_jobs where "appointmentId" = $1 order by id`,
      [appointmentId]
    )

    const validResponse = await fetchJsonWithCookie(
      `/api/appointments/${appointmentId}/reschedule`,
      cookieHeader,
      { scheduledAt: validRescheduleAt.toISOString() }
    )

    const afterValidAppointment = await db.query(
      `select id, "scheduledAt", status, notes from appointments where id = $1`,
      [appointmentId]
    )

    const afterValidJobs = await db.query(
      `select id, status, "errorMessage", "scheduledFor", channel, destination, "reminderId"
       from notification_jobs
       where "appointmentId" = $1
       order by id`,
      [appointmentId]
    )

    const activeGeneratedJobsAfterValid = await db.query(
      `select j.id, j.status, j.channel, j.destination, j."scheduledFor", j."reminderId", r.template
       from notification_jobs j
       join reminders r on r.id = j."reminderId"
       where j."appointmentId" = $1
         and j.status in ('pending', 'queued')
         and r.template in ('appointment_reminder_24h', 'appointment_reminder_3h')
       order by j."scheduledFor" asc, j.id asc`,
      [appointmentId]
    )

    const persistedAfterValidScheduledAt = new Date(afterValidAppointment.rows[0].scheduledAt)
    const expectedGeneratedTimesAfterValid = buildExpectedReminderTimes(persistedAfterValidScheduledAt)
    const actualActiveGeneratedTimesAfterValid = activeGeneratedJobsAfterValid.rows
      .map((row) => new Date(row.scheduledFor).toISOString())
    const activeUniqueKeysAfterValid = new Set(
      activeGeneratedJobsAfterValid.rows.map((row) => `${new Date(row.scheduledFor).toISOString()}|${row.channel}|${row.destination}`)
    )

    evidence.cases.case1_valid_reschedule = {
      routeResponse: validResponse,
      beforeAppointment: beforeAppointment.rows[0],
      afterAppointment: afterValidAppointment.rows[0],
    }

    evidence.cases.case5_notification_invalidation = {
      beforeJobs: beforeJobs.rows,
      afterJobs: afterValidJobs.rows,
      seededJobIds: [jobPendingId, jobQueuedId],
      seededJobsBefore: beforeJobs.rows.filter((row) => row.id === jobPendingId || row.id === jobQueuedId),
      seededJobsAfter: afterValidJobs.rows.filter((row) => row.id === jobPendingId || row.id === jobQueuedId),
      seededInvalidated:
        afterValidJobs.rows
          .filter((row) => row.id === jobPendingId || row.id === jobQueuedId)
          .every((row) => row.status === 'failed'),
    }

    evidence.cases.case3_regenerated_jobs_for_new_time = {
      expectedGeneratedTimesAfterValid,
      actualActiveGeneratedTimesAfterValid,
      activeGeneratedJobsAfterValid: activeGeneratedJobsAfterValid.rows,
      hasExpectedTimes: expectedGeneratedTimesAfterValid.every((iso) => actualActiveGeneratedTimesAfterValid.includes(iso)),
      hasNoActiveDuplicatesByTimeChannelDestination:
        activeGeneratedJobsAfterValid.rows.length === activeUniqueKeysAfterValid.size,
    }

    const confirmationWhatsAppJobsAfterValid = await db.query(
      `select j.id, j.status, j.channel, j.destination, j."scheduledFor", j."sentAt", j."providerMessageId", j."messageBody", r.template
       from notification_jobs j
       join reminders r on r.id = j."reminderId"
       where j."appointmentId" = $1
         and r.template = 'appointment_confirmation'
         and j.channel = 'whatsapp'
       order by j."createdAt" desc`,
      [appointmentId]
    )

    const latestConfirmationWhatsAppJob = confirmationWhatsAppJobsAfterValid.rows[0] ?? null

    evidence.cases.case4_whatsapp_reschedule_confirmation = {
      totalConfirmationWhatsAppJobs: confirmationWhatsAppJobsAfterValid.rows.length,
      latestConfirmationWhatsAppJob,
      hasConfirmationWhatsAppJob: Boolean(latestConfirmationWhatsAppJob),
      deliveryState:
        latestConfirmationWhatsAppJob && ['queued', 'sent', 'failed'].includes(latestConfirmationWhatsAppJob.status)
          ? latestConfirmationWhatsAppJob.status
          : 'missing',
      bodyIncludesPatientName: latestConfirmationWhatsAppJob
        ? latestConfirmationWhatsAppJob.messageBody.includes('Verify Patient')
        : false,
      bodyIncludesDoctorName: latestConfirmationWhatsAppJob
        ? latestConfirmationWhatsAppJob.messageBody.includes('Verify Doctor')
        : false,
      bodyIncludesServiceName: latestConfirmationWhatsAppJob
        ? latestConfirmationWhatsAppJob.messageBody.includes('Verify Service')
        : false,
    }

    const conflictResponse = await fetchJsonWithCookie(
      `/api/appointments/${appointmentId}/reschedule`,
      cookieHeader,
      { scheduledAt: conflictAt.toISOString() }
    )

    const afterConflictAppointment = await db.query(
      `select id, "scheduledAt", status from appointments where id = $1`,
      [appointmentId]
    )

    evidence.cases.case2_conflict_blocked = {
      routeResponse: conflictResponse,
      appointmentAfterAttempt: afterConflictAppointment.rows[0],
    }

    await db.query(
      `update memberships set "isActive" = false, "updatedAt" = now() where id = $1`,
      [membershipAId]
    )

    await db.query(
      `insert into memberships (id, "userId", "clinicId", role, "isActive", "createdAt", "updatedAt")
       values ($1, $2, $3, 'staff', true, now(), now())`,
      [membershipBId, authUserId, clinicBId]
    )

    const wrongClinicResponse = await fetchJsonWithCookie(
      `/api/appointments/${appointmentId}/reschedule`,
      cookieHeader,
      { scheduledAt: wrongClinicAttemptAt.toISOString() }
    )

    evidence.cases.case3_wrong_clinic_blocked = {
      routeResponse: wrongClinicResponse,
    }

    await db.query(`delete from memberships where id = $1`, [membershipBId])
    await db.query(
      `update memberships set "isActive" = true, "updatedAt" = now() where id = $1`,
      [membershipAId]
    )

    const disallowedResponse = await fetchJsonWithCookie(
      `/api/appointments/${disallowedAppointmentId}/reschedule`,
      cookieHeader,
      { scheduledAt: plusDays(disallowedAttemptAt, 1).toISOString() }
    )

    const disallowedAfter = await db.query(
      `select id, "scheduledAt", status from appointments where id = $1`,
      [disallowedAppointmentId]
    )

    evidence.cases.case4_disallowed_status_blocked = {
      routeResponse: disallowedResponse,
      appointmentAfterAttempt: disallowedAfter.rows[0],
    }

    const secondRescheduleResponse = await fetchJsonWithCookie(
      `/api/appointments/${appointmentId}/reschedule`,
      cookieHeader,
      { scheduledAt: secondRescheduleAt.toISOString() }
    )

    const afterSecondAppointment = await db.query(
      `select id, "scheduledAt", status from appointments where id = $1`,
      [appointmentId]
    )

    const activeGeneratedJobsAfterSecond = await db.query(
      `select j.id, j.status, j.channel, j.destination, j."scheduledFor", j."reminderId", r.template
       from notification_jobs j
       join reminders r on r.id = j."reminderId"
       where j."appointmentId" = $1
         and j.status in ('pending', 'queued')
         and r.template in ('appointment_reminder_24h', 'appointment_reminder_3h')
       order by j."scheduledFor" asc, j.id asc`,
      [appointmentId]
    )

    const persistedAfterSecondScheduledAt = new Date(afterSecondAppointment.rows[0].scheduledAt)
    const expectedGeneratedTimesAfterSecond = buildExpectedReminderTimes(persistedAfterSecondScheduledAt)
    const actualActiveGeneratedTimesAfterSecond = activeGeneratedJobsAfterSecond.rows
      .map((row) => new Date(row.scheduledFor).toISOString())
    const activeUniqueKeysAfterSecond = new Set(
      activeGeneratedJobsAfterSecond.rows.map((row) => `${new Date(row.scheduledFor).toISOString()}|${row.channel}|${row.destination}`)
    )

    evidence.cases.case4_no_active_duplicate_jobs_on_repeat_reschedule = {
      routeResponse: secondRescheduleResponse,
      afterSecondAppointment: afterSecondAppointment.rows[0],
      expectedGeneratedTimesAfterSecond,
      actualActiveGeneratedTimesAfterSecond,
      activeGeneratedJobsAfterSecond: activeGeneratedJobsAfterSecond.rows,
      hasExpectedTimes: expectedGeneratedTimesAfterSecond.every((iso) => actualActiveGeneratedTimesAfterSecond.includes(iso)),
      hasNoActiveDuplicatesByTimeChannelDestination:
        activeGeneratedJobsAfterSecond.rows.length === activeUniqueKeysAfterSecond.size,
    }

    const noPhoneRescheduleResponse = await fetchJsonWithCookie(
      `/api/appointments/${noPhoneAppointmentId}/reschedule`,
      cookieHeader,
      { scheduledAt: noPhoneRescheduleAt.toISOString() }
    )

    const noPhoneAfterAppointment = await db.query(
      `select id, "scheduledAt", status from appointments where id = $1`,
      [noPhoneAppointmentId]
    )

    const noPhoneConfirmationWhatsAppJobs = await db.query(
      `select j.id, j.status, j.channel, r.template
       from notification_jobs j
       join reminders r on r.id = j."reminderId"
       where j."appointmentId" = $1
         and r.template = 'appointment_confirmation'
         and j.channel = 'whatsapp'`,
      [noPhoneAppointmentId]
    )

    evidence.cases.case5_missing_phone_safe = {
      routeResponse: noPhoneRescheduleResponse,
      appointmentAfterAttempt: noPhoneAfterAppointment.rows[0],
      noPhoneConfirmationWhatsAppJobs: noPhoneConfirmationWhatsAppJobs.rows,
      noPhoneConfirmationWhatsAppCount: noPhoneConfirmationWhatsAppJobs.rows.length,
    }

    // Isolate UI verification to the rescheduled appointment by removing the active conflict fixture.
    await db.query(
      `update appointments set status = 'cancelled', "updatedAt" = now() where id = $1`,
      [conflictAppointmentId]
    )

    const conversationKey = encodeURIComponent(patientPhone.toLowerCase())
    const inboxResponse = await fetch(
      `${BASE_URL}/${clinicAId}/inbox?conversation=${conversationKey}`,
      {
        signal: AbortSignal.timeout(30000),
        headers: {
          cookie: cookieHeader,
        },
      }
    )

    const inboxHtml = await inboxResponse.text()
    const expectedUiDateTime = formatDateTimeForUi(secondRescheduleAt)
    const dateTimeSectionIndex = inboxHtml.indexOf('Date/Time')
    const dateTimeSection = dateTimeSectionIndex === -1
      ? ''
      : inboxHtml.slice(dateTimeSectionIndex, dateTimeSectionIndex + 500)
    const renderedDateMatch = dateTimeSection.match(/(\d{2}\/\d{2}\/\d{4},\s\d{2}:\d{2}\s(?:AM|PM))/)
    const actualRenderedDateTime = renderedDateMatch ? renderedDateMatch[1] : null

    evidence.cases.case7_inbox_reflects_updated_time = {
      status: inboxResponse.status,
      actualRenderedDateTime,
      containsUpdatedUiDateTime: inboxHtml.includes(expectedUiDateTime),
      expectedUiDateTime,
      expectedIso: secondRescheduleAt.toISOString(),
      containsSidebarTitle: inboxHtml.includes('Patient Context'),
    }

    evidence.finalVerdict = {
      safeToClickReschedule:
        validResponse.ok
        && validResponse.status === 200
        && evidence.cases.case5_notification_invalidation.seededInvalidated
        && evidence.cases.case3_regenerated_jobs_for_new_time.hasExpectedTimes
        && evidence.cases.case3_regenerated_jobs_for_new_time.hasNoActiveDuplicatesByTimeChannelDestination
        && evidence.cases.case4_whatsapp_reschedule_confirmation.hasConfirmationWhatsAppJob
        && evidence.cases.case4_whatsapp_reschedule_confirmation.deliveryState !== 'missing'
        && evidence.cases.case5_missing_phone_safe.routeResponse.status === 200
        && evidence.cases.case5_missing_phone_safe.noPhoneConfirmationWhatsAppCount === 0
        && secondRescheduleResponse.status === 200
        && evidence.cases.case4_no_active_duplicate_jobs_on_repeat_reschedule.hasExpectedTimes
        && evidence.cases.case4_no_active_duplicate_jobs_on_repeat_reschedule.hasNoActiveDuplicatesByTimeChannelDestination
        && conflictResponse.status === 409
        && wrongClinicResponse.status === 404
        && disallowedResponse.status === 400
        && evidence.cases.case7_inbox_reflects_updated_time.status === 200
        && evidence.cases.case7_inbox_reflects_updated_time.containsUpdatedUiDateTime,
    }

  } finally {
    await db.query(`delete from notification_jobs where "appointmentId" in ($1, $2, $3, $4)`, [appointmentId, noPhoneAppointmentId, conflictAppointmentId, disallowedAppointmentId]).catch(() => {})
    await db.query(`delete from reminders where "appointmentId" in ($1, $2, $3, $4)`, [appointmentId, noPhoneAppointmentId, conflictAppointmentId, disallowedAppointmentId]).catch(() => {})
    await db.query(`delete from appointments where id in ($1, $2, $3, $4)`, [appointmentId, noPhoneAppointmentId, conflictAppointmentId, disallowedAppointmentId]).catch(() => {})
    await db.query(`delete from escalation_logs where id = $1`, [escalationLogId]).catch(() => {})
    await db.query(`delete from memberships where id in ($1, $2)`, [membershipAId, membershipBId]).catch(() => {})
    await db.query(`delete from patients where id in ($1, $2)`, [patientId, noPhonePatientId]).catch(() => {})
    await db.query(`delete from services where id = $1`, [serviceId]).catch(() => {})
    await db.query(`delete from doctors where id = $1`, [doctorId]).catch(() => {})
    await db.query(`delete from clinics where id in ($1, $2)`, [clinicAId, clinicBId]).catch(() => {})
    await db.end()
  }

  evidence.finishedAt = nowIso()
  console.log(JSON.stringify(evidence, null, 2))
}

main().catch((error) => {
  console.error('[VERIFY_RESCHEDULE_AUTH_ERROR]', error)
  process.exit(1)
})
