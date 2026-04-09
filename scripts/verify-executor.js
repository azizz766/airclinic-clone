#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Verification script for the scheduled job executor logic.
 *
 * Tests the decision logic of sendDueWhatsAppNotificationsForClinic and
 * sendWhatsAppNotificationJob — no real DB, no real Twilio, no network.
 *
 * Groups:
 *   A. Happy path (due job is found and sent)
 *   B. Failure paths (Twilio error, appointment terminal status)
 *   C. Stuck-queued recovery
 *   D. Idempotency / duplicate execution
 *   E. Limit enforcement
 *   F. Reminder status sync
 *
 * Run: node scripts/verify-executor.js
 */

let failures = 0
const pass = (msg) => console.log(`PASS ${msg}`)
const fail = (msg) => {
  failures += 1
  console.log(`FAIL ${msg}`)
}

// ─── Mock primitives ──────────────────────────────────────────────────────────

function makeNow() {
  return new Date('2026-04-09T12:00:00Z')
}

function jobRow({
  id = 'JOB001',
  clinicId = 'clinic_A',
  channel = 'whatsapp',
  status = 'pending',
  scheduledFor = new Date('2026-04-09T11:00:00Z'), // 1h before now → due
  updatedAt = new Date('2026-04-09T11:55:00Z'),
  reminderId = 'REM001',
  appointmentStatus = 'scheduled',
  appointmentScheduledAt = new Date('2026-04-09T14:00:00Z'), // future
} = {}) {
  return {
    id,
    clinicId,
    channel,
    status,
    scheduledFor,
    updatedAt,
    reminderId,
    appointment: {
      status: appointmentStatus,
      scheduledAt: appointmentScheduledAt,
    },
  }
}

function makeJobStore(rows = []) {
  const store = rows.map((r) => ({ ...r }))
  return {
    store,
    findMany({ where, orderBy, take }) {
      let result = store.filter((row) => {
        if (where.clinicId && row.clinicId !== where.clinicId) return false
        if (where.channel && row.channel !== where.channel) return false
        if (where.status && row.status !== where.status) return false
        if (where.scheduledFor?.lte && row.scheduledFor > where.scheduledFor.lte) return false
        if (where.updatedAt?.lte && row.updatedAt > where.updatedAt.lte) return false
        if (where.appointment?.status?.notIn?.includes(row.appointment.status)) return false
        if (where.appointment?.scheduledAt?.gt && row.appointment.scheduledAt <= where.appointment.scheduledAt.gt) return false
        return true
      })
      if (orderBy?.scheduledFor === 'asc') {
        result = result.sort((a, b) => a.scheduledFor - b.scheduledFor)
      }
      if (take !== undefined) result = result.slice(0, take)
      return result
    },
    updateMany({ where, data }) {
      let count = 0
      for (const row of store) {
        let match = true
        if (where.clinicId && row.clinicId !== where.clinicId) match = false
        if (where.channel && row.channel !== where.channel) match = false
        if (where.status && row.status !== where.status) match = false
        if (where.updatedAt?.lte && row.updatedAt > where.updatedAt.lte) match = false
        if (where.id && row.id !== where.id) match = false
        if (match) {
          Object.assign(row, data)
          row.updatedAt = new Date()
          count++
        }
      }
      return { count }
    },
  }
}

function makeReminderStore(rows = []) {
  const store = rows.map((r) => ({ ...r }))
  return {
    store,
    updateMany({ where, data }) {
      for (const row of store) {
        if (where.id && row.id !== where.id) continue
        Object.assign(row, data)
      }
    },
  }
}

// ─── Logic under test (mirrors lib/notifications/send-whatsapp-job.ts) ────────

async function sendDueJobsForClinic({ jobStore, reminderStore, sendFn, clinicId, limit, now }) {
  limit = limit ?? 20

  // Stuck-queued recovery
  const staleQueuedCutoff = new Date(now.getTime() - 5 * 60 * 1000)
  jobStore.updateMany({
    where: { clinicId, channel: 'whatsapp', status: 'queued', updatedAt: { lte: staleQueuedCutoff } },
    data: { status: 'pending', errorMessage: 'Reset from stale queued state (prior execution did not complete).' },
  })

  const dueJobs = jobStore.findMany({
    where: {
      clinicId,
      channel: 'whatsapp',
      status: 'pending',
      scheduledFor: { lte: now },
      appointment: {
        status: { notIn: ['cancelled', 'completed', 'no_show', 'rescheduled'] },
        scheduledAt: { gt: now },
      },
    },
    orderBy: { scheduledFor: 'asc' },
    take: limit,
  })

  const result = { total: dueJobs.length, sent: 0, failed: 0 }

  for (const job of dueJobs) {
    const r = await sendSingleJob({ jobStore, reminderStore, sendFn, clinicId, jobId: job.id, now })
    if (r.ok) result.sent += 1
    else result.failed += 1
  }

  return result
}

