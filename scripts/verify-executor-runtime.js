#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * verify-executor-runtime.js
 *
 * Runtime integration tests T1–T10 for the scheduled job executor.
 * Connects to the live Supabase DB (DATABASE_URL) and the local dev server.
 *
 * Prerequisites:
 *   - .env has DATABASE_URL and WHATSAPP_DEV_MODE=true
 *   - .env.local has CRON_SECRET=test-local-cron-secret
 *   - Dev server is already running: npm run dev
 *
 * Run: node scripts/verify-executor-runtime.js
 *
 * Test cases:
 *   T1   GET health endpoint — no auth required
 *   T2   POST no Authorization header → 401
 *   T3   POST wrong Bearer token → 401
 *   T3b  SKIPPED (needs server restart with no secrets; verified via code review)
 *   T4   POST correct token → 200 success
 *   T5   Happy path: pending job processed → status=sent, providerMessageId set, Reminder synced, Appointment fields set
 *   T6   Stale-queued recovery: queued job with old updatedAt reset to pending and processed
 *   T7   clinicId scoping: ?clinicId=A only processes A's jobs; B's stay pending
 *   T8   Idempotency: second POST with no pending jobs returns jobsSent=0
 *   T9   Batch terminal exclusion: cancelled appointment job stays pending (not failed) after batch run
 *   T9b  SKIPPED (direct-path terminal failure via sendWhatsAppNotificationJob requires session auth
 *              on the only HTTP surface; covered by verify-executor.js mock tests groups B+F)
 *   T10  EscalationLog: phase=start and phase=end rows written with correct trigger/metadata
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

// ─── Env loader ───────────────────────────────────────────────────────────────

function loadEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch (_) {}
}

const ROOT = path.join(__dirname, '..')
loadEnvFile(path.join(ROOT, '.env'))
loadEnvFile(path.join(ROOT, '.env.local'))

const DATABASE_URL = process.env.DATABASE_URL
const CRON_SECRET = process.env.CRON_SECRET
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

if (!DATABASE_URL) {
  console.error('[error] DATABASE_URL not set in .env')
  process.exit(1)
}
if (!CRON_SECRET) {
  console.error('[error] CRON_SECRET not set — add CRON_SECRET=test-local-cron-secret to .env.local and restart the dev server')
  process.exit(1)
}

// ─── Reporter ─────────────────────────────────────────────────────────────────

let failures = 0
const results = {}

function pass(id, msg) {
  results[id] = 'PASS'
  console.log(`  PASS [${id}] ${msg}`)
}
function fail(id, msg) {
  results[id] = 'FAIL'
  failures++
  console.error(`  FAIL [${id}] ${msg}`)
}
function skip(id, msg) {
  results[id] = 'SKIP'
  console.log(`  SKIP [${id}] ${msg}`)
}

// ─── Predictable test IDs ─────────────────────────────────────────────────────

