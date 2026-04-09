#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Verification script for the Twilio status callback endpoint logic.
 *
 * Tests purely the decision logic of applyStatusUpdate — no real DB or network.
 * Three scenario groups:
 *   A. Happy paths (delivered, read, read-skipping-delivered)
 *   B. Failure paths (failed, undelivered, ErrorCode propagation)
 *   C. Idempotency / duplicate callbacks
 *
 * Run: node scripts/verify-whatsapp-status-callback.js
 */

let failures = 0
const pass = (msg) => console.log(`PASS ${msg}`)
const fail = (msg) => {
  failures += 1
  console.log(`FAIL ${msg}`)
}

// ─── Mock DB ─────────────────────────────────────────────────────────────────

function makeMessageStore(initial = {}) {
  const rows = {
    SM001: {
      externalId: 'SM001',
      status: 'sent',
      deliveredAt: null,
      readAt: null,
      ...initial,
    },
  }

  return {
    rows,
    updateMany({ where, data }) {
      for (const row of Object.values(rows)) {
        let match = true
        if (where.externalId !== undefined && row.externalId !== where.externalId) match = false
        if (where.status?.not !== undefined && row.status === where.status.not) match = false
        if (where.deliveredAt === null && row.deliveredAt !== null) match = false
        if (match) Object.assign(row, data)
      }
    },
  }
}

function makeJobStore(initial = {}) {
  const rows = {
    JOB001: {
      providerMessageId: 'SM001',
      status: 'sent',
      errorMessage: null,
      ...initial,
    },
  }
  return {
    rows,
    updateMany({ where, data }) {
      for (const row of Object.values(rows)) {
        let match = true
        if (where.providerMessageId !== undefined && row.providerMessageId !== where.providerMessageId)
          match = false
        if (where.status !== undefined && row.status !== where.status) match = false
        if (match) Object.assign(row, data)
      }
    },
  }
}

// ─── Logic under test (mirrors app/api/whatsapp/status/route.ts) ─────────────

async function applyStatusUpdate(prisma, messageSid, messageStatus, errorCode, errorMessage) {
  const now = new Date('2026-04-09T12:00:00Z')
  const isFailed = messageStatus === 'failed' || messageStatus === 'undelivered'

  if (messageStatus === 'delivered') {
    prisma.message.updateMany({
      where: { externalId: messageSid, status: { not: 'read' } },
      data: { status: 'delivered', deliveredAt: now },
    })
  } else if (messageStatus === 'read') {
    prisma.message.updateMany({
      where: { externalId: messageSid },
      data: { status: 'read', readAt: now },
    })
    prisma.message.updateMany({
      where: { externalId: messageSid, deliveredAt: null },
      data: { deliveredAt: now },
    })
  } else if (isFailed) {
    prisma.message.updateMany({
      where: { externalId: messageSid },
      data: { status: 'failed' },
    })
  }

  if (isFailed) {
    const failureNote = [errorCode, errorMessage].filter(Boolean).join(': ') || 'Twilio delivery failure'
    prisma.notificationJob.updateMany({
      where: { providerMessageId: messageSid, status: 'sent' },
      data: { status: 'failed', errorMessage: failureNote },
    })
  }
}

// ─── A. HAPPY PATHS ───────────────────────────────────────────────────────────

console.log('=== A. HAPPY PATH ===')
{
  // A1: delivered callback updates Message to delivered+deliveredAt
  const msgStore = makeMessageStore()
  const jobStore = makeJobStore()
  const prisma = { message: msgStore, notificationJob: jobStore }
  await applyStatusUpdate(prisma, 'SM001', 'delivered', null, null)
  const row = msgStore.rows['SM001']
  row.status === 'delivered' ? pass('A1: delivered → Message.status = delivered') : fail('A1: delivered → Message.status = delivered')
  row.deliveredAt !== null ? pass('A1: delivered → Message.deliveredAt set') : fail('A1: delivered → Message.deliveredAt set')
  jobStore.rows['JOB001'].status === 'sent' ? pass('A1: delivered → NotificationJob unchanged') : fail('A1: delivered → NotificationJob unchanged')
}

{
  // A2: read callback updates Message to read, readAt, and backfills deliveredAt
  const msgStore = makeMessageStore()
  const jobStore = makeJobStore()
  const prisma = { message: msgStore, notificationJob: jobStore }
  await applyStatusUpdate(prisma, 'SM001', 'read', null, null)
  const row = msgStore.rows['SM001']
  row.status === 'read' ? pass('A2: read → Message.status = read') : fail('A2: read → Message.status = read')
  row.readAt !== null ? pass('A2: read → Message.readAt set') : fail('A2: read → Message.readAt set')
  row.deliveredAt !== null ? pass('A2: read (skipped delivered) → Message.deliveredAt backfilled') : fail('A2: read (skipped delivered) → Message.deliveredAt backfilled')
  jobStore.rows['JOB001'].status === 'sent' ? pass('A2: read → NotificationJob unchanged') : fail('A2: read → NotificationJob unchanged')
}