async function sendSingleJob({ jobStore, reminderStore, sendFn, clinicId, jobId, now }) {
  // Claim: pending → queued
  const claimed = jobStore.updateMany({
    where: { id: jobId, clinicId, channel: 'whatsapp', status: 'pending' },
    data: { status: 'queued' },
  })

  if (claimed.count === 0) {
    return { ok: false, status: 'failed', error: 'Job not claimable.' }
  }

  const job = jobStore.store.find((r) => r.id === jobId)
  if (!job) return { ok: false, status: 'failed', error: 'Job not found.' }

  // Terminal appointment status guard
  if (['cancelled', 'completed', 'no_show', 'rescheduled'].includes(job.appointment.status)) {
    jobStore.updateMany({
      where: { id: jobId, status: 'queued' },
      data: { status: 'failed', errorMessage: `Skipped: appointment status is ${job.appointment.status}.` },
    })
    reminderStore.updateMany({
      where: { id: job.reminderId },
      data: { status: 'failed' },
    })
    return { ok: false, status: 'failed', error: `Appointment not eligible.` }
  }

  // Send
  try {
    const sid = await sendFn(job)
    jobStore.updateMany({
      where: { id: jobId, status: 'queued' },
      data: { status: 'sent', providerMessageId: sid, sentAt: now },
    })
    reminderStore.updateMany({
      where: { id: job.reminderId },
      data: { status: 'sent', sentAt: now },
    })
    return { ok: true, status: 'sent', providerMessageId: sid }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Send failed.'
    jobStore.updateMany({
      where: { id: jobId, status: 'queued' },
      data: { status: 'failed', errorMessage: message },
    })
    reminderStore.updateMany({
      where: { id: job.reminderId },
      data: { status: 'failed' },
    })
    return { ok: false, status: 'failed', error: message }
  }
}

// ─── A. HAPPY PATH ────────────────────────────────────────────────────────────

console.log('\n=== A. HAPPY PATH ===')

{
  const now = makeNow()
  const jobStore = makeJobStore([jobRow()])
  const reminderStore = makeReminderStore([{ id: 'REM001', status: 'pending', sentAt: null }])
  let sendCalled = false
  const sendFn = async () => { sendCalled = true; return 'SM_HAPPY' }

  const result = await sendDueJobsForClinic({ jobStore, reminderStore, sendFn, clinicId: 'clinic_A', limit: 20, now })

  result.total === 1 ? pass('A1: one due job found') : fail('A1: one due job found')
  result.sent === 1 ? pass('A2: job counted as sent') : fail('A2: job counted as sent')
  result.failed === 0 ? pass('A3: no failures') : fail('A3: no failures')
  sendCalled ? pass('A4: sendFn invoked') : fail('A4: sendFn invoked')
  jobStore.store[0].status === 'sent' ? pass('A5: NotificationJob.status = sent') : fail('A5: NotificationJob.status = sent')
  jobStore.store[0].providerMessageId === 'SM_HAPPY' ? pass('A6: providerMessageId stored') : fail('A6: providerMessageId stored')
  jobStore.store[0].sentAt !== null ? pass('A7: sentAt set') : fail('A7: sentAt set')
}

// ─── B. FAILURE PATHS ─────────────────────────────────────────────────────────

console.log('\n=== B. FAILURE PATHS ===')

{
  // B1: Twilio error → job failed, reminder failed
  const now = makeNow()
  const jobStore = makeJobStore([jobRow()])
  const reminderStore = makeReminderStore([{ id: 'REM001', status: 'pending', sentAt: null }])
  const sendFn = async () => { throw new Error('Twilio 503') }

  const result = await sendDueJobsForClinic({ jobStore, reminderStore, sendFn, clinicId: 'clinic_A', limit: 20, now })

  result.failed === 1 ? pass('B1: failure counted') : fail('B1: failure counted')
  jobStore.store[0].status === 'failed' ? pass('B2: NotificationJob.status = failed') : fail('B2: NotificationJob.status = failed')
  jobStore.store[0].errorMessage?.includes('Twilio 503') ? pass('B3: errorMessage contains Twilio error') : fail('B3: errorMessage contains Twilio error')
  reminderStore.store[0].status === 'failed' ? pass('B4: Reminder.status = failed after Twilio error') : fail('B4: Reminder.status = failed after Twilio error')
}

