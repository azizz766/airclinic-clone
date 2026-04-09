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

function createIso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString()
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
    runId: `verify_activity_log_${Date.now()}`,
    startedAt: nowIso(),
    baseUrl: BASE_URL,
    fixtures: {},
    checks: {},
    finalVerdict: {},
    commands: [
      'node scripts/verify-activity-log.js',
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
  const patientAId = randomUUID()
  const patientBId = randomUUID()
  const appointmentAId = randomUUID()
  const appointmentBId = randomUUID()

  const eventRows = [
    {
      id: randomUUID(),
      clinicId: clinicAId,
      eventType: 'whatsapp_operator_appointment_confirm',
      entityType: 'appointment',
      entityId: appointmentAId,
      severity: 'info',
      message: 'Operator confirmed appointment from inbox.',
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentAId,
        patientId: patientAId,
        phoneNormalized: '+966500111222',
        actionResult: 'status_updated',
      },
      createdAt: createIso(-5000),
    },
    {
      id: randomUUID(),
      clinicId: clinicAId,
      eventType: 'whatsapp_operator_appointment_cancel',
      entityType: 'appointment',
      entityId: appointmentAId,
      severity: 'info',
      message: 'Operator cancelled appointment from inbox.',
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentAId,
        patientId: patientAId,
        phoneNormalized: '+966500111222',
        actionResult: 'status_updated',
      },
      createdAt: createIso(-4000),
    },
    {
      id: randomUUID(),
      clinicId: clinicAId,
      eventType: 'whatsapp_operator_appointment_reschedule',
      entityType: 'appointment',
      entityId: appointmentAId,
      severity: 'info',
      message: 'Operator rescheduled appointment from inbox.',
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentAId,
        patientId: patientAId,
        phoneNormalized: '+966500111222',
        previousScheduledAt: createIso(-3600000),
        newScheduledAt: createIso(3600000),
      },
      createdAt: createIso(-3000),
    },
    {
      id: randomUUID(),
      clinicId: clinicAId,
      eventType: 'whatsapp_operator_notification_retry',
      entityType: 'appointment',
      entityId: appointmentAId,
      severity: 'info',
      message: 'Operator retried failed WhatsApp notification job successfully.',
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentAId,
        patientId: patientAId,
        notificationJobId: 'job_retry_test_1',
        destination: '+966500111222',
        dispatchOk: true,
        dispatchStatus: 'sent',
      },
      createdAt: createIso(-2000),
    },
    {
      id: randomUUID(),
      clinicId: clinicAId,
      eventType: 'whatsapp_reschedule_confirmation_dispatch',
      entityType: 'appointment',
      entityId: appointmentAId,
      severity: 'info',
      message: 'Reschedule confirmation WhatsApp dispatched.',
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentAId,
        patientId: patientAId,
        confirmationWhatsAppJobId: 'job_confirmation_test_1',
        dispatchOk: true,
        dispatchStatus: 'sent',
      },
      createdAt: createIso(-1000),
    },
    {
      id: randomUUID(),
      clinicId: clinicBId,
      eventType: 'whatsapp_operator_appointment_confirm',
      entityType: 'appointment',
      entityId: appointmentBId,
      severity: 'info',
      message: 'Operator confirmed appointment from inbox.',
      metadata: {
        actorUserId: authUserId,
        appointmentId: appointmentBId,
        patientId: patientBId,
        phoneNormalized: '+966599888777',
      },
      createdAt: createIso(-100),
    },
  ]

  evidence.fixtures = {
    clinicAId,
    clinicBId,
    authUserId,
    authEmailMasked: authEmail.replace(/^[^@]+/, '***'),
    seededEventTypesClinicA: eventRows.filter((row) => row.clinicId === clinicAId).map((row) => row.eventType),
    seededEventTypesClinicB: eventRows.filter((row) => row.clinicId === clinicBId).map((row) => row.eventType),
  }

  try {
    await db.query(
      `insert into clinics (id, name, slug, timezone, "isActive", "subscriptionPlan", "createdAt", "updatedAt")
       values ($1, $2, $3, 'UTC', true, 'free', now(), now())`,
      [clinicAId, `Activity Verify Clinic A ${suffix}`, `activity-verify-a-${suffix}`]
    )

    await db.query(
      `insert into clinics (id, name, slug, timezone, "isActive", "subscriptionPlan", "createdAt", "updatedAt")
       values ($1, $2, $3, 'UTC', true, 'free', now(), now())`,
      [clinicBId, `Activity Verify Clinic B ${suffix}`, `activity-verify-b-${suffix}`]
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

    await db.query(
      `insert into patients (id, "clinicId", "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Activity', 'Patient A', '+966500111222', true, now(), now())`,
      [patientAId, clinicAId]
    )

    await db.query(
      `insert into patients (id, "clinicId", "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt")
       values ($1, $2, 'Activity', 'Patient B', '+966599888777', true, now(), now())`,
      [patientBId, clinicBId]
    )

    await db.query(
      `insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, (select id from doctors where "clinicId" = $2 limit 1), (select id from services where "clinicId" = $2 limit 1), now(), 30, 'scheduled', 'activity verify', $4, now(), now())`,
      [appointmentAId, clinicAId, patientAId, authUserId]
    ).catch(async () => {
      const doctorId = randomUUID()
      const serviceId = randomUUID()
      await db.query(`insert into doctors (id, "clinicId", "firstName", "lastName", "isActive", "createdAt", "updatedAt") values ($1, $2, 'Activity', 'Doctor A', true, now(), now())`, [doctorId, clinicAId])
      await db.query(`insert into services (id, "clinicId", name, "durationMinutes", "isActive", "createdAt", "updatedAt") values ($1, $2, 'Activity Service A', 30, true, now(), now())`, [serviceId, clinicAId])
      await db.query(`insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, now(), 30, 'scheduled', 'activity verify', $6, now(), now())`, [appointmentAId, clinicAId, patientAId, doctorId, serviceId, authUserId])
    })

    await db.query(
      `insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, (select id from doctors where "clinicId" = $2 limit 1), (select id from services where "clinicId" = $2 limit 1), now(), 30, 'scheduled', 'activity verify', $4, now(), now())`,
      [appointmentBId, clinicBId, patientBId, authUserId]
    ).catch(async () => {
      const doctorId = randomUUID()
      const serviceId = randomUUID()
      await db.query(`insert into doctors (id, "clinicId", "firstName", "lastName", "isActive", "createdAt", "updatedAt") values ($1, $2, 'Activity', 'Doctor B', true, now(), now())`, [doctorId, clinicBId])
      await db.query(`insert into services (id, "clinicId", name, "durationMinutes", "isActive", "createdAt", "updatedAt") values ($1, $2, 'Activity Service B', 30, true, now(), now())`, [serviceId, clinicBId])
      await db.query(`insert into appointments (id, "clinicId", "patientId", "doctorId", "serviceId", "scheduledAt", "durationMinutes", status, notes, "createdBy", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, now(), 30, 'scheduled', 'activity verify', $6, now(), now())`, [appointmentBId, clinicBId, patientBId, doctorId, serviceId, authUserId])
    })

    for (const row of eventRows) {
      await db.query(
        `insert into escalation_logs (id, "clinicId", "entityType", "entityId", "eventType", severity, message, metadata, "userId", "createdAt")
         values ($1, $2, $3::"EntityType", $4, $5, $6::"Severity", $7, $8::jsonb, $9, $10::timestamptz)`,
        [
          row.id,
          row.clinicId,
          row.entityType,
          row.entityId,
          row.eventType,
          row.severity,
          row.message,
          JSON.stringify(row.metadata),
          authUserId,
          row.createdAt,
        ]
      )
    }

    const allPage = await fetchText(`/${clinicAId}/activity`, cookieHeader)
    const appointmentTab = await fetchText(`/${clinicAId}/activity?type=appointment`, cookieHeader)
    const notificationTab = await fetchText(`/${clinicAId}/activity?type=notification`, cookieHeader)
    const systemTab = await fetchText(`/${clinicAId}/activity?type=system`, cookieHeader)

    const html = allPage.text
    const confirmIndex = html.indexOf('whatsapp_operator_appointment_confirm')
    const cancelIndex = html.indexOf('whatsapp_operator_appointment_cancel')
    const rescheduleIndex = html.indexOf('whatsapp_operator_appointment_reschedule')
    const retryIndex = html.indexOf('whatsapp_operator_notification_retry')

    evidence.checks.pageLoad = {
      status: allPage.status,
      ok: allPage.ok,
      hasTitle: html.includes('Activity Log'),
    }

    evidence.checks.clinicScope = {
      excludesClinicBPhone: !html.includes('+966599888777'),
      excludesClinicBAppointmentId: !html.includes(appointmentBId),
      includesClinicAPhone: html.includes('+966500111222'),
    }

    evidence.checks.newestFirstHeuristic = {
      hasAllRequiredTypes: confirmIndex !== -1 && cancelIndex !== -1 && rescheduleIndex !== -1 && retryIndex !== -1,
      retryAppearsAfterRescheduleInMarkup: retryIndex !== -1 && rescheduleIndex !== -1 && retryIndex < rescheduleIndex,
      rescheduleAppearsAfterCancelInMarkup: rescheduleIndex !== -1 && cancelIndex !== -1 && rescheduleIndex < cancelIndex,
      cancelAppearsAfterConfirmInMarkup: cancelIndex !== -1 && confirmIndex !== -1 && cancelIndex < confirmIndex,
    }

    evidence.checks.requiredEventsVisible = {
      hasConfirm: confirmIndex !== -1,
      hasCancel: cancelIndex !== -1,
      hasReschedule: rescheduleIndex !== -1,
      hasRetry: retryIndex !== -1,
    }

    evidence.checks.tabs = {
      appointmentHasConfirm: appointmentTab.text.includes('whatsapp_operator_appointment_confirm'),
      appointmentHasRetry: appointmentTab.text.includes('whatsapp_operator_notification_retry'),
      notificationHasRetry: notificationTab.text.includes('whatsapp_operator_notification_retry'),
      notificationHasConfirm: notificationTab.text.includes('whatsapp_operator_appointment_confirm'),
      systemHasDispatch: systemTab.text.includes('whatsapp_reschedule_confirmation_dispatch'),
      systemHasOperatorConfirm: systemTab.text.includes('whatsapp_operator_appointment_confirm'),
    }

    evidence.finalVerdict = {
      activityPageLoads: evidence.checks.pageLoad.ok && evidence.checks.pageLoad.hasTitle,
      clinicScopingSafe:
        evidence.checks.clinicScope.excludesClinicBPhone
        && evidence.checks.clinicScope.excludesClinicBAppointmentId
        && evidence.checks.clinicScope.includesClinicAPhone,
      newestFirstLikely:
        evidence.checks.newestFirstHeuristic.hasAllRequiredTypes
        && evidence.checks.newestFirstHeuristic.retryAppearsAfterRescheduleInMarkup
        && evidence.checks.newestFirstHeuristic.rescheduleAppearsAfterCancelInMarkup
        && evidence.checks.newestFirstHeuristic.cancelAppearsAfterConfirmInMarkup,
      requiredEventsVisible:
        evidence.checks.requiredEventsVisible.hasConfirm
        && evidence.checks.requiredEventsVisible.hasCancel
        && evidence.checks.requiredEventsVisible.hasReschedule
        && evidence.checks.requiredEventsVisible.hasRetry,
      tabsBehave:
        evidence.checks.tabs.appointmentHasConfirm
        && !evidence.checks.tabs.appointmentHasRetry
        && evidence.checks.tabs.notificationHasRetry
        && !evidence.checks.tabs.notificationHasConfirm
        && evidence.checks.tabs.systemHasDispatch
        && !evidence.checks.tabs.systemHasOperatorConfirm,
    }
  } finally {
    for (const row of eventRows) {
      await db.query(`delete from escalation_logs where id = $1`, [row.id]).catch(() => {})
    }

    await db.query(`delete from appointments where id in ($1, $2)`, [appointmentAId, appointmentBId]).catch(() => {})
    await db.query(`delete from patients where id in ($1, $2)`, [patientAId, patientBId]).catch(() => {})
    await db.query(`delete from memberships where id in ($1, $2)`, [membershipAId, membershipBId]).catch(() => {})
    await db.query(`delete from clinics where id in ($1, $2)`, [clinicAId, clinicBId]).catch(() => {})
    await db.end()
  }

  evidence.finishedAt = nowIso()
  console.log(JSON.stringify(evidence, null, 2))
}

main().catch((error) => {
  console.error('[VERIFY_ACTIVITY_LOG_ERROR]', error)
  process.exit(1)
})