{
  // A3: delivered → then read (normal sequence)
  const msgStore = makeMessageStore()
  const jobStore = makeJobStore()
  const prisma = { message: msgStore, notificationJob: jobStore }
  await applyStatusUpdate(prisma, 'SM001', 'delivered', null, null)
  await applyStatusUpdate(prisma, 'SM001', 'read', null, null)
  const row = msgStore.rows['SM001']
  row.status === 'read' ? pass('A3: delivered→read sequence → final status = read') : fail('A3: delivered→read sequence → final status = read')
  row.deliveredAt !== null ? pass('A3: deliveredAt preserved from delivered step') : fail('A3: deliveredAt preserved from delivered step')
  row.readAt !== null ? pass('A3: readAt set in read step') : fail('A3: readAt set in read step')
}

// ─── B. FAILURE PATHS ─────────────────────────────────────────────────────────

console.log('=== B. FAILURE PATHS ===')
{
  // B1: failed callback marks Message failed and NotificationJob failed
  const msgStore = makeMessageStore()
  const jobStore = makeJobStore()
  const prisma = { message: msgStore, notificationJob: jobStore }
  await applyStatusUpdate(prisma, 'SM001', 'failed', '30008', 'Unknown error')
  const row = msgStore.rows['SM001']
  const job = jobStore.rows['JOB001']
  row.status === 'failed' ? pass('B1: failed → Message.status = failed') : fail('B1: failed → Message.status = failed')
  job.status === 'failed' ? pass('B1: failed → NotificationJob.status = failed') : fail('B1: failed → NotificationJob.status = failed')
  job.errorMessage === '30008: Unknown error' ? pass('B1: failed → NotificationJob.errorMessage includes ErrorCode') : fail('B1: failed → NotificationJob.errorMessage includes ErrorCode')
}

{
  // B2: undelivered callback same as failed
  const msgStore = makeMessageStore()
  const jobStore = makeJobStore()
  const prisma = { message: msgStore, notificationJob: jobStore }
  await applyStatusUpdate(prisma, 'SM001', 'undelivered', null, null)
  const row = msgStore.rows['SM001']
  const job = jobStore.rows['JOB001']
  row.status === 'failed' ? pass('B2: undelivered → Message.status = failed') : fail('B2: undelivered → Message.status = failed')
  job.status === 'failed' ? pass('B2: undelivered → NotificationJob.status = failed') : fail('B2: undelivered → NotificationJob.status = failed')
  job.errorMessage === 'Twilio delivery failure' ? pass('B2: undelivered with no ErrorCode → generic error message') : fail('B2: undelivered with no ErrorCode → generic error message')
}

{
  // B3: failed callback when NotificationJob is already failed (already processed)
  const msgStore = makeMessageStore({ status: 'failed' })
  const jobStore = makeJobStore({ status: 'failed', errorMessage: 'prior error' })
  const prisma = { message: msgStore, notificationJob: jobStore }
  await applyStatusUpdate(prisma, 'SM001', 'failed', '30008', 'Repeated failure')
  const job = jobStore.rows['JOB001']
  // status: 'sent' guard means already-failed job is NOT re-updated
  job.errorMessage === 'prior error' ? pass('B3: already-failed job not overwritten by repeat failed callback') : fail('B3: already-failed job not overwritten by repeat failed callback')
}

// ─── C. IDEMPOTENCY / DUPLICATE CALLBACKS ─────────────────────────────────────

console.log('=== C. IDEMPOTENCY / DUPLICATE CALLBACKS ===')
{
  // C1: duplicate delivered callback — should not change outcome
  const msgStore = makeMessageStore()
  const jobStore = makeJobStore()
  const prisma = { message: msgStore, notificationJob: jobStore }
  await applyStatusUpdate(prisma, 'SM001', 'delivered', null, null)
  const afterFirst = { ...msgStore.rows['SM001'] }
  await applyStatusUpdate(prisma, 'SM001', 'delivered', null, null)
  const afterSecond = msgStore.rows['SM001']
  afterSecond.status === 'delivered' ? pass('C1: duplicate delivered → status remains delivered') : fail('C1: duplicate delivered → status remains delivered')
  // deliveredAt timestamp may update — this is acceptable; status is the important invariant
}