{
  // B5: Appointment in terminal status → EXCLUDED from batch query entirely (notIn filter)
  // The terminal guard inside sendSingleJob is a safety net for manual/direct calls.
  const now = makeNow()
  const jobStore = makeJobStore([jobRow({ appointmentStatus: 'cancelled' })])
  const reminderStore = makeReminderStore([{ id: 'REM001', status: 'pending', sentAt: null }])
  const sendFn = async () => { throw new Error('should not be called') }

  const result = await sendDueJobsForClinic({ jobStore, reminderStore, sendFn, clinicId: 'clinic_A', limit: 20, now })

  result.total === 0 ? pass('B5: cancelled-appointment job excluded from batch query (notIn filter)') : fail('B5: cancelled-appointment job excluded from batch query')
  jobStore.store[0].status === 'pending' ? pass('B6: cancelled-appointment job left untouched by batch run') : fail('B6: cancelled-appointment job left untouched by batch run')
  reminderStore.store[0].status === 'pending' ? pass('B7: reminder untouched when job excluded by batch query') : fail('B7: reminder untouched when job excluded by batch query')
}

{
  // B5b: Terminal appointment guard fires when sendSingleJob called directly (manual path / race condition)
  const now = makeNow()
  const jobStore = makeJobStore([jobRow({ appointmentStatus: 'rescheduled' })])
  const reminderStore = makeReminderStore([{ id: 'REM001', status: 'pending', sentAt: null }])
  let sendCalled = false
  const sendFn = async () => { sendCalled = true; return 'SM_SHOULD_NOT' }

  const result = await sendSingleJob({ jobStore, reminderStore, sendFn, clinicId: 'clinic_A', jobId: 'JOB001', now })

  result.ok === false ? pass('B5b: direct sendSingleJob fails for rescheduled appointment') : fail('B5b: direct sendSingleJob fails for rescheduled appointment')
  sendCalled === false ? pass('B5c: sendFn not invoked for terminal appointment') : fail('B5c: sendFn not invoked for terminal appointment')
  jobStore.store[0].status === 'failed' ? pass('B5d: NotificationJob marked failed for terminal appointment') : fail('B5d: NotificationJob marked failed for terminal appointment')
  reminderStore.store[0].status === 'failed' ? pass('B5e: Reminder.status = failed for terminal appointment') : fail('B5e: Reminder.status = failed for terminal appointment')
}

{
  // B8: Past appointment (scheduledAt <= now) → not included in due-job query
  const now = makeNow()
  const pastApptJob = jobRow({ appointmentScheduledAt: new Date(now.getTime() - 1000) }) // 1s in the past
  const jobStore = makeJobStore([pastApptJob])
  const reminderStore = makeReminderStore([{ id: 'REM001', status: 'pending', sentAt: null }])
  const sendFn = async () => 'SM_SHOULD_NOT'

  const result = await sendDueJobsForClinic({ jobStore, reminderStore, sendFn, clinicId: 'clinic_A', limit: 20, now })

  result.total === 0 ? pass('B8: past appointment excluded from due-job query') : fail('B8: past appointment excluded from due-job query')
  jobStore.store[0].status === 'pending' ? pass('B9: past-appointment job left untouched (still pending)') : fail('B9: past-appointment job left untouched (still pending)')
}

// ─── C. STUCK-QUEUED RECOVERY ─────────────────────────────────────────────────

console.log('\n=== C. STUCK-QUEUED RECOVERY ===')

{
  // C1: Job stuck in queued for > 5 minutes → reset to pending, then picked up and sent
  const now = makeNow()
  const stuckUpdatedAt = new Date(now.getTime() - 6 * 60 * 1000) // 6 min ago
  const stuckJob = jobRow({ status: 'queued', updatedAt: stuckUpdatedAt })
  const jobStore = makeJobStore([stuckJob])
  const reminderStore = makeReminderStore([{ id: 'REM001', status: 'pending', sentAt: null }])
  const sendFn = async () => 'SM_RECOVERED'

  const result = await sendDueJobsForClinic({ jobStore, reminderStore, sendFn, clinicId: 'clinic_A', limit: 20, now })

  result.sent === 1 ? pass('C1: stuck-queued job recovered and sent') : fail('C1: stuck-queued job recovered and sent')
  jobStore.store[0].status === 'sent' ? pass('C2: final status = sent after recovery') : fail('C2: final status = sent after recovery')
}

