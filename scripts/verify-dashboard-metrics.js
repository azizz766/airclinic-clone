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

function extractTestIdValue(html, testId) {
  const regex = new RegExp(`data-testid="${testId}"[^>]*>([^<]+)<`)
  const match = html.match(regex)
  return match ? match[1].trim() : null
}

function parseIntSafe(value) {
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
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

async function fetchText(path, cookieHeader) {
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

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  const evidence = {
    runId: `verify_dashboard_metrics_${Date.now()}`,
    startedAt: nowIso(),
    baseUrl: BASE_URL,
    fixtures: {},
    expected: {},
    observed: {},
    checks: {},
    finalVerdict: {},
    commands: [
      'node scripts/verify-dashboard-metrics.js',
      'node scripts/verify-operator-audit.js',
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
  const membershipAId = randomUUID()
  const membershipBId = randomUUID()
  const doctorAId = randomUUID()
  const doctorBId = randomUUID()
  const serviceAId = randomUUID()
  const serviceBId = randomUUID()
  const patientAId = randomUUID()
  const patientBId = randomUUID()

  const appointmentIds = {
    scheduledUpcoming: randomUUID(),
    confirmedUpcoming: randomUUID(),
    confirmationPendingUpcoming: randomUUID(),
    cancelledFuture: randomUUID(),
    rescheduledPast: randomUUID(),
    clinicBControl: randomUUID(),
  }

  const notificationIds = {
    pending: randomUUID(),
    queued: randomUUID(),
    sentWhatsapp: randomUUID(),
    sentSms: randomUUID(),
    failedWhatsapp: randomUUID(),
    failedSms: randomUUID(),
    clinicBControl: randomUUID(),
  }

  const reminderIds = {
    pending: randomUUID(),
    queued: randomUUID(),
    sentWhatsapp: randomUUID(),
    sentSms: randomUUID(),
    failedWhatsapp: randomUUID(),
    failedSms: randomUUID(),
    clinicBControl: randomUUID(),
  }

  const now = new Date()
  const future1h = new Date(now.getTime() + 60 * 60 * 1000)
  const future2h = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const future3h = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  const future4h = new Date(now.getTime() + 4 * 60 * 60 * 1000)
  const past2h = new Date(now.getTime() - 2 * 60 * 60 * 1000)

  const activityRows = [
    {
      id: randomUUID(),
      clinicId: clinicAId,
      eventType: 'whatsapp_operator_appointment_confirm',
      entityType: 'appointment',
      entityId: appointmentIds.confirmedUpcoming,
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentIds.confirmedUpcoming,
        patientId: patientAId,
      },
    },
    {
      id: randomUUID(),
      clinicId: clinicAId,
      eventType: 'whatsapp_operator_appointment_confirm',
      entityType: 'appointment',
      entityId: appointmentIds.scheduledUpcoming,
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentIds.scheduledUpcoming,
        patientId: patientAId,
      },
    },
    {
      id: randomUUID(),
      clinicId: clinicAId,
      eventType: 'whatsapp_operator_appointment_cancel',
      entityType: 'appointment',
      entityId: appointmentIds.cancelledFuture,
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentIds.cancelledFuture,
        patientId: patientAId,
      },
    },
    {
      id: randomUUID(),
      clinicId: clinicAId,
      eventType: 'whatsapp_operator_appointment_reschedule',
      entityType: 'appointment',
      entityId: appointmentIds.rescheduledPast,
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentIds.rescheduledPast,
        patientId: patientAId,
        previousScheduledAt: past2h.toISOString(),
        newScheduledAt: future3h.toISOString(),
      },
    },
    {
      id: randomUUID(),
      clinicId: clinicAId,
      eventType: 'whatsapp_operator_notification_retry',
      entityType: 'appointment',
      entityId: appointmentIds.confirmedUpcoming,
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentIds.confirmedUpcoming,
        patientId: patientAId,
        notificationJobId: 'dashboard_retry_job_1',
      },
    },
    {
      id: randomUUID(),
      clinicId: clinicAId,
      eventType: 'whatsapp_operator_notification_retry',
      entityType: 'appointment',
      entityId: appointmentIds.confirmationPendingUpcoming,
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentIds.confirmationPendingUpcoming,
        patientId: patientAId,
        notificationJobId: 'dashboard_retry_job_2',
      },
    },
    {
      id: randomUUID(),
      clinicId: clinicAId,
      eventType: 'whatsapp_reschedule_confirmation_dispatch',
      entityType: 'appointment',
      entityId: appointmentIds.rescheduledPast,
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentIds.rescheduledPast,
        patientId: patientAId,
      },
    },
    {
      id: randomUUID(),
      clinicId: clinicBId,
      eventType: 'whatsapp_operator_notification_retry',
      entityType: 'appointment',
      entityId: appointmentIds.clinicBControl,
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentIds.clinicBControl,
        patientId: patientBId,
        notificationJobId: 'B_SCOPE_ONLY',
      },
    },
  ]

  evidence.fixtures = {
    clinicAId,
    clinicBId,
    authUserId,
    authEmailMasked: authEmail.replace(/^[^@]+/, '***'),
  }

  evidence.expected = {
    upcomingAppointments: 3,
    confirmedAppointments: 1,
    cancelledAppointments: 1,
    rescheduledAppointments: 1,
    confirmationPendingAppointments: 1,
    totalNotificationJobs: 6,
    pendingQueuedNotificationJobs: 2,
    sentNotificationJobs: 2,
    failedNotificationJobs: 2,
    recentRetryCount: 2,
    recentConfirmCount: 2,
    recentCancelCount: 1,
    recentRescheduleCount: 1,
    whatsappSuccessRate: '50%',
  }

  try {
    await db.query(
      `insert into clinics (id, name, slug, timezone, "isActive", "subscriptionPlan", "createdAt", "updatedAt")
       values ($1, $2, $3, 'UTC', true, 'free', now(), now())`,
      [clinicAId, `Dashboard Verify Clinic A ${suffix}`, `dashboard-verify-a-${suffix}`]
    )

    await db.query(
      `insert into clinics (id, name, slug, timezone, "isActive", "subscriptionPlan", "createdAt", "updatedAt")
       values ($1, $2, $3, 'UTC', true, 'free', now(), now())`,
      [clinicBId, `Dashboard Verify Clinic B ${suffix}`, `dashboard-verify-b-${suffix}`]
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
      `insert into memberships (id, "userId", "clinicId", role, "isActive", "createdAt", "updatedAt")
       values ($1, $2, $3, 'staff', true, now(), now())`,
      [membershipBId, authUserId, clinicBId]
    )

    await db.query(`insert into doctors (id, "clinicId", "firstName", "lastName", "isActive", "createdAt", "updatedAt") values ($1, $2, 'Dash', 'Doctor A', true, now(), now())`, [doctorAId, clinicAId])
    await db.query(`insert into doctors (id, "clinicId", "firstName", "lastName", "isActive", "createdAt", "updatedAt") values ($1, $2, 'Dash', 'Doctor B', true, now(), now())`, [doctorBId, clinicBId])

    await db.query(`insert into services (id, "clinicId", name, "durationMinutes", "isActive", "createdAt", "updatedAt") values ($1, $2, 'Dash Service A', 30, true, now(), now())`, [serviceAId, clinicAId])
    await db.query(`insert into services (id, "clinicId", name, "durationMinutes", "isActive", "createdAt", "updatedAt") values ($1, $2, 'Dash Service B', 30, true, now(), now())`, [serviceBId, clinicBId])

    await db.query(`insert into patients (id, "clinicId", "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt") values ($1, $2, 'Dash', 'Patient A', '+966555100001', true, now(), now())`, [patientAId, clinicAId])
    await db.query(`insert into patients (id, "clinicId", "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt") values ($1, $2, 'Dash', 'Patient B', '+966555100002', true, now(), now())`, [patientBId, clinicBId])

    await db.query(`insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, $6, 30, 'scheduled', 'dash scheduled upcoming', $7, now(), now())`, [appointmentIds.scheduledUpcoming, clinicAId, patientAId, doctorAId, serviceAId, future1h.toISOString(), authUserId])
    await db.query(`insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, $6, 30, 'confirmed', 'dash confirmed upcoming', $7, now(), now())`, [appointmentIds.confirmedUpcoming, clinicAId, patientAId, doctorAId, serviceAId, future2h.toISOString(), authUserId])
    await db.query(`insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, $6, 30, 'confirmation_pending', 'dash pending upcoming', $7, now(), now())`, [appointmentIds.confirmationPendingUpcoming, clinicAId, patientAId, doctorAId, serviceAId, future3h.toISOString(), authUserId])
    await db.query(`insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, $6, 30, 'cancelled', 'dash cancelled', $7, now(), now())`, [appointmentIds.cancelledFuture, clinicAId, patientAId, doctorAId, serviceAId, future4h.toISOString(), authUserId])
    await db.query(`insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, $6, 30, 'rescheduled', 'dash rescheduled', $7, now(), now())`, [appointmentIds.rescheduledPast, clinicAId, patientAId, doctorAId, serviceAId, past2h.toISOString(), authUserId])
    await db.query(`insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, now(), 30, 'confirmed', 'dash clinic b control', $6, now(), now())`, [appointmentIds.clinicBControl, clinicBId, patientBId, doctorBId, serviceBId, authUserId])

    await db.query(`insert into reminders (id, "clinicId", "appointmentId", type, "scheduledAt", status, "createdAt", "updatedAt") values ($1, $2, $3, 'whatsapp', now(), 'pending', now(), now())`, [reminderIds.pending, clinicAId, appointmentIds.scheduledUpcoming])
    await db.query(`insert into reminders (id, "clinicId", "appointmentId", type, "scheduledAt", status, "createdAt", "updatedAt") values ($1, $2, $3, 'whatsapp', now(), 'pending', now(), now())`, [reminderIds.queued, clinicAId, appointmentIds.confirmedUpcoming])
    await db.query(`insert into reminders (id, "clinicId", "appointmentId", type, "scheduledAt", status, "createdAt", "updatedAt") values ($1, $2, $3, 'whatsapp', now(), 'sent', now(), now())`, [reminderIds.sentWhatsapp, clinicAId, appointmentIds.confirmedUpcoming])
    await db.query(`insert into reminders (id, "clinicId", "appointmentId", type, "scheduledAt", status, "createdAt", "updatedAt") values ($1, $2, $3, 'sms', now(), 'sent', now(), now())`, [reminderIds.sentSms, clinicAId, appointmentIds.scheduledUpcoming])
    await db.query(`insert into reminders (id, "clinicId", "appointmentId", type, "scheduledAt", status, "createdAt", "updatedAt") values ($1, $2, $3, 'whatsapp', now(), 'failed', now(), now())`, [reminderIds.failedWhatsapp, clinicAId, appointmentIds.rescheduledPast])
    await db.query(`insert into reminders (id, "clinicId", "appointmentId", type, "scheduledAt", status, "createdAt", "updatedAt") values ($1, $2, $3, 'sms', now(), 'failed', now(), now())`, [reminderIds.failedSms, clinicAId, appointmentIds.cancelledFuture])
    await db.query(`insert into reminders (id, "clinicId", "appointmentId", type, "scheduledAt", status, "createdAt", "updatedAt") values ($1, $2, $3, 'whatsapp', now(), 'failed', now(), now())`, [reminderIds.clinicBControl, clinicBId, appointmentIds.clinicBControl])

    await db.query(`insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", status, "scheduledFor", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, 'whatsapp', '+966555100001', 'pending', 'pending', now(), now(), now())`, [notificationIds.pending, clinicAId, reminderIds.pending, appointmentIds.scheduledUpcoming, patientAId])
    await db.query(`insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", status, "scheduledFor", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, 'whatsapp', '+966555100001', 'queued', 'queued', now(), now(), now())`, [notificationIds.queued, clinicAId, reminderIds.queued, appointmentIds.confirmedUpcoming, patientAId])
    await db.query(`insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", status, "scheduledFor", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, 'whatsapp', '+966555100001', 'sent', 'sent', now(), now(), now())`, [notificationIds.sentWhatsapp, clinicAId, reminderIds.sentWhatsapp, appointmentIds.confirmedUpcoming, patientAId])
    await db.query(`insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", status, "scheduledFor", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, 'sms', '+966555100001', 'sent', 'sent', now(), now(), now())`, [notificationIds.sentSms, clinicAId, reminderIds.sentSms, appointmentIds.scheduledUpcoming, patientAId])
    await db.query(`insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", status, "scheduledFor", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, 'whatsapp', '+966555100001', 'failed', 'failed', now(), now(), now())`, [notificationIds.failedWhatsapp, clinicAId, reminderIds.failedWhatsapp, appointmentIds.rescheduledPast, patientAId])
    await db.query(`insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", status, "scheduledFor", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, 'sms', '+966555100001', 'failed', 'failed', now(), now(), now())`, [notificationIds.failedSms, clinicAId, reminderIds.failedSms, appointmentIds.cancelledFuture, patientAId])
    await db.query(`insert into notification_jobs (id, "clinicId", "reminderId", "appointmentId", "patientId", channel, destination, "messageBody", status, "scheduledFor", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, 'whatsapp', '+966555100002', 'failed b', 'failed', now(), now(), now())`, [notificationIds.clinicBControl, clinicBId, reminderIds.clinicBControl, appointmentIds.clinicBControl, patientBId])

    for (const row of activityRows) {
      await db.query(
        `insert into escalation_logs (id, "clinicId", "entityType", "entityId", "eventType", severity, message, metadata, "userId", "createdAt")
         values ($1, $2, $3::"EntityType", $4, $5, 'info'::"Severity", $6, $7::jsonb, $8, now())`,
        [
          row.id,
          row.clinicId,
          row.entityType,
          row.entityId,
          row.eventType,
          row.eventType,
          JSON.stringify(row.metadata),
          authUserId,
        ]
      )
    }

    const page = await fetchText(`/${clinicAId}/dashboard?window=7d`, cookieHeader)

    evidence.observed = {
      pageStatus: page.status,
      metricUpcomingAppointments: parseIntSafe(extractTestIdValue(page.text, 'metric-upcoming-appointments')),
      metricConfirmedAppointments: parseIntSafe(extractTestIdValue(page.text, 'metric-confirmed-appointments')),
      metricCancelledAppointments: parseIntSafe(extractTestIdValue(page.text, 'metric-cancelled-appointments')),
      metricRescheduledAppointments: parseIntSafe(extractTestIdValue(page.text, 'metric-rescheduled-appointments')),
      metricConfirmationPendingAppointments: parseIntSafe(extractTestIdValue(page.text, 'metric-confirmation-pending-appointments')),
      metricTotalNotificationJobs: parseIntSafe(extractTestIdValue(page.text, 'metric-total-notification-jobs')),
      metricPendingQueuedJobs: parseIntSafe(extractTestIdValue(page.text, 'metric-pending-queued-notification-jobs')),
      metricSentJobs: parseIntSafe(extractTestIdValue(page.text, 'metric-sent-notification-jobs')),
      metricFailedJobs: parseIntSafe(extractTestIdValue(page.text, 'metric-failed-notification-jobs')),
      metricRecentRetryCount: parseIntSafe(extractTestIdValue(page.text, 'metric-recent-retry-count')),
      metricRecentConfirmCount: parseIntSafe(extractTestIdValue(page.text, 'metric-recent-confirm-count')),
      metricRecentCancelCount: parseIntSafe(extractTestIdValue(page.text, 'metric-recent-cancel-count')),
      metricRecentRescheduleCount: parseIntSafe(extractTestIdValue(page.text, 'metric-recent-reschedule-count')),
      metricOpsRetryCount: parseIntSafe(extractTestIdValue(page.text, 'metric-recent-retry-count-ops')),
      metricWhatsAppSuccessRate: extractTestIdValue(page.text, 'metric-whatsapp-success-rate'),
      hasRecentFeed: page.text.includes('dashboard-recent-activity-feed'),
      hasConfirmEventLabel: page.text.includes('Appointment confirmed'),
      hasRetryEventLabel: page.text.includes('Notification retried'),
      excludesClinicBScopeMarker: !page.text.includes('B_SCOPE_ONLY'),
    }

    evidence.checks = {
      pageLoads: page.ok && page.status === 200,
      clinicScoped: evidence.observed.excludesClinicBScopeMarker,
      appointmentCountsCorrect:
        evidence.observed.metricUpcomingAppointments === evidence.expected.upcomingAppointments
        && evidence.observed.metricConfirmedAppointments === evidence.expected.confirmedAppointments
        && evidence.observed.metricCancelledAppointments === evidence.expected.cancelledAppointments
        && evidence.observed.metricRescheduledAppointments === evidence.expected.rescheduledAppointments
        && evidence.observed.metricConfirmationPendingAppointments === evidence.expected.confirmationPendingAppointments,
      notificationCountsCorrect:
        evidence.observed.metricTotalNotificationJobs === evidence.expected.totalNotificationJobs
        && evidence.observed.metricPendingQueuedJobs === evidence.expected.pendingQueuedNotificationJobs
        && evidence.observed.metricSentJobs === evidence.expected.sentNotificationJobs
        && evidence.observed.metricFailedJobs === evidence.expected.failedNotificationJobs
        && evidence.observed.metricRecentRetryCount === evidence.expected.recentRetryCount
        && evidence.observed.metricWhatsAppSuccessRate === evidence.expected.whatsappSuccessRate,
      recentActivityVisible:
        evidence.observed.hasRecentFeed
        && evidence.observed.hasConfirmEventLabel
        && evidence.observed.hasRetryEventLabel
        && evidence.observed.metricRecentConfirmCount === evidence.expected.recentConfirmCount
        && evidence.observed.metricRecentCancelCount === evidence.expected.recentCancelCount
        && evidence.observed.metricRecentRescheduleCount === evidence.expected.recentRescheduleCount
        && evidence.observed.metricOpsRetryCount === evidence.expected.recentRetryCount,
    }

    evidence.finalVerdict = {
      dashboardMetricsSafe:
        evidence.checks.pageLoads
        && evidence.checks.clinicScoped
        && evidence.checks.appointmentCountsCorrect
        && evidence.checks.notificationCountsCorrect
        && evidence.checks.recentActivityVisible,
    }
  } finally {
    for (const row of activityRows) {
      await db.query(`delete from escalation_logs where id = $1`, [row.id]).catch(() => {})
    }

    await db.query(`delete from notification_jobs where id in ($1, $2, $3, $4, $5, $6, $7)`, [notificationIds.pending, notificationIds.queued, notificationIds.sentWhatsapp, notificationIds.sentSms, notificationIds.failedWhatsapp, notificationIds.failedSms, notificationIds.clinicBControl]).catch(() => {})
    await db.query(`delete from reminders where id in ($1, $2, $3, $4, $5, $6, $7)`, [reminderIds.pending, reminderIds.queued, reminderIds.sentWhatsapp, reminderIds.sentSms, reminderIds.failedWhatsapp, reminderIds.failedSms, reminderIds.clinicBControl]).catch(() => {})
    await db.query(`delete from appointments where id in ($1, $2, $3, $4, $5, $6)`, [appointmentIds.scheduledUpcoming, appointmentIds.confirmedUpcoming, appointmentIds.confirmationPendingUpcoming, appointmentIds.cancelledFuture, appointmentIds.rescheduledPast, appointmentIds.clinicBControl]).catch(() => {})
    await db.query(`delete from patients where id in ($1, $2)`, [patientAId, patientBId]).catch(() => {})
    await db.query(`delete from services where id in ($1, $2)`, [serviceAId, serviceBId]).catch(() => {})
    await db.query(`delete from doctors where id in ($1, $2)`, [doctorAId, doctorBId]).catch(() => {})
    await db.query(`delete from memberships where id in ($1, $2)`, [membershipAId, membershipBId]).catch(() => {})
    await db.query(`delete from clinics where id in ($1, $2)`, [clinicAId, clinicBId]).catch(() => {})
    await db.end()
  }

  evidence.finishedAt = nowIso()
  console.log(JSON.stringify(evidence, null, 2))
}

main().catch((error) => {
  console.error('[VERIFY_DASHBOARD_METRICS_ERROR]', error)
  process.exit(1)
})