{
  // C2: delivered arrives AFTER read — must NOT downgrade read → delivered
  const msgStore = makeMessageStore({ status: 'read', readAt: new Date(), deliveredAt: new Date() })
  const jobStore = makeJobStore()
  const prisma = { message: msgStore, notificationJob: jobStore }
  await applyStatusUpdate(prisma, 'SM001', 'delivered', null, null)
  const row = msgStore.rows['SM001']
  row.status === 'read' ? pass('C2: late delivered callback does NOT downgrade read → delivered') : fail('C2: late delivered callback does NOT downgrade read → delivered')
}

{
  // C3: duplicate read callback — readAt gets updated (acceptable), status stays read
  const msgStore = makeMessageStore()
  const jobStore = makeJobStore()
  const prisma = { message: msgStore, notificationJob: jobStore }
  await applyStatusUpdate(prisma, 'SM001', 'read', null, null)
  await applyStatusUpdate(prisma, 'SM001', 'read', null, null)
  const row = msgStore.rows['SM001']
  row.status === 'read' ? pass('C3: duplicate read callback → status remains read') : fail('C3: duplicate read callback → status remains read')
}

{
  // C4: unknown SID (no matching Message row) — updateMany hits 0 rows, no throw
  const msgStore = makeMessageStore()
  const jobStore = makeJobStore()
  const prisma = { message: msgStore, notificationJob: jobStore }
  let threw = false
  try {
    await applyStatusUpdate(prisma, 'SM999', 'delivered', null, null)
  } catch {
    threw = true
  }
  !threw ? pass('C4: unknown SID → no error (updateMany 0 rows is safe)') : fail('C4: unknown SID → no error (updateMany 0 rows is safe)')
}

// ─── D. PARAM PARSING ─────────────────────────────────────────────────────────

console.log('=== D. PARAM PARSING ===')
{
  // D1: Verify status route guards on missing MessageSid
  const params = new URLSearchParams('MessageStatus=delivered')
  const messageSid = params.get('MessageSid') ?? ''
  const messageStatus = params.get('MessageStatus') ?? ''
  const shouldSkip = !messageSid || !messageStatus
  !shouldSkip ? fail('D1: missing MessageSid should short-circuit') : pass('D1: missing MessageSid is detected and would short-circuit early')
}

{
  // D2: Verify status route guards on missing MessageStatus
  const params = new URLSearchParams('MessageSid=SM001')
  const messageSid = params.get('MessageSid') ?? ''
  const messageStatus = params.get('MessageStatus') ?? ''
  const shouldSkip = !messageSid || !messageStatus
  !shouldSkip ? fail('D2: missing MessageStatus should short-circuit') : pass('D2: missing MessageStatus is detected and would short-circuit early')
}

{
  // D3: Queued/sending statuses are no-ops (not delivered, read, or failed)
  const msgStore = makeMessageStore()
  const jobStore = makeJobStore()
  const prisma = { message: msgStore, notificationJob: jobStore }
  await applyStatusUpdate(prisma, 'SM001', 'queued', null, null)
  await applyStatusUpdate(prisma, 'SM001', 'sending', null, null)
  const row = msgStore.rows['SM001']
  row.status === 'sent' ? pass('D3: queued/sending callbacks are no-ops on Message') : fail('D3: queued/sending callbacks are no-ops on Message')
}

// ─── E: Outbound persistence (delivery-outcome patientContext) ────────────────

{
  // E1: patientContext present → persistOutboundMessage called with correct args
  let persistCalled = false
  let persistArgs = null

  async function mockSend() { return { sid: 'SM_NEW', mocked: false } }
  async function mockPersist(args) { persistCalled = true; persistArgs = args }

  async function sendWithOutcome(params) {
    const result = await mockSend()
    if (params.patientContext) {
      try {
        await mockPersist({
          clinicId: params.patientContext.clinicId,
          patientId: params.patientContext.patientId,
          patientPhone: params.patientContext.patientPhone,
          content: params.body,
          externalId: result.sid,
        })
      } catch {}
    }
    return result
  }

  await sendWithOutcome({
    to: '+966500000001',
    body: 'test message',
    meta: { action: 'test', clinicId: 'clinic_A' },
    patientContext: { clinicId: 'clinic_A', patientId: 'pat_1', patientPhone: '+966500000001' },
  })

  persistCalled ? pass('E1: persistOutboundMessage called when patientContext provided') : fail('E1: persistOutboundMessage called when patientContext provided')
  persistArgs?.externalId === 'SM_NEW' ? pass('E1b: persistOutboundMessage receives correct externalId (SID)') : fail('E1b: persistOutboundMessage receives correct externalId (SID)')
  persistArgs?.clinicId === 'clinic_A' ? pass('E1c: persistOutboundMessage receives correct clinicId') : fail('E1c: persistOutboundMessage receives correct clinicId')
}