const T = {
  USER:       'test-exec-user-01',
  CLINIC_A:   'test-exec-clinic-a',
  CLINIC_B:   'test-exec-clinic-b',
  DOCTOR_A:   'test-exec-doctor-a',
  DOCTOR_B:   'test-exec-doctor-b',
  SERVICE_A:  'test-exec-service-a',
  SERVICE_B:  'test-exec-service-b',
  PATIENT_A:  'test-exec-patient-a',
  PATIENT_B:  'test-exec-patient-b',
  APPT_T5:    'test-exec-appt-t5',
  APPT_T6:    'test-exec-appt-t6',
  APPT_T7A:   'test-exec-appt-t7a',
  APPT_T7B:   'test-exec-appt-t7b',
  APPT_T8:    'test-exec-appt-t8',
  APPT_T9:    'test-exec-appt-t9',
  APPT_T9B:   'test-exec-appt-t9b',
  REM_T5:     'test-exec-rem-t5',
  REM_T6:     'test-exec-rem-t6',
  REM_T7A:    'test-exec-rem-t7a',
  REM_T7B:    'test-exec-rem-t7b',
  REM_T8:     'test-exec-rem-t8',
  REM_T9:     'test-exec-rem-t9',
  REM_T9B:    'test-exec-rem-t9b',
  JOB_T5:     'test-exec-job-t5',
  JOB_T6:     'test-exec-job-t6',
  JOB_T7A:    'test-exec-job-t7a',
  JOB_T7B:    'test-exec-job-t7b',
  JOB_T8:     'test-exec-job-t8',
  JOB_T9:     'test-exec-job-t9',
  JOB_T9B:    'test-exec-job-t9b',
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function apiGet(urlPath) {
  const res = await fetch(`${BASE_URL}${urlPath}`)
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

async function apiPost(urlPath, { token, clinicId } = {}) {
  const url = new URL(`${BASE_URL}${urlPath}`)
  if (clinicId) url.searchParams.set('clinicId', clinicId)
  const headers = { 'Content-Type': 'application/json' }
  if (token !== undefined) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(url.toString(), { method: 'POST', headers })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

let db

async function q(sql, params = []) {
  return db.query(sql, params)
}

async function getJob(id) {
  const r = await q(
    `SELECT id, status, "providerMessageId", "sentAt", "errorMessage", "updatedAt"
     FROM notification_jobs WHERE id = $1`,
    [id]
  )
  return r.rows[0] || null
}

async function getReminder(id) {
  const r = await q(
    `SELECT id, status, "sentAt" FROM reminders WHERE id = $1`,
    [id]
  )
  return r.rows[0] || null
}

async function getAppointment(id) {
  const r = await q(
    `SELECT id, "lastReminderType", "reminder24hSentAt", "reminder3hSentAt", "confirmationRequestedAt"
     FROM appointments WHERE id = $1`,
    [id]
  )
  return r.rows[0] || null
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n[seed] Inserting test fixtures...')
  const now = new Date()
  const futureAppt = new Date(now.getTime() + 2 * 60 * 60 * 1000)   // +2 h
  const pastScheduled = new Date(now.getTime() - 10 * 60 * 1000)    // -10 min
  const pastReminder = new Date(now.getTime() - 25 * 60 * 60 * 1000) // -25 h

  // User (needed for appointments.createdBy FK)
  await q(
    `INSERT INTO users (id, email, "passwordHash", "isEmailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, 'noop-hash', false, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [T.USER, 'test-executor-runtime@nowhere.test']
  )

  // Clinics A and B
  for (const [id, slug, name] of [
    [T.CLINIC_A, 'test-exec-clinic-a-slug', 'Test Executor Clinic A'],
    [T.CLINIC_B, 'test-exec-clinic-b-slug', 'Test Executor Clinic B'],
  ]) {
    await q(
      `INSERT INTO clinics (id, name, slug, "isActive", "subscriptionPlan", timezone, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, 'free', 'UTC', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, name, slug]
    )
  }

  // Doctors
  for (const [id, clinicId] of [
    [T.DOCTOR_A, T.CLINIC_A],
    [T.DOCTOR_B, T.CLINIC_B],
  ]) {
    await q(
      `INSERT INTO doctors (id, "clinicId", "firstName", "lastName", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, 'TestDr', 'TestLast', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, clinicId]
    )
  }

  // Services
  for (const [id, clinicId] of [
    [T.SERVICE_A, T.CLINIC_A],
    [T.SERVICE_B, T.CLINIC_B],
  ]) {
    await q(
      `INSERT INTO services (id, "clinicId", name, "durationMinutes", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Test Service', 30, true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, clinicId]
    )
  }

  // Patients
  for (const [id, clinicId, phone] of [
    [T.PATIENT_A, T.CLINIC_A, '+15550001001'],
    [T.PATIENT_B, T.CLINIC_B, '+15550001002'],
  ]) {
    await q(
      `INSERT INTO patients (id, "clinicId", "firstName", "lastName", phone, "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, 'TestFirst', 'TestLast', $3, true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, clinicId, phone]
    )
  }

  // Appointments — confirmed (T5, T6, T7A, T7B, T8)
  for (const [id, clinicId, patientId, doctorId, serviceId] of [
    [T.APPT_T5,  T.CLINIC_A, T.PATIENT_A, T.DOCTOR_A, T.SERVICE_A],
    [T.APPT_T6,  T.CLINIC_A, T.PATIENT_A, T.DOCTOR_A, T.SERVICE_A],
    [T.APPT_T7A, T.CLINIC_A, T.PATIENT_A, T.DOCTOR_A, T.SERVICE_A],
    [T.APPT_T7B, T.CLINIC_B, T.PATIENT_B, T.DOCTOR_B, T.SERVICE_B],
    [T.APPT_T8,  T.CLINIC_A, T.PATIENT_A, T.DOCTOR_A, T.SERVICE_A],
  ]) {
    await q(
      `INSERT INTO appointments (id, "clinicId", "patientId", "doctorId", "serviceId",
        "scheduledAt", "durationMinutes", status, "createdBy", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 30, 'confirmed', $7, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         status = 'confirmed',
         "lastReminderType" = NULL,
         "reminder24hSentAt" = NULL,
         "reminder3hSentAt" = NULL,
         "confirmationRequestedAt" = NULL,
         "updatedAt" = NOW()`,
      [id, clinicId, patientId, doctorId, serviceId, futureAppt.toISOString(), T.USER]
    )
  }

  // Appointments — cancelled (T9, T9b)
  for (const [id, clinicId, patientId, doctorId, serviceId] of [
    [T.APPT_T9,  T.CLINIC_A, T.PATIENT_A, T.DOCTOR_A, T.SERVICE_A],
    [T.APPT_T9B, T.CLINIC_A, T.PATIENT_A, T.DOCTOR_A, T.SERVICE_A],
  ]) {
    await q(
      `INSERT INTO appointments (id, "clinicId", "patientId", "doctorId", "serviceId",
        "scheduledAt", "durationMinutes", status, "createdBy", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 30, 'cancelled', $7, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'cancelled', "updatedAt" = NOW()`,
      [id, clinicId, patientId, doctorId, serviceId, futureAppt.toISOString(), T.USER]
    )
  }

  // Reminders — each uses the same (appointmentId, type='whatsapp', scheduledAt)
  // but since each appointment is unique, the composite unique constraint is satisfied.
  for (const [id, clinicId, appointmentId] of [
    [T.REM_T5,  T.CLINIC_A, T.APPT_T5],
    [T.REM_T6,  T.CLINIC_A, T.APPT_T6],
    [T.REM_T7A, T.CLINIC_A, T.APPT_T7A],
    [T.REM_T7B, T.CLINIC_B, T.APPT_T7B],
    [T.REM_T8,  T.CLINIC_A, T.APPT_T8],
    [T.REM_T9,  T.CLINIC_A, T.APPT_T9],
    [T.REM_T9B, T.CLINIC_A, T.APPT_T9B],
  ]) {
    await q(
      `INSERT INTO reminders (id, "clinicId", "appointmentId", type, "scheduledAt",
        status, template, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'whatsapp', $4, 'pending', 'appointment_reminder_24h', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'pending', "sentAt" = NULL, "updatedAt" = NOW()`,
      [id, clinicId, appointmentId, pastReminder.toISOString()]
    )
  }

  // Notification jobs — standard pending (T5, T7A, T7B, T8, T9, T9b)
  // Each gets a unique destination phone to satisfy @@unique([reminderId, channel, destination])
  // (reminderId is already unique per row here, so destination uniqueness is academic,
  //  but distinct phones make debugging clearer)
  for (const [id, clinicId, remId, apptId, patId, dest] of [
    [T.JOB_T5,  T.CLINIC_A, T.REM_T5,  T.APPT_T5,  T.PATIENT_A, '+15550001011'],
    [T.JOB_T7A, T.CLINIC_A, T.REM_T7A, T.APPT_T7A, T.PATIENT_A, '+15550001013'],
    [T.JOB_T7B, T.CLINIC_B, T.REM_T7B, T.APPT_T7B, T.PATIENT_B, '+15550001014'],
    [T.JOB_T8,  T.CLINIC_A, T.REM_T8,  T.APPT_T8,  T.PATIENT_A, '+15550001015'],
    [T.JOB_T9,  T.CLINIC_A, T.REM_T9,  T.APPT_T9,  T.PATIENT_A, '+15550001016'],
    [T.JOB_T9B, T.CLINIC_A, T.REM_T9B, T.APPT_T9B, T.PATIENT_A, '+15550001017'],
  ]) {
    await q(
      `INSERT INTO notification_jobs
         (id, "clinicId", "reminderId", "appointmentId", "patientId",
          channel, destination, "messageBody", provider, status, "scheduledFor", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5,
               'whatsapp', $6, 'Test message body', 'twilio-whatsapp', 'pending', $7, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         status = 'pending',
         "providerMessageId" = NULL,
         "sentAt" = NULL,
         "errorMessage" = NULL,
         "updatedAt" = NOW()`,
      [id, clinicId, remId, apptId, patId, dest, pastScheduled.toISOString()]
    )
  }

  // T6 — stale queued: must set updatedAt to 6 min ago via raw SQL.
  // Uses ON CONFLICT DO UPDATE to force the stale-queued state even on re-runs.
  const staleTime = new Date(now.getTime() - 6 * 60 * 1000).toISOString()
  await q(
    `INSERT INTO notification_jobs
       (id, "clinicId", "reminderId", "appointmentId", "patientId",
        channel, destination, "messageBody", provider, status, "scheduledFor", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5,
             'whatsapp', '+15550001012', 'Test message body', 'twilio-whatsapp', 'queued', $6, NOW(), $7)
     ON CONFLICT (id) DO UPDATE SET
       status = 'queued',
       "providerMessageId" = NULL,
       "sentAt" = NULL,
       "errorMessage" = NULL,
       "updatedAt" = $7`,
    [T.JOB_T6, T.CLINIC_A, T.REM_T6, T.APPT_T6, T.PATIENT_A, pastScheduled.toISOString(), staleTime]
  )

  console.log('[seed] Done.')
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n[teardown] Removing test fixtures...')
  const jobIds = [T.JOB_T5, T.JOB_T6, T.JOB_T7A, T.JOB_T7B, T.JOB_T8, T.JOB_T9, T.JOB_T9B]
  const remIds = [T.REM_T5, T.REM_T6, T.REM_T7A, T.REM_T7B, T.REM_T8, T.REM_T9, T.REM_T9B]
  const apptIds = [T.APPT_T5, T.APPT_T6, T.APPT_T7A, T.APPT_T7B, T.APPT_T8, T.APPT_T9, T.APPT_T9B]
  const clinicIds = [T.CLINIC_A, T.CLINIC_B]

  await q(`DELETE FROM notification_jobs WHERE id = ANY($1::text[])`, [jobIds])
  await q(`DELETE FROM reminders WHERE id = ANY($1::text[])`, [remIds])
  await q(`DELETE FROM appointments WHERE id = ANY($1::text[])`, [apptIds])
  await q(`DELETE FROM doctors WHERE id IN ($1, $2)`, [T.DOCTOR_A, T.DOCTOR_B])
  await q(`DELETE FROM services WHERE id IN ($1, $2)`, [T.SERVICE_A, T.SERVICE_B])
  await q(`DELETE FROM patients WHERE id IN ($1, $2)`, [T.PATIENT_A, T.PATIENT_B])
  // Remove escalation logs written for test clinics by this script's runs
  await q(
    `DELETE FROM escalation_logs
     WHERE "clinicId" = ANY($1::text[]) AND "eventType" = 'cron_reminder_run'`,
    [clinicIds]
  )
  await q(`DELETE FROM clinics WHERE id IN ($1, $2)`, [T.CLINIC_A, T.CLINIC_B])
  await q(`DELETE FROM users WHERE id = $1`, [T.USER])
  console.log('[teardown] Done.')
}

// ─── Server readiness ─────────────────────────────────────────────────────────

async function waitForServer(maxMs = 120_000) {
  const deadline = Date.now() + maxMs
  let attempts = 0
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/reminders/run`, { signal: AbortSignal.timeout(3000) })
      if (res.status === 200) return true
    } catch (_) {}
    attempts++
    await new Promise((r) => setTimeout(r, 2000))
  }
  return false
}

// ─── Reset helpers (between tests) ───────────────────────────────────────────

async function resetJob(id) {
  await q(
    `UPDATE notification_jobs
     SET status = 'pending', "providerMessageId" = NULL, "sentAt" = NULL, "errorMessage" = NULL, "updatedAt" = NOW()
     WHERE id = $1`,
    [id]
  )
}

async function resetReminder(id) {
  await q(
    `UPDATE reminders SET status = 'pending', "sentAt" = NULL, "updatedAt" = NOW() WHERE id = $1`,
    [id]
  )
}

async function resetAppointmentFields(id) {
  await q(
    `UPDATE appointments
     SET "lastReminderType" = NULL, "reminder24hSentAt" = NULL, "reminder3hSentAt" = NULL,
         "confirmationRequestedAt" = NULL, "updatedAt" = NOW()
     WHERE id = $1`,
    [id]
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n=== Running T1–T10 ===\n')
  // Used for T10 EscalationLog query — set fresh just before T10's POST trigger
  let t10StartTime

  // ── T1: GET health ─────────────────────────────────────────────────────────
  {
    const { status, body } = await apiGet('/api/reminders/run')
    if (status === 200 && body?.status === 'ok' && body?.service === 'reminder-cron') {
      pass('T1', `GET /api/reminders/run → 200 {status:'ok', service:'reminder-cron'}`)
    } else {
      fail('T1', `Expected 200 ok, got ${status} ${JSON.stringify(body)}`)
    }
  }

  // ── T2: POST no auth header ────────────────────────────────────────────────
  {
    const { status } = await apiPost('/api/reminders/run')
    if (status === 401) {
      pass('T2', `POST no auth → 401`)
    } else {
      fail('T2', `Expected 401, got ${status}`)
    }
  }

  // ── T3: POST wrong token ───────────────────────────────────────────────────
  {
    const { status } = await apiPost('/api/reminders/run', { token: 'definitely-wrong' })
    if (status === 401) {
      pass('T3', `POST wrong token → 401`)
    } else {
      fail('T3', `Expected 401, got ${status}`)
    }
  }

  // ── T3b: No secrets configured ─────────────────────────────────────────────
  skip('T3b', 'Requires server restart with CRON_SECRET unset — verified via route code review (isAuthorized returns null → HTTP 500)')

  // ── T4: POST correct token → success ──────────────────────────────────────
  // Uses CLINIC_A. At this point all T5–T8 jobs are pending; T9/T9b are pending but
  // will be excluded by batch query due to cancelled appointments.
  // T4 is auth-only: we assert 200 + success field present, regardless of job counts.
  {
    const { status, body } = await apiPost('/api/reminders/run', { token: CRON_SECRET, clinicId: T.CLINIC_A })
    if (status === 200 && typeof body?.success === 'boolean') {
      pass('T4', `POST correct token → 200 {success: ${body.success}, jobsSent: ${body.jobsSent}, jobsFailed: ${body.jobsFailed}}`)
    } else {
      fail('T4', `Expected 200 with success field, got ${status} ${JSON.stringify(body)}`)
    }
  }

  // Reset CLINIC_A jobs so T5–T8 start from clean pending.
  // T4 may have processed T5/T7A/T8 in its batch run.
  // T6 is left as-is (T4 may have processed it too); it will be reset to stale-queued
  // just before the T6 test, avoiding early recovery by T5's batch.
  await resetJob(T.JOB_T5); await resetReminder(T.REM_T5); await resetAppointmentFields(T.APPT_T5)
  await resetJob(T.JOB_T7A); await resetReminder(T.REM_T7A)
  await resetJob(T.JOB_T8); await resetReminder(T.REM_T8)

  // ── T5: Happy path ─────────────────────────────────────────────────────────
  {
    const { status, body } = await apiPost('/api/reminders/run', { token: CRON_SECRET, clinicId: T.CLINIC_A })
    const job    = await getJob(T.JOB_T5)
    const rem    = await getReminder(T.REM_T5)
    const appt   = await getAppointment(T.APPT_T5)

    const jobSent          = job?.status === 'sent'
    const jobHasSid        = typeof job?.providerMessageId === 'string' && job.providerMessageId.startsWith('mock_whatsapp_')
    const jobHasSentAt     = job?.sentAt != null
    const remSent          = rem?.status === 'sent'
    const remHasSentAt     = rem?.sentAt != null
    const apptHasRemType   = appt?.lastReminderType != null

    if (status === 200 && body?.success && jobSent && jobHasSid && jobHasSentAt && remSent && remHasSentAt && apptHasRemType) {
      pass('T5', `Happy path: job.status=sent, providerMessageId=${job.providerMessageId}, Reminder.status=sent, Appointment.lastReminderType=${appt.lastReminderType}`)
    } else {
      fail('T5', [
        `HTTP ${status} ${JSON.stringify(body)}`,
        `job: ${JSON.stringify(job)}`,
        `reminder: ${JSON.stringify(rem)}`,
        `appointment: ${JSON.stringify(appt)}`,
      ].join(' | '))
    }
  }

  // ── T6: Stale-queued recovery ──────────────────────────────────────────────
  // Set T6 to stale-queued NOW (after T5's batch run has completed and cannot touch it).
  // Raw SQL is required to set updatedAt to a past value — Prisma's @updatedAt would override it.
  {
    const staleTime6 = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    await q(
      `UPDATE notification_jobs
       SET status = 'queued', "providerMessageId" = NULL, "sentAt" = NULL, "errorMessage" = NULL, "updatedAt" = $1
       WHERE id = $2`,
      [staleTime6, T.JOB_T6]
    )
    await resetReminder(T.REM_T6)
  }
  // Verify the updatedAt is actually stale before triggering.
  {
    const jobBefore = await getJob(T.JOB_T6)
    const ageMs = jobBefore ? Date.now() - new Date(jobBefore.updatedAt).getTime() : 0

    if (!jobBefore || jobBefore.status !== 'queued') {
      fail('T6', `Pre-condition failed: JOB_T6 should be queued, got status=${jobBefore?.status}`)
    } else if (ageMs < 5 * 60 * 1000) {
      fail('T6', `Pre-condition failed: JOB_T6.updatedAt is only ${Math.round(ageMs / 1000)}s old, needs >= 300s`)
    } else {
      const { status, body } = await apiPost('/api/reminders/run', { token: CRON_SECRET, clinicId: T.CLINIC_A })
      const job = await getJob(T.JOB_T6)

      if (status === 200 && job?.status === 'sent' && job?.providerMessageId?.startsWith('mock_whatsapp_')) {
        pass('T6', `Stale-queued recovery: job (${Math.round(ageMs / 1000)}s stale) reset → pending → sent, providerMessageId=${job.providerMessageId}`)
      } else {
        fail('T6', `HTTP ${status} ${JSON.stringify(body)} | job after: ${JSON.stringify(job)}`)
      }
    }
  }

  // ── T7: clinicId scoping ───────────────────────────────────────────────────
  // Reset T7A to pending — T7B is still pending (never touched)
  await resetJob(T.JOB_T7A); await resetReminder(T.REM_T7A)
  {
    const { status, body } = await apiPost('/api/reminders/run', { token: CRON_SECRET, clinicId: T.CLINIC_A })
    const jobA = await getJob(T.JOB_T7A)
    const jobB = await getJob(T.JOB_T7B)

    if (status === 200 && jobA?.status === 'sent' && jobB?.status === 'pending') {
      pass('T7', `Clinic A job sent (${jobA.providerMessageId}); Clinic B job still pending — scoping enforced`)
    } else {
      fail('T7', `HTTP ${status} ${JSON.stringify(body)} | jobA: ${JSON.stringify(jobA)} | jobB: ${JSON.stringify(jobB)}`)
    }
  }

  // ── T8: Idempotency ────────────────────────────────────────────────────────
  await resetJob(T.JOB_T8); await resetReminder(T.REM_T8)
  {
    // At this point in CLINIC_A: T5 sent, T6 sent, T7A sent, T8 pending, T9/T9b pending with cancelled appt
    const first  = await apiPost('/api/reminders/run', { token: CRON_SECRET, clinicId: T.CLINIC_A })
    const second = await apiPost('/api/reminders/run', { token: CRON_SECRET, clinicId: T.CLINIC_A })
    const job = await getJob(T.JOB_T8)

    const firstSent  = first.body?.jobsSent ?? 0
    const secondSent = second.body?.jobsSent ?? 0

    if (
      first.status === 200 &&
      firstSent >= 1 &&
      second.status === 200 &&
      secondSent === 0 &&
      job?.status === 'sent'
    ) {
      pass('T8', `Idempotency: first jobsSent=${firstSent}, second jobsSent=0, job.status=sent — no double-process`)
    } else {
      fail('T8', `first: ${JSON.stringify(first.body)} | second: ${JSON.stringify(second.body)} | job: ${JSON.stringify(job)}`)
    }
  }

  // ── T9: Batch terminal-appointment exclusion ───────────────────────────────
  {
    // JOB_T9 points to APPT_T9 (status=cancelled). Batch query excludes it.
    const remBefore = await getReminder(T.REM_T9)
    const jobBefore = await getJob(T.JOB_T9)

    const { status, body } = await apiPost('/api/reminders/run', { token: CRON_SECRET, clinicId: T.CLINIC_A })
    const jobAfter = await getJob(T.JOB_T9)
    const remAfter = await getReminder(T.REM_T9)

    if (
      status === 200 &&
      jobBefore?.status === 'pending' &&
      jobAfter?.status === 'pending' &&
      remAfter?.status === 'pending'
    ) {
      pass('T9', `Batch exclusion: cancelled-appointment job stays pending (not failed). jobsSent=${body?.jobsSent}, jobsFailed=${body?.jobsFailed}`)
    } else {
      fail('T9', `HTTP ${status} ${JSON.stringify(body)} | before: job=${jobBefore?.status} | after: job=${jobAfter?.status}, rem=${remAfter?.status}`)
    }
  }

  // ── T9b: Direct-path terminal failure ─────────────────────────────────────
  skip('T9b', 'sendWhatsAppNotificationJob direct path requires Supabase session auth on its only HTTP surface (/api/notification-jobs/[jobId]/send). Covered by verify-executor.js groups B (B1–B5b) and F (F5–F6).')

  // ── T10: EscalationLog presence ───────────────────────────────────────────
  t10StartTime = new Date()
  const { status: t10Status } = await apiPost('/api/reminders/run', { token: CRON_SECRET, clinicId: T.CLINIC_A })
  {
    const startLogs = await q(
      `SELECT id, metadata
       FROM escalation_logs
       WHERE "clinicId" = $1
         AND "eventType" = 'cron_reminder_run'
         AND "createdAt" >= $2
         AND metadata->>'phase' = 'start'`,
      [T.CLINIC_A, t10StartTime.toISOString()]
    )
    const endLogs = await q(
      `SELECT id, metadata
       FROM escalation_logs
       WHERE "clinicId" = $1
         AND "eventType" = 'cron_reminder_run'
         AND "createdAt" >= $2
         AND metadata->>'phase' = 'end'`,
      [T.CLINIC_A, t10StartTime.toISOString()]
    )

    const hasStart = startLogs.rows.length >= 1
    const hasEnd   = endLogs.rows.length >= 1
    const startMeta = startLogs.rows[0]?.metadata
    const endMeta   = endLogs.rows[0]?.metadata

    const startHasTrigger  = startMeta?.trigger === 'cron'
    const endHasTrigger    = endMeta?.trigger === 'cron'
    const endHasDuration   = typeof endMeta?.duration === 'number'
    const endHasJobCounts  = typeof endMeta?.jobsProcessed === 'number'

    if (t10Status === 200 && hasStart && hasEnd && startHasTrigger && endHasTrigger && endHasDuration && endHasJobCounts) {
      pass('T10', [
        `EscalationLog rows written after t10StartTime:`,
        `start(trigger=${startMeta.trigger}, phase=${startMeta.phase}, clinicsTargeted=${startMeta.clinicsTargeted})`,
        `end(trigger=${endMeta.trigger}, phase=${endMeta.phase}, duration=${endMeta.duration}ms, jobsProcessed=${endMeta.jobsProcessed})`,
      ].join(' | '))
    } else {
      fail('T10', [
        `HTTP ${t10Status}`,
        `hasStart=${hasStart}, hasEnd=${hasEnd}`,
        `startMeta=${JSON.stringify(startMeta)}`,
        `endMeta=${JSON.stringify(endMeta)}`,
      ].join(' | '))
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  db = new Client({ connectionString: DATABASE_URL })
  await db.connect()
  console.log(`[db] Connected to Postgres`)
  console.log(`[config] BASE_URL=${BASE_URL} | CRON_SECRET set=true | WHATSAPP_DEV_MODE=${process.env.WHATSAPP_DEV_MODE}`)

  console.log('\n[server] Checking dev server at', BASE_URL, '...')
  const ready = await waitForServer(30_000)
  if (!ready) {
    console.error('[error] Dev server not reachable at', BASE_URL)
    console.error('        Start it first: npm run dev')
    await db.end()
    process.exit(1)
  }
  console.log('[server] Dev server ready.')

  try {
    await seed()
    await runTests()
  } finally {
    await teardown()
    await db.end()
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════')
  console.log('  RESULTS')
  console.log('═══════════════════════════════════════════')
  for (const [id, result] of Object.entries(results)) {
    console.log(`  ${result.padEnd(4)} ${id}`)
  }

  const passed  = Object.values(results).filter((r) => r === 'PASS').length
  const failed  = Object.values(results).filter((r) => r === 'FAIL').length
  const skipped = Object.values(results).filter((r) => r === 'SKIP').length
  console.log(`\n  ${passed} passed, ${failed} failed, ${skipped} skipped`)
  console.log('═══════════════════════════════════════════\n')

  if (failures > 0) process.exit(1)
}

main().catch((err) => {
  console.error('[fatal]', err)
  process.exit(1)
})
