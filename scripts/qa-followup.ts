import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '../lib/prisma-client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const CLINIC_ID = 'cmnkmp2h40000dq9kj4vgb2tu'
const TWILIO_TO = 'whatsapp:+14155238886'
const PHONE1 = '+966099990001'
const PHONE2 = '+966099990002'

let msgCounter = 500

async function send(phone: string, body: string): Promise<{ status: number; json: any }> {
  const sid = `SMtest${Date.now()}${msgCounter++}`
  const payload = new URLSearchParams({ From: `whatsapp:${phone}`, To: TWILIO_TO, Body: body, MessageSid: sid }).toString()
  const res = await fetch('http://localhost:3000/api/whatsapp/webhook-v2', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: payload,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function getSession(phone: string) {
  return prisma.conversationSession.findUnique({
    where: { phoneNumber_clinicId: { phoneNumber: phone, clinicId: CLINIC_ID } },
  })
}
async function getMessages(sessionId: string) {
  return prisma.conversationMessage.findMany({
    where: { sessionId }, orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, sessionStateAtSend: true },
  })
}
async function wait(ms: number) { return new Promise(r => setTimeout(r, ms)) }
function log(m: string) { console.log('\n' + m) }
function step(m: string) { console.log('  → ' + m) }
function ok(m: string) { console.log('  ✅ ' + m) }
function fail(m: string) { console.log('  ❌ FAIL: ' + m) }
function warn(m: string) { console.log('  ⚠️  ' + m) }

type TimelineEntry = { fromState: string; toState: string; triggerType: string; createdAt: string }
type TimelineResponse = { sessionId: string; timeline: TimelineEntry[] }

async function fetchTimeline(sessionId: string): Promise<TimelineResponse | null> {
  const res = await fetch(`http://localhost:3000/api/debug/session/${sessionId}/timeline`)
  if (res.status === 404) return null
  return res.json().catch(() => null)
}

const TERMINAL_STATES = new Set(['BOOKING_CONFIRMED', 'CANCELLATION_CONFIRMED', 'EXPIRED', 'CORRUPTED', 'BOOKING_FAILED'])
const ALLOWED_RESET_TRIGGERS = new Set(['SESSION_RESET', 'SESSION_CREATED', 'SESSION_RESET_AFTER_BOOKING', 'SESSION_RESET_AFTER_CANCELLATION'])

function validateTimeline(data: TimelineResponse | null, label: string, expectedTriggers: string[]) {
  if (!data) { fail(`${label}: timeline fetch returned null`); return }
  const { timeline } = data

  const path = timeline.length > 0
    ? [timeline[0].fromState, ...timeline.map(t => t.toState)]
        .filter((s, i, arr) => i === 0 || s !== arr[i - 1])
        .join(' → ')
    : '(empty)'
  const triggers = timeline.map(t => t.triggerType)

  log(`Timeline [${label}]:\n  ${path}`)
  step(`Triggers:\n  [${triggers.join(', ')}]`)

  for (let i = 0; i < timeline.length - 1; i++) {
    const a = timeline[i], b = timeline[i + 1]
    if (a.fromState === b.fromState && a.toState === b.toState && a.triggerType === b.triggerType) {
      fail(`Duplicate consecutive transition at [${i}]: ${a.fromState} → ${a.toState} [${a.triggerType}]`)
    }
  }

  for (let i = 0; i < timeline.length - 1; i++) {
    const t = timeline[i], next = timeline[i + 1]
    if (TERMINAL_STATES.has(t.toState) && !ALLOWED_RESET_TRIGGERS.has(next.triggerType)) {
      fail(`Impossible jump after terminal ${t.toState} → ${next.toState} [${next.triggerType}]`)
    }
  }

  for (const expected of expectedTriggers) {
    if (triggers.includes(expected)) ok(`Trigger present: ${expected}`)
    else fail(`Missing expected trigger: ${expected}`)
  }
}

// ─────────────────────────────────────────────────
// SCENARIO 3 FOLLOWUP: TTL simulation
// ─────────────────────────────────────────────────
async function scenario3_ttl() {
  log('═══ S3 TTL SIMULATION ═══')

  let sess = await getSession(PHONE2)
  step(`Current state: ${sess?.currentState}, slotTimeId: ${sess?.slotTimeId}`)

  if (!sess?.slotTimeId) { fail('PHONE2 has no held slot — cannot test TTL'); return }

  const heldSlot = await prisma.availableSlot.findUnique({ where: { id: sess.slotTimeId } })
  step(`Slot before TTL: isHeld=${heldSlot?.isHeld}, heldBySessionId=${heldSlot?.heldBySessionId}`)

  // Fast-forward: set expiresAt to 1 min ago on this test-phone session
  await prisma.conversationSession.update({
    where: { id: sess.id },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  })
  step('Set session expiresAt to 1 min ago')

  const cronRes = await fetch('http://localhost:3000/api/cron/expire-sessions', {
    method: 'GET',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  const cronBody = await cronRes.json()
  step(`Cron result: ${JSON.stringify(cronBody)}`)

  const postSlot = await prisma.availableSlot.findUnique({ where: { id: sess.slotTimeId } })
  step(`Slot after cron: isHeld=${postSlot?.isHeld}, heldBySessionId=${postSlot?.heldBySessionId}`)

  if (!postSlot?.isHeld && postSlot?.heldBySessionId === null) ok('Slot hold released after TTL cron')
  else fail(`Slot still held: isHeld=${postSlot?.isHeld}`)

  const postSess = await getSession(PHONE2)
  step(`Session state after cron: ${postSess?.currentState}`)
  if (postSess?.currentState === 'EXPIRED') ok('Session transitioned to EXPIRED')
  else fail(`Expected EXPIRED, got ${postSess?.currentState}`)

  const bookableCheck = await prisma.availableSlot.findFirst({
    where: { id: sess.slotTimeId, isBooked: false, isHeld: false },
  })
  if (bookableCheck) ok('Slot is FREE and bookable again')
  else fail('Slot is still not free/bookable')

  const apptCheck = await prisma.appointment.findFirst({
    where: { clinicId: CLINIC_ID, scheduledAt: heldSlot?.startTime, status: { not: 'cancelled' } },
  })
  if (!apptCheck) ok('No orphan appointment for this slot')
  else fail(`Orphan appointment exists: ${apptCheck.id}`)

  log('─── S3 TTL COMPLETE ───')
}

// ─────────────────────────────────────────────────
// SCENARIO 4 FOLLOWUP: Clean cancellation
// ─────────────────────────────────────────────────
async function scenario4_clean() {
  log('═══ S4 CANCELLATION (CLEAN STATE) ═══')

  const patient = await prisma.patient.findFirst({
    where: { clinicId: CLINIC_ID, phone: PHONE1 },
    select: { id: true },
  })
  if (!patient) { fail('No patient for PHONE1'); return }

  const appt = await prisma.appointment.findFirst({
    where: { clinicId: CLINIC_ID, patientId: patient.id, status: { in: ['scheduled', 'confirmed'] } },
    orderBy: { scheduledAt: 'asc' },
    include: { reminders: true },
  })
  if (!appt) { fail('No active appointment to cancel for PHONE1'); return }
  step(`Appointment to cancel: ${appt.id}, status=${appt.status}, scheduledAt=${appt.scheduledAt}`)
  step(`Reminders: ${appt.reminders.length}`)

  const bookedSlot = await prisma.availableSlot.findFirst({
    where: { clinicId: CLINIC_ID, serviceId: appt.serviceId, startTime: appt.scheduledAt, isBooked: true },
  })
  step(`Booked slot: ${bookedSlot?.id}, isBooked=${bookedSlot?.isBooked}`)

  const preJobs = await prisma.notificationJob.findMany({
    where: { appointmentId: appt.id, status: { in: ['pending', 'queued'] } },
  })
  step(`Pending notification jobs before cancel: ${preJobs.length}`)

  // First: probe cancel intent from mid-flow state (document the bug)
  let sess = await getSession(PHONE1)
  step(`PHONE1 current state: ${sess?.currentState}`)
  step('Sending cancel intent from mid-flow state (documenting bug)...')
  await send(PHONE1, 'أبغى ألغي الحجز')
  await wait(3000)
  sess = await getSession(PHONE1)
  step(`State after cancel intent in mid-flow: ${sess?.currentState}`)
  if (sess?.currentState === 'CANCELLATION_PENDING') {
    ok('Cancel intent handled mid-flow (unexpected capability)')
  } else {
    fail(`Cancel intent IGNORED mid-flow: state=${sess?.currentState} — real bug`)
  }

  // Drain: expire the PHONE1 session so resolveSession resets on next message
  if (sess && !['IDLE', 'BOOKING_CONFIRMED', 'CANCELLATION_CONFIRMED', 'BOOKING_FAILED', 'EXPIRED', 'CORRUPTED'].includes(sess.currentState)) {
    await prisma.conversationSession.update({
      where: { id: sess.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })
    const cronRes = await fetch('http://localhost:3000/api/cron/expire-sessions', {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    step(`Expire PHONE1 session cron: ${JSON.stringify(await cronRes.json())}`)
    await wait(1000)
  }

  // Now send cancel from clean IDLE
  step('Sending cancel intent from clean IDLE (after reset)...')
  await send(PHONE1, 'أبغى ألغي الحجز')
  await wait(3000)
  sess = await getSession(PHONE1)
  step(`State: ${sess?.currentState}`)
  if (sess?.currentState !== 'CANCELLATION_PENDING') { fail(`Expected CANCELLATION_PENDING, got ${sess?.currentState}`); return }
  ok('State = CANCELLATION_PENDING')

  step('Sending: نعم (confirm cancel)')
  await send(PHONE1, 'نعم')
  await wait(3000)
  sess = await getSession(PHONE1)
  step(`State after confirm: ${sess?.currentState}`)

  const postAppt = await prisma.appointment.findUnique({ where: { id: appt.id } })
  step(`Appointment status: ${postAppt?.status}`)
  if (postAppt?.status === 'cancelled') ok('Appointment marked cancelled')
  else fail(`Appointment NOT cancelled: ${postAppt?.status}`)

  if (bookedSlot) {
    const postSlot = await prisma.availableSlot.findUnique({ where: { id: bookedSlot.id } })
    step(`Slot after cancel: isBooked=${postSlot?.isBooked}, isHeld=${postSlot?.isHeld}`)
    if (!postSlot?.isBooked) ok('Slot freed after cancellation')
    else fail('SLOT STILL BOOKED after appointment cancelled — not freed')
  }

  const postJobs = await prisma.notificationJob.findMany({ where: { appointmentId: appt.id } })
  step(`NotificationJob statuses: ${postJobs.map(j => j.status).join(', ')}`)
  const anyPending = postJobs.some(j => ['pending', 'queued'].includes(j.status))
  if (!anyPending) ok('All notification jobs invalidated')
  else fail('Some notification jobs still pending after cancellation')

  const sess4c = await getSession(PHONE1)
  if (sess4c) {
    const tl4c = await fetchTimeline(sess4c.id)
    validateTimeline(tl4c, 'S4 CANCEL CLEAN', ['INTENT_CANCEL'])
  }

  // Idempotency
  step('Idempotency: sending cancel again for same (now-cancelled) appointment...')
  await send(PHONE1, 'أبغى ألغي الحجز')
  await wait(3000)
  sess = await getSession(PHONE1)
  step(`State: ${sess?.currentState}`)
  if (sess?.currentState === 'CANCELLATION_PENDING') {
    await send(PHONE1, 'نعم')
    await wait(3000)
    sess = await getSession(PHONE1)
    const postAppt2 = await prisma.appointment.findUnique({ where: { id: appt.id } })
    step(`After 2nd cancel: state=${sess?.currentState}, appt status=${postAppt2?.status}`)
    if (postAppt2?.status === 'cancelled') ok('Idempotent: still cancelled after second attempt')
    else fail(`Status changed unexpectedly: ${postAppt2?.status}`)
  } else {
    step(`State ${sess?.currentState} — no appointment found, system correctly reported none`)
    ok('No active appointment found — idempotent by absence')
  }

  log('─── S4 COMPLETE ───')
}

// ─────────────────────────────────────────────────
// SCENARIO 5: CONCURRENT USERS
// ─────────────────────────────────────────────────
async function scenario5_concurrent() {
  log('═══ S5 CONCURRENT USERS ═══')

  const freeSlots = await prisma.availableSlot.findMany({
    where: {
      clinicId: CLINIC_ID,
      serviceId: 'cmnkrgtrv000gdq9k1whjk7em',
      isBooked: false,
      isHeld: false,
      startTime: { gte: new Date() },
    },
    orderBy: { startTime: 'asc' },
    take: 3,
  })
  if (freeSlots.length < 1) { fail('No free slots for concurrent test'); return }
  const targetSlot = freeSlots[0]
  step(`Target slot: ${targetSlot.id} at ${targetSlot.startTime.toISOString()}`)

  // Compute a plain Arabic date message without template interpolation issues
  const now = new Date()
  const diffMs = targetSlot.startTime.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / 86_400_000)
  let dateMsg: string
  if (diffDays <= 0) {
    dateMsg = 'اليوم'
  } else if (diffDays === 1) {
    dateMsg = 'بكرا'
  } else {
    dateMsg = 'الاسبوع'
  }
  step(`Date message to send: "${dateMsg}" (slot is ${diffDays} day(s) from now)`)

  // Bring PHONE1 to SLOT_COLLECTION_TIME
  step('Bringing PHONE1 to SLOT_COLLECTION_TIME...')
  await send(PHONE1, 'أبغى أحجز')
  await wait(3000)
  let s1 = await getSession(PHONE1)
  const svcs1 = ((s1?.ambiguousIntents ?? []) as Array<{ id: string; name: string }>)
  const t1idx = svcs1.findIndex(s => typeof s.name === 'string' && s.name.includes('تنظيف'))
  if (t1idx === -1) { fail(`تنظيف not in PHONE1 services: ${JSON.stringify(svcs1.map(s => s.name))}`); return }
  await send(PHONE1, String(t1idx + 1))
  await wait(3000)
  await send(PHONE1, dateMsg)
  await wait(4000)
  s1 = await getSession(PHONE1)
  step(`PHONE1 state: ${s1?.currentState}, offered: ${JSON.stringify(((s1?.ambiguousIntents ?? []) as any[]).map((s: any) => s.id))}`)

  // Bring PHONE2 to SLOT_COLLECTION_TIME
  step('Bringing PHONE2 to SLOT_COLLECTION_TIME...')
  await send(PHONE2, 'أبغى أحجز')
  await wait(3000)
  let s2 = await getSession(PHONE2)
  const svcs2 = ((s2?.ambiguousIntents ?? []) as Array<{ id: string; name: string }>)
  const t2idx = svcs2.findIndex(s => typeof s.name === 'string' && s.name.includes('تنظيف'))
  if (t2idx === -1) { fail(`تنظيف not in PHONE2 services: ${JSON.stringify(svcs2.map(s => s.name))}`); return }
  await send(PHONE2, String(t2idx + 1))
  await wait(3000)
  await send(PHONE2, dateMsg)
  await wait(4000)
  s2 = await getSession(PHONE2)
  step(`PHONE2 state: ${s2?.currentState}, offered: ${JSON.stringify(((s2?.ambiguousIntents ?? []) as any[]).map((s: any) => s.id))}`)

  if (s1?.currentState !== 'SLOT_COLLECTION_TIME' || s2?.currentState !== 'SLOT_COLLECTION_TIME') {
    warn(`Not both at SLOT_COLLECTION_TIME: S1=${s1?.currentState}, S2=${s2?.currentState}`)
  }

  const slots1 = ((s1?.ambiguousIntents ?? []) as Array<{ id: string; startTime: string }>)
  const slots2 = ((s2?.ambiguousIntents ?? []) as Array<{ id: string; startTime: string }>)

  // Find a shared slot
  const sharedEntry = slots1.find(a => slots2.some(b => b.id === a.id))

  if (!sharedEntry) {
    warn('No shared slot offered to both — testing with respective first slots (no direct race possible)')
    const p1slot = slots1[0]
    const p2slot = slots2[0]
    if (!p1slot || !p2slot) { fail('No slots to select'); return }
    step(`PHONE1 first slot: ${p1slot.id}`)
    step(`PHONE2 first slot: ${p2slot.id}`)

    const [r1, r2] = await Promise.all([send(PHONE1, '1'), send(PHONE2, '1')])
    step(`PHONE1: ${r1.status}, PHONE2: ${r2.status}`)
    await wait(4000)
    s1 = await getSession(PHONE1)
    s2 = await getSession(PHONE2)
    step(`After race: PHONE1=${s1?.currentState}, PHONE2=${s2?.currentState}`)

    const sameTimeAppts = await prisma.appointment.count({
      where: { clinicId: CLINIC_ID, scheduledAt: (await prisma.availableSlot.findUnique({ where: { id: p1slot.id }, select: { startTime: true } }))?.startTime, status: { not: 'cancelled' } },
    })
    step(`Appointments at PHONE1 slot time: ${sameTimeAppts}`)
    if (sameTimeAppts <= 1) ok('No double-booking (different slots)')
    else fail(`DOUBLE BOOKING: ${sameTimeAppts} appointments`)

    log('─── S5 COMPLETE (different slots — no race) ───')
    return
  }

  const sharedSlotId = sharedEntry.id
  const pos1 = slots1.findIndex(s => s.id === sharedSlotId) + 1
  const pos2 = slots2.findIndex(s => s.id === sharedSlotId) + 1
  step(`Shared slot: ${sharedSlotId}`)
  step(`PHONE1 selects position ${pos1}, PHONE2 selects position ${pos2}`)

  const preSlot = await prisma.availableSlot.findUnique({ where: { id: sharedSlotId } })
  step(`Pre-race: isHeld=${preSlot?.isHeld}, isBooked=${preSlot?.isBooked}`)

  step('Firing simultaneous selection of SAME slot...')
  const [r1, r2] = await Promise.all([send(PHONE1, String(pos1)), send(PHONE2, String(pos2))])
  step(`PHONE1: ${r1.status}, PHONE2: ${r2.status}`)
  await wait(5000)

  s1 = await getSession(PHONE1)
  s2 = await getSession(PHONE2)
  const postSlot = await prisma.availableSlot.findUnique({ where: { id: sharedSlotId } })

  step(`PHONE1: state=${s1?.currentState}, slotTimeId=${s1?.slotTimeId}`)
  step(`PHONE2: state=${s2?.currentState}, slotTimeId=${s2?.slotTimeId}`)
  step(`Slot: isHeld=${postSlot?.isHeld}, heldBy=${postSlot?.heldBySessionId}, isBooked=${postSlot?.isBooked}`)

  const s1Holds = s1?.slotTimeId === sharedSlotId
  const s2Holds = s2?.slotTimeId === sharedSlotId

  if (s1Holds && s2Holds) {
    fail('BOTH sessions claim the same slot — race condition / locking failure')
  } else if (s1Holds || s2Holds) {
    ok('Exactly one session holds the slot — row-level lock works correctly')
  } else {
    warn('Neither session holds the slot — both fell back (conflict path triggered for both)')
  }

  const slotStartTime = preSlot?.startTime
  const sameTimeAppts = await prisma.appointment.count({
    where: { clinicId: CLINIC_ID, scheduledAt: slotStartTime, status: { not: 'cancelled' } },
  })
  step(`Appointments at same slot time: ${sameTimeAppts}`)
  if (sameTimeAppts <= 1) ok('No double-booking in DB')
  else fail(`DOUBLE BOOKING: ${sameTimeAppts} appointments at same time`)

  const loserSess = s1Holds ? s2 : s1
  const loserPhone = s1Holds ? PHONE2 : PHONE1
  step(`Loser (${loserPhone}) state: ${loserSess?.currentState}`)
  if (loserSess?.currentState === 'SLOT_COLLECTION_TIME') ok('Loser offered alternative slots')
  else if (loserSess?.currentState === 'SLOT_COLLECTION_DATE') ok('Loser returned to date selection')
  else warn(`Loser in state: ${loserSess?.currentState}`)

  log('─── S5 COMPLETE ───')
}

// ─────────────────────────────────────────────────
// SCENARIO 6: ESCALATION (clean state, confirmed phrase)
// ─────────────────────────────────────────────────
async function scenario6_clean() {
  log('═══ S6 ESCALATION FLOW ═══')

  // PHONE2 is EXPIRED from S3 — resolveSession resets to IDLE on next message
  step('Sending known-matching escalation phrase: "اريد موظف"')
  await send(PHONE2, 'اريد موظف')
  await wait(3000)

  let sess = await getSession(PHONE2)
  step(`State: ${sess?.currentState}, handoffActive: ${sess?.handoffActive}`)

  if (sess?.currentState === 'HUMAN_ESCALATION_PENDING') ok('State = HUMAN_ESCALATION_PENDING')
  else fail(`Expected HUMAN_ESCALATION_PENDING, got ${sess?.currentState}`)

  if (sess?.handoffActive) ok('handoffActive = true — bot suppressed')
  else fail('handoffActive NOT set')

  const lead = await prisma.lead.findFirst({
    where: { clinicId: CLINIC_ID, patientPhone: PHONE2 },
    orderBy: { createdAt: 'desc' },
  })
  step(`Lead: ${lead ? `dropReason=${lead.dropReason}` : 'null'}`)
  if (lead) ok('Lead saved on escalation')
  else fail('No lead created on escalation')

  // Message during handoff — should be silently suppressed (no outbound reply)
  step('Sending message during handoff...')
  await send(PHONE2, 'هل أنتم هناك؟')
  await wait(2000)
  sess = await getSession(PHONE2)
  step(`State after mid-handoff message: ${sess?.currentState}`)
  if (sess?.currentState === 'HUMAN_ESCALATION_PENDING') ok('State unchanged — bot silent during handoff')
  else fail(`State changed during handoff: ${sess?.currentState}`)

  const msgs = await getMessages(sess!.id)
  const handoffReplies = msgs.filter(m => m.role === 'assistant' && m.sessionStateAtSend === 'HUMAN_ESCALATION_PENDING')
  step(`Bot replies in ESCALATION_PENDING state: ${handoffReplies.length}`)
  handoffReplies.forEach(m => step(`  content: ${m.content.substring(0, 60)}`))
  if (handoffReplies.length === 1) ok('Only 1 bot reply in handoff — 2nd message suppressed correctly')
  else if (handoffReplies.length > 1) fail(`Bot replied ${handoffReplies.length} times — should be 1`)
  else warn('0 replies logged in ESCALATION_PENDING — check state at send time')

  // Resume via booking intent
  step('Testing resume via new_booking intent...')
  await send(PHONE2, 'أبغى أحجز')
  await wait(3000)
  sess = await getSession(PHONE2)
  step(`State after booking intent: ${sess?.currentState}, handoffActive: ${sess?.handoffActive}`)
  if (!sess?.handoffActive && sess?.currentState === 'SLOT_COLLECTION_SERVICE') {
    ok('Bot resumed — handoff cleared, booking flow started')
  } else if (sess?.handoffActive) {
    fail('handoffActive still true — handoff recovery did not fire')
  } else {
    warn(`State=${sess?.currentState} — unexpected post-recovery state`)
  }

  const tl6c = await fetchTimeline(sess!.id)
  validateTimeline(tl6c, 'S6 ESCALATION CLEAN', ['USER_REQUESTED_ESCALATION'])

  // ── Test escalation from mid-booking state (Bug 5 confirmation) ──
  log('─── Sub-test: escalation from SLOT_COLLECTION_DATE ───')
  sess = await getSession(PHONE2)
  if (sess?.currentState === 'SLOT_COLLECTION_SERVICE') {
    const svcs = ((sess.ambiguousIntents ?? []) as Array<{ id: string; name: string }>)
    const tidx = svcs.findIndex(s => typeof s.name === 'string' && s.name.includes('تنظيف'))
    await send(PHONE2, String(tidx + 1))
    await wait(3000)
    sess = await getSession(PHONE2)
    step(`After service selection: ${sess?.currentState}`)
  }

  if (sess?.currentState !== 'SLOT_COLLECTION_DATE') {
    warn(`Expected SLOT_COLLECTION_DATE, in ${sess?.currentState} — skipping mid-flow escalation sub-test`)
    log('─── S6 COMPLETE ───')
    return
  }

  step(`Sending escalation from ${sess.currentState}...`)
  await send(PHONE2, 'اريد موظف')
  await wait(3000)
  sess = await getSession(PHONE2)
  step(`State after mid-flow escalation: ${sess?.currentState}, handoffActive: ${sess?.handoffActive}`)

  if (sess?.currentState === 'HUMAN_ESCALATION_PENDING') {
    ok('Mid-flow escalation works — state transitioned correctly')
  } else {
    fail(`Mid-flow escalation FAILED: state=${sess?.currentState}`)
    step('Root cause: FSM has no escalation trigger for SLOT_COLLECTION_DATE')
    step(`handoffActive=${sess?.handoffActive} — may be set even with wrong state`)
  }

  log('─── S6 COMPLETE ───')
}

// ─────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────
async function main() {
  log('QA FOLLOWUP RUNNER — ' + new Date().toISOString())
  try { await scenario3_ttl() } catch (e) { console.error('S3 TTL CRASH:', e) }
  try { await scenario4_clean() } catch (e) { console.error('S4 CRASH:', e) }
  try { await scenario5_concurrent() } catch (e) { console.error('S5 CRASH:', e) }
  try { await scenario6_clean() } catch (e) { console.error('S6 CRASH:', e) }
  log('\nFOLLOWUP COMPLETE')
  await prisma.$disconnect()
}
main().catch(e => { console.error('FATAL:', e); process.exit(1) })