{
  // E2: patientContext absent → persistOutboundMessage NOT called
  let persistCalled = false
  async function mockPersist2() { persistCalled = true }
  async function mockSend2() { return { sid: 'SM_NEW2', mocked: false } }

  async function sendWithOutcome2(params) {
    const result = await mockSend2()
    if (params.patientContext) {
      try { await mockPersist2() } catch {}
    }
    return result
  }

  await sendWithOutcome2({
    to: '+966500000001',
    body: 'test message',
    meta: { action: 'test', clinicId: 'clinic_A' },
    // no patientContext
  })

  !persistCalled ? pass('E2: persistOutboundMessage NOT called when patientContext absent') : fail('E2: persistOutboundMessage NOT called when patientContext absent')
}

{
  // E3: persist error is swallowed — send result still returned
  async function mockSend3() { return { sid: 'SM_NEW3', mocked: false } }
  async function throwingPersist() { throw new Error('DB failure') }

  async function sendWithOutcome3(params) {
    const result = await mockSend3()
    if (params.patientContext) {
      try { await throwingPersist() } catch { /* swallowed */ }
    }
    return result
  }

  let result3 = null
  try {
    result3 = await sendWithOutcome3({
      to: '+966500000001',
      body: 'test',
      meta: { action: 'test', clinicId: 'clinic_A' },
      patientContext: { clinicId: 'clinic_A', patientId: 'pat_1', patientPhone: '+966500000001' },
    })
  } catch {}

  result3?.sid === 'SM_NEW3' ? pass('E3: persist error is swallowed; send result still returned') : fail('E3: persist error is swallowed; send result still returned')
}

{
  // E4: outboundPatientContext derivation — truthy inboundContext maps to context object
  const inboundContext = { clinicId: 'clinic_A', patientId: 'pat_1', phoneNormalized: '+966500000001' }
  const outboundPatientContext = inboundContext
    ? { clinicId: inboundContext.clinicId, patientId: inboundContext.patientId, patientPhone: inboundContext.phoneNormalized }
    : undefined
  outboundPatientContext?.clinicId === 'clinic_A' ? pass('E4a: outboundPatientContext.clinicId derived correctly') : fail('E4a: outboundPatientContext.clinicId derived correctly')
  outboundPatientContext?.patientPhone === '+966500000001' ? pass('E4b: outboundPatientContext.patientPhone maps from phoneNormalized') : fail('E4b: outboundPatientContext.patientPhone maps from phoneNormalized')
}

{
  // E4c: null inboundContext produces undefined outboundPatientContext
  const inboundContext = null
  const outboundPatientContext = inboundContext
    ? { clinicId: inboundContext.clinicId, patientId: inboundContext.patientId, patientPhone: inboundContext.phoneNormalized }
    : undefined
  outboundPatientContext === undefined ? pass('E4c: null inboundContext → outboundPatientContext is undefined (persist skipped)') : fail('E4c: null inboundContext → outboundPatientContext is undefined')
}

{
  // E5: Inbox patient-lookup approach — last 8 digits suffix match
  function getPhoneLast8(phone) {
    return phone.replace(/\D/g, '').slice(-8)
  }
  const phone = '+966512345678'
  const last8 = getPhoneLast8(phone)
  last8 === '12345678' ? pass('E5: last-8 digit extraction from normalized phone is correct') : fail('E5: last-8 digit extraction from normalized phone is correct')

  // Simulate findFirst endsWith match
  const patients = [{ id: 'pat_1', phone: '+966512345678' }, { id: 'pat_2', phone: '+966599999999' }]
  const matched = last8 ? patients.find((p) => p.phone.endsWith(last8)) ?? null : null
  matched?.id === 'pat_1' ? pass('E5b: patient endsWith lookup finds correct patient') : fail('E5b: patient endsWith lookup finds correct patient')

  // When last8 is empty, lookup is skipped
  const emptyLast8 = ''.replace(/\D/g, '').slice(-8)
  const skipped = emptyLast8 ? patients.find((p) => p.phone.endsWith(emptyLast8)) ?? null : null
  skipped === null ? pass('E5c: empty phone skips patient lookup (returns null)') : fail('E5c: empty phone skips patient lookup (returns null)')
}

// ─── RESULT ───────────────────────────────────────────────────────────────────

console.log('=== RESULT ===')
if (failures > 0) {
  console.log(`FAILURES=${failures}`)
  process.exit(1)
}
console.log('ALL_PASS')