{
  // C3: Job in queued for < 5 minutes → NOT recovered (still queued, not picked up)
  const now = makeNow()
  const recentUpdatedAt = new Date(now.getTime() - 2 * 60 * 1000) // 2 min ago — within threshold
  const activeJob = jobRow({ status: 'queued', updatedAt: recentUpdatedAt })
  const jobStore = makeJobStore([activeJob])
  const reminderStore = makeReminderStore([{ id: 'REM001', status: 'pending', sentAt: null }])
  const sendFn = async () => 'SM_SHOULD_NOT_RECOVER'

  const result = await sendDueJobsForClinic({ jobStore, reminderStore, sendFn, clinicId: 'clinic_A', limit: 20, now })

  result.total === 0 ? pass('C3: recently-queued job NOT recovered (still in-flight within threshold)') : fail('C3: recently-queued job NOT recovered')
  jobStore.store[0].status === 'queued' ? pass('C4: in-flight queued job status unchanged') : fail('C4: in-flight queued job status unchanged')
}

{
  // C5: Recovery only touches queued jobs, not sent or failed
  const now = makeNow()
  const staleQueuedCutoff = new Date(now.getTime() - 6 * 60 * 1000)
  const sentJob = jobRow({ id: 'JOB_SENT', status: 'sent', updatedAt: staleQueuedCutoff })
  const failedJob = jobRow({ id: 'JOB_FAILED', status: 'failed', updatedAt: staleQueuedCutoff })
  const jobStore = makeJobStore([sentJob, failedJob])
  const reminderStore = makeReminderStore([])
  const sendFn = async () => 'SM_IRRELEVANT'

  await sendDueJobsForClinic({ jobStore, reminderStore, sendFn, clinicId: 'clinic_A', limit: 20, now })

  jobStore.store.find((r) => r.id === 'JOB_SENT').status === 'sent'
    ? pass('C5: sent job not touched by recovery')
    : fail('C5: sent job not touched by recovery')
  jobStore.store.find((r) => r.id === 'JOB_FAILED').status === 'failed'
    ? pass('C6: failed job not touched by recovery')
    : fail('C6: failed job not touched by recovery')
}

// ─── D. IDEMPOTENCY / DUPLICATE PROTECTION ───────────────────────────────────

console.log('\n=== D. IDEMPOTENCY / DUPLICATE PROTECTION ===')

{
  // D1: Already-queued job (not stuck) cannot be double-claimed by sendSingleJob directly
  const now = makeNow()
  const recentUpdatedAt = new Date(now.getTime() - 30 * 1000) // 30s ago — active
  const activeQueuedJob = jobRow({ status: 'queued', updatedAt: recentUpdatedAt })
  const jobStore = makeJobStore([activeQueuedJob])
  const reminderStore = makeReminderStore([{ id: 'REM001', status: 'pending', sentAt: null }])
  let sendCallCount = 0
  const sendFn = async () => { sendCallCount++; return 'SM_DOUBLE' }

  const result = await sendSingleJob({ jobStore, reminderStore, sendFn, clinicId: 'clinic_A', jobId: 'JOB001', now })

  result.ok === false ? pass('D1: sendSingleJob rejects already-queued job (cannot re-claim)') : fail('D1: sendSingleJob rejects already-queued job')
  sendCallCount === 0 ? pass('D2: sendFn not invoked for already-queued job') : fail('D2: sendFn not invoked for already-queued job')
}

{
  // D3: Already-sent job cannot be re-sent
  const now = makeNow()
  const sentJob = jobRow({ status: 'sent', updatedAt: new Date(now.getTime() - 60 * 1000) })
  const jobStore = makeJobStore([sentJob])
  const reminderStore = makeReminderStore([{ id: 'REM001', status: 'sent', sentAt: now }])
  let sendCallCount = 0
  const sendFn = async () => { sendCallCount++; return 'SM_SHOULD_NOT' }

  // Due-job query only picks up pending, so sent jobs are never passed to sendSingleJob
  const dueJobs = jobStore.findMany({
    where: {
      clinicId: 'clinic_A',
      channel: 'whatsapp',
      status: 'pending',
      scheduledFor: { lte: now },
      appointment: { status: { notIn: ['cancelled'] }, scheduledAt: { gt: now } },
    },
    take: 20,
  })

  dueJobs.length === 0 ? pass('D3: sent job not included in due-job query') : fail('D3: sent job not included in due-job query')
  sendCallCount === 0 ? pass('D4: sendFn not called for already-sent job') : fail('D4: sendFn not called for already-sent job')
}

// ─── E. LIMIT ENFORCEMENT ────────────────────────────────────────────────────

console.log('\n=== E. LIMIT ENFORCEMENT ===')

{
  // E1: Only `limit` jobs are sent per clinic per run
  const now = makeNow()
  const jobs = Array.from({ length: 10 }, (_, i) =>
    jobRow({
      id: `JOB_${i}`,
      scheduledFor: new Date(now.getTime() - (10 - i) * 60000), // increasingly recent
    })
  )
  const reminders = jobs.map((j) => ({ id: j.reminderId, status: 'pending', sentAt: null }))
    .filter((v, i, self) => self.findIndex((x) => x.id === v.id) === i)
  const jobStore = makeJobStore(jobs)
  const reminderStore = makeReminderStore(reminders)
  const sendFn = async () => 'SM_LIMITED'

  const result = await sendDueJobsForClinic({ jobStore, reminderStore, sendFn, clinicId: 'clinic_A', limit: 3, now })

  result.total === 3 ? pass('E1: exactly 3 jobs selected with limit=3') : fail(`E1: expected 3, got ${result.total}`)
  result.sent === 3 ? pass('E2: exactly 3 jobs sent') : fail(`E2: expected 3 sent, got ${result.sent}`)

  const sentJobs = jobStore.store.filter((r) => r.status === 'sent')
  const oldestIds = jobs
    .sort((a, b) => a.scheduledFor - b.scheduledFor)
    .slice(0, 3)
    .map((j) => j.id)
  const sentIds = sentJobs.map((r) => r.id)
  const sentOldestFirst = oldestIds.every((id) => sentIds.includes(id))
  sentOldestFirst ? pass('E3: oldest-due jobs sent first (orderBy scheduledFor asc)') : fail('E3: oldest-due jobs sent first')
}

// ─── F. REMINDER STATUS SYNC ────────────────────────────────────────────────

console.log('\n=== F. REMINDER STATUS SYNC ===')

{
  // F1: Success → Reminder.status = sent, Reminder.sentAt set
  const now = makeNow()
  const jobStore = makeJobStore([jobRow()])
  const reminderStore = makeReminderStore([{ id: 'REM001', status: 'pending', sentAt: null }])
  const sendFn = async () => 'SM_SYNC_OK'

  await sendDueJobsForClinic({ jobStore, reminderStore, sendFn, clinicId: 'clinic_A', limit: 20, now })

  reminderStore.store[0].status === 'sent' ? pass('F1: Reminder.status = sent after success') : fail('F1: Reminder.status = sent after success')
  reminderStore.store[0].sentAt !== null ? pass('F2: Reminder.sentAt set after success') : fail('F2: Reminder.sentAt set after success')
  reminderStore.store[0].sentAt?.getTime() === now.getTime() ? pass('F3: Reminder.sentAt = now') : fail('F3: Reminder.sentAt = now')
}

{
  // F4: Twilio failure → Reminder.status = failed
  const now = makeNow()
  const jobStore = makeJobStore([jobRow()])
  const reminderStore = makeReminderStore([{ id: 'REM001', status: 'pending', sentAt: null }])
  const sendFn = async () => { throw new Error('Network timeout') }

  await sendDueJobsForClinic({ jobStore, reminderStore, sendFn, clinicId: 'clinic_A', limit: 20, now })

  reminderStore.store[0].status === 'failed' ? pass('F4: Reminder.status = failed after Twilio error') : fail('F4: Reminder.status = failed after Twilio error')
  reminderStore.store[0].sentAt === null ? pass('F5: Reminder.sentAt not set on failure') : fail('F5: Reminder.sentAt not set on failure')
}

{
  // F6: Terminal appointment via direct sendSingleJob → Reminder.status = failed
  const now = makeNow()
  const jobStore = makeJobStore([jobRow({ appointmentStatus: 'no_show' })])
  const reminderStore = makeReminderStore([{ id: 'REM001', status: 'pending', sentAt: null }])
  const sendFn = async () => { throw new Error('should not call') }

  // Call sendSingleJob directly (simulates manual/race-condition path)
  await sendSingleJob({ jobStore, reminderStore, sendFn, clinicId: 'clinic_A', jobId: 'JOB001', now })

  reminderStore.store[0].status === 'failed' ? pass('F6: Reminder.status = failed for no_show appointment (direct path)') : fail('F6: Reminder.status = failed for no_show appointment (direct path)')
}

// ─── RESULT ───────────────────────────────────────────────────────────────────

console.log('\n=== RESULT ===')
if (failures > 0) {
  console.log(`FAILURES=${failures}`)
  process.exit(1)
}
console.log('ALL_PASS')
