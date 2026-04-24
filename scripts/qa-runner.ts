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

let msgCounter = 100

async function send(phone: string, body: string): Promise<{ status: number; json: any }> {
  const sid = `SMtest${Date.now()}${msgCounter++}`
  const payload = new URLSearchParams({
    From: `whatsapp:${phone}`,
    To: TWILIO_TO,
    Body: body,
    MessageSid: sid,
  }).toString()

  const res = await fetch('http://localhost:3000/api/whatsapp/webhook-v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload,
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
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, sessionStateAtSend: true },
  })
}

async function getTransitions(sessionId: string) {
  return prisma.stateTransitionLog.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    select: { fromState: true, toState: true, triggerType: true },
  })
}

async function wait(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

function log(msg: string) { console.log('\n' + msg) }
function step(msg: string) { console.log('  → ' + msg) }
function ok(msg: string) { console.log('  ✅ ' + msg) }
function fail(msg: string) { console.log('  ❌ FAIL: ' + msg) }
function warn(msg: string) { console.log('  ⚠️  ' + msg) }

// ─────────────────────────────────────────────────
// SCENARIO 1: PERFECT FLOW
// ─────────────────────────────────────────────────
async function scenario1() {
  log('═══════════════════════════════════════════')
  log('SCENARIO 1: PERFECT FLOW (+966099990001)')
  log('═══════════════════════════════════════════')

  // Clean PHONE1 session state before starting
  const old1 = await getSession(PHONE1)
  if (old1) {
    await prisma.stateTransitionLog.deleteMany({ where: { sessionId: old1.id } })
    await prisma.conversationMessage.deleteMany({ where: { sessionId: old1.id } })
    await prisma.conversationSession.delete({ where: { id: old1.id } })
    step(`Cleaned PHONE1 session ${old1.id}`)
  }

  // Step 1: Booking intent
  step('Sending: أبغى أحجز تنظيف')
  let r = await send(PHONE1, 'أبغى أحجز تنظيف')
  step(`Webhook response: ${r.status} ${JSON.stringify(r.json)}`)
  await wait(3000)

  let sess = await getSession(PHONE1)
  if (!sess) { fail('No session created'); return }
  step(`State after booking intent: ${sess.currentState}`)
  step(`ambiguousIntents (services): ${JSON.stringify(sess.ambiguousIntents)}`)

  if (sess.currentState !== 'SLOT_COLLECTION_SERVICE') {
    fail(`Expected SLOT_COLLECTION_SERVICE, got ${sess.currentState}`)
    return
  }
  ok('State = SLOT_COLLECTION_SERVICE')

  // Find تنظيف index in the services list
  const services = sess.ambiguousIntents as Array<{id: string; name: string}>
  const tandeefIdx = services.findIndex(s => s.name.includes('تنظيف'))
  if (tandeefIdx === -1) { fail('تنظيف not found in services list'); return }
  const tandeefPos = tandeefIdx + 1
  step(`تنظيف الأسنان is option #${tandeefPos}`)

  // Step 2: Select تنظيف
  step(`Sending: ${tandeefPos}`)
  r = await send(PHONE1, String(tandeefPos))
  step(`Webhook response: ${r.status}`)
  await wait(3000)

  sess = await getSession(PHONE1)!
  step(`State after service selection: ${sess!.currentState}, slotServiceId: ${sess!.slotServiceId}`)
  if (sess!.currentState !== 'SLOT_COLLECTION_DATE') { fail(`Expected SLOT_COLLECTION_DATE, got ${sess!.currentState}`); return }
  ok('State = SLOT_COLLECTION_DATE, slotServiceId set')

  // Step 3: Date — "بكرا" (tomorrow)
  step('Sending: بكرا')
  r = await send(PHONE1, 'بكرا')
  step(`Webhook response: ${r.status}`)
  await wait(4000)

  sess = await getSession(PHONE1)!
  step(`State after date: ${sess!.currentState}`)
  step(`Offered slots: ${JSON.stringify(sess!.ambiguousIntents)}`)

  if (sess!.currentState !== 'SLOT_COLLECTION_TIME') { fail(`Expected SLOT_COLLECTION_TIME, got ${sess!.currentState}`); return }
  ok('State = SLOT_COLLECTION_TIME, slots offered')

  const offeredSlots = sess!.ambiguousIntents as Array<{id: string; startTime: string}>
  if (!offeredSlots || offeredSlots.length === 0) { fail('No slots offered'); return }
  step(`First slot: ${offeredSlots[0].startTime}`)

  // Step 4: Select slot #1
  step('Sending: 1')
  r = await send(PHONE1, '1')
  step(`Webhook response: ${r.status}`)
  await wait(3000)

  sess = await getSession(PHONE1)!
  step(`State after slot: ${sess!.currentState}, slotTimeId: ${sess!.slotTimeId}`)
  
  // Verify hold in DB
  if (sess!.slotTimeId) {
    const heldSlot = await prisma.availableSlot.findUnique({ where: { id: sess!.slotTimeId } })
    step(`Slot isHeld=${heldSlot?.isHeld}, heldBySessionId=${heldSlot?.heldBySessionId}`)
    if (heldSlot?.isHeld && heldSlot.heldBySessionId === sess!.id) ok('Slot is held by this session')
    else fail('Slot is NOT properly held')
  }

  if (sess!.currentState !== 'SLOT_COLLECTION_PATIENT_NAME') { fail(`Expected SLOT_COLLECTION_PATIENT_NAME, got ${sess!.currentState}`); return }
  ok('State = SLOT_COLLECTION_PATIENT_NAME')

  // Step 5: Patient name
  step('Sending: احمد اختبار QA')
  r = await send(PHONE1, 'احمد اختبار QA')
  step(`Webhook response: ${r.status}`)
  await wait(3000)

  sess = await getSession(PHONE1)!
  step(`State: ${sess!.currentState}, name: ${sess!.slotPatientName}`)
  if (sess!.currentState !== 'SLOT_COLLECTION_PATIENT_DOB') { fail(`Expected SLOT_COLLECTION_PATIENT_DOB, got ${sess!.currentState}`); return }
  ok('State = SLOT_COLLECTION_PATIENT_DOB')

  // Step 6: DOB
  step('Sending: 1990-05-15')
  r = await send(PHONE1, '1990-05-15')
  step(`Webhook response: ${r.status}`)
  await wait(3000)

  sess = await getSession(PHONE1)!
  step(`State: ${sess!.currentState}, dob: ${sess!.slotPatientDob}`)
  if (sess!.currentState !== 'SLOT_COLLECTION_PHONE_CONFIRM') { fail(`Expected SLOT_COLLECTION_PHONE_CONFIRM, got ${sess!.currentState}`); return }
  ok('State = SLOT_COLLECTION_PHONE_CONFIRM')

  // Step 7: Confirm phone
  step('Sending: نعم')
  r = await send(PHONE1, 'نعم')
  step(`Webhook response: ${r.status}`)
  await wait(3000)

  sess = await getSession(PHONE1)!
  step(`State: ${sess!.currentState}, phoneConfirmed: ${sess!.slotPhoneConfirmed}`)
  if (sess!.currentState !== 'CONFIRMATION_PENDING') { fail(`Expected CONFIRMATION_PENDING, got ${sess!.currentState}`); return }
  ok('State = CONFIRMATION_PENDING')

  // Capture pre-booking state
  const slotIdToBook = sess!.slotTimeId!
  const preSlot = await prisma.availableSlot.findUnique({ where: { id: slotIdToBook } })
  step(`Pre-booking slot: isBooked=${preSlot?.isBooked}, isHeld=${preSlot?.isHeld}`)

  const preApptCount = await prisma.appointment.count({ where: { clinicId: CLINIC_ID } })
  const preReminderCount = await prisma.reminder.count({ where: { clinicId: CLINIC_ID } })
  const preNotifCount = await prisma.notificationJob.count({ where: { clinicId: CLINIC_ID } })

  // Step 8: Confirm booking
  step('Sending: نعم (final confirmation)')
  r = await send(PHONE1, 'نعم')
  step(`Webhook response: ${r.status}`)
  await wait(6000) // Give time for booking + 2s sleep + reminder creation

  sess = await getSession(PHONE1)!
  step(`Final state: ${sess!.currentState}, bookingId: ${sess!.bookingId}`)

  // Verify appointment
  if (!sess!.bookingId) { fail('No bookingId on session'); }
  else {
    const appt = await prisma.appointment.findUnique({ where: { id: sess!.bookingId } })
    step(`Appointment: ${JSON.stringify(appt)}`)
    if (appt) ok(`Appointment created: status=${appt.status}`)
    else fail('Appointment not found in DB')

    // Verify slot is booked
    const finalSlot = await prisma.availableSlot.findUnique({ where: { id: slotIdToBook } })
    step(`Slot after booking: isBooked=${finalSlot?.isBooked}, isHeld=${finalSlot?.isHeld}`)
    if (finalSlot?.isBooked && !finalSlot.isHeld) ok('Slot is BOOKED and hold released')
    else fail(`Slot state unexpected: isBooked=${finalSlot?.isBooked} isHeld=${finalSlot?.isHeld}`)

    // Verify reminders
    const postReminderCount = await prisma.reminder.count({ where: { clinicId: CLINIC_ID } })
    const newReminders = postReminderCount - preReminderCount
    step(`New reminders created: ${newReminders}`)
    if (newReminders > 0) ok(`${newReminders} reminder(s) created`)
    else fail('No reminders created')

    const apptReminders = await prisma.reminder.findMany({ where: { appointmentId: sess!.bookingId } })
    step(`Reminders for this appt: ${JSON.stringify(apptReminders.map(r => ({ type: r.type, status: r.status, scheduledAt: r.scheduledAt })))}`)

    // Verify notification jobs
    const postNotifCount = await prisma.notificationJob.count({ where: { clinicId: CLINIC_ID } })
    const newNotifs = postNotifCount - preNotifCount
    step(`New notification jobs: ${newNotifs}`)
    if (newNotifs > 0) ok(`${newNotifs} notification job(s) created`)
    else warn('No notification jobs created (may be queued async)')
  }

  // Verify no duplicate appointment
  const apptsSameSlot = await prisma.appointment.findMany({
    where: { clinicId: CLINIC_ID, scheduledAt: { equals: (await prisma.availableSlot.findUnique({ where: { id: slotIdToBook }, select: { startTime: true } }))?.startTime }, status: { not: 'cancelled' } }
  })
  step(`Appointments at same slot time: ${apptsSameSlot.length}`)
  if (apptsSameSlot.length === 1) ok('No duplicate appointment')
  else fail(`DUPLICATE APPOINTMENTS: ${apptsSameSlot.length}`)

  // State transitions
  const transitions = await getTransitions(sess!.id)
  log('State transitions:')
  transitions.forEach(t => step(`${t.fromState} → ${t.toState} [${t.triggerType}]`))

  log('─── SCENARIO 1 COMPLETE ───')
  return sess!.bookingId
}

// ─────────────────────────────────────────────────
// SCENARIO 2: MID-FLOW INTERRUPTION
// ─────────────────────────────────────────────────
async function scenario2() {
  log('═══════════════════════════════════════════')
  log('SCENARIO 2: MID-FLOW INTERRUPTION (+966099990001)')
  log('═══════════════════════════════════════════')

  // Session should be in BOOKING_CONFIRMED (terminal) or IDLE after S1 reset
  // resolveSession will reset it to IDLE on next message
  step('Sending: أبغى أحجز')
  let r = await send(PHONE1, 'أبغى أحجز')
  await wait(3000)
  
  let sess = await getSession(PHONE1)
  step(`State: ${sess?.currentState}`)
  if (sess?.currentState !== 'SLOT_COLLECTION_SERVICE') { fail(`Expected SLOT_COLLECTION_SERVICE, got ${sess?.currentState}`); return }
  ok('State = SLOT_COLLECTION_SERVICE')

  // Pick تنظيف
  const services = sess.ambiguousIntents as Array<{id: string; name: string}>
  const tandeefIdx = services.findIndex(s => s.name.includes('تنظيف'))
  await send(PHONE1, String(tandeefIdx + 1))
  await wait(3000)

  sess = await getSession(PHONE1)
  step(`State after service: ${sess?.currentState}`)
  if (sess?.currentState !== 'SLOT_COLLECTION_DATE') { fail(`Expected SLOT_COLLECTION_DATE`); return }
  ok('State = SLOT_COLLECTION_DATE')

  // ──── INTERRUPT: ask price mid-flow ────
  step('INTERRUPTING: Sending بكم؟ at SLOT_COLLECTION_DATE')
  const stateBefore = sess.currentState
  const serviceIdBefore = sess.slotServiceId
  r = await send(PHONE1, 'بكم؟')
  step(`Webhook response: ${r.status}`)
  await wait(3000)

  sess = await getSession(PHONE1)
  step(`State AFTER inquiry interrupt: ${sess?.currentState}`)
  step(`slotServiceId preserved: ${sess?.slotServiceId}`)

  // Check: state not changed, slotServiceId preserved
  if (sess?.currentState === stateBefore) ok(`State preserved: ${stateBefore}`)
  else fail(`State changed unexpectedly: ${stateBefore} → ${sess?.currentState}`)

  if (sess?.slotServiceId === serviceIdBefore) ok('slotServiceId preserved')
  else fail(`slotServiceId changed: ${serviceIdBefore} → ${sess?.slotServiceId}`)

  // Check the bot reply contains price + reprompt
  const msgs = await getMessages(sess!.id)
  const lastAssistantMsg = [...msgs].reverse().find(m => m.role === 'assistant')
  step(`Last bot reply: ${lastAssistantMsg?.content}`)
  if (lastAssistantMsg?.content.includes('ريال') || lastAssistantMsg?.content.includes('سعر')) {
    ok('Bot replied with price info')
  } else {
    warn('Bot reply may not include price — check content')
  }
  if (lastAssistantMsg?.content.includes('متى') || lastAssistantMsg?.content.includes('يناسب')) {
    ok('Bot re-prompted to continue flow (date question)')
  } else {
    warn('Bot did not re-prompt for date — check STATE_REPROMPTS coverage')
  }

  // ──── Resume flow: send date ────
  step('Resuming: Sending بكرا')
  r = await send(PHONE1, 'بكرا')
  await wait(4000)

  sess = await getSession(PHONE1)
  step(`State after resuming with date: ${sess?.currentState}`)
  if (sess?.currentState === 'SLOT_COLLECTION_TIME') ok('Flow resumed correctly at SLOT_COLLECTION_TIME')
  else fail(`Flow did NOT resume: ${sess?.currentState}`)

  // No escalation triggered
  if (!sess?.handoffActive) ok('No escalation triggered')
  else fail('Escalation was incorrectly triggered')

  log('─── SCENARIO 2 COMPLETE ───')
}

// ─────────────────────────────────────────────────
// SCENARIO 3: ABANDON FLOW / TTL
// ─────────────────────────────────────────────────
async function scenario3() {
  log('═══════════════════════════════════════════')
  log('SCENARIO 3: ABANDON FLOW / SLOT HOLD TTL (+966099990002)')
  log('═══════════════════════════════════════════')

  // Clean PHONE2 session state before starting
  const old2 = await getSession(PHONE2)
  if (old2) {
    await prisma.stateTransitionLog.deleteMany({ where: { sessionId: old2.id } })
    await prisma.conversationMessage.deleteMany({ where: { sessionId: old2.id } })
    await prisma.conversationSession.delete({ where: { id: old2.id } })
    step(`Cleaned PHONE2 session ${old2.id}`)
  }

  // Fresh user
  step('Sending booking intent from +966099990002')
  let r = await send(PHONE2, 'أبغى أحجز')
  await wait(3000)

  let sess = await getSession(PHONE2)
  if (!sess) { fail('No session for PHONE2'); return }
  step(`State: ${sess.currentState}`)

  const services = sess.ambiguousIntents as Array<{id: string; name: string}>
  const tandeefIdx = services.findIndex(s => s.name.includes('تنظيف'))
  await send(PHONE2, String(tandeefIdx + 1))
  await wait(3000)

  sess = await getSession(PHONE2)
  step(`After service: ${sess?.currentState}`)

  await send(PHONE2, 'بكرا')
  await wait(4000)

  sess = await getSession(PHONE2)
  step(`After date: ${sess?.currentState}`)
  const slots = sess?.ambiguousIntents as Array<{id: string; startTime: string}> | null
  if (!slots || slots.length === 0) { fail('No slots offered'); return }

  // Select slot
  await send(PHONE2, '1')
  await wait(3000)

  sess = await getSession(PHONE2)
  const heldSlotId = sess?.slotTimeId
  step(`State: ${sess?.currentState}, heldSlotId: ${heldSlotId}`)

  if (!heldSlotId) { fail('No slotTimeId on session'); return }

  // Verify hold
  const heldSlot = await prisma.availableSlot.findUnique({ where: { id: heldSlotId } })
  step(`BEFORE abandon: isHeld=${heldSlot?.isHeld}, heldBySessionId=${heldSlot?.heldBySessionId}`)
  if (heldSlot?.isHeld && heldSlot.heldBySessionId === sess!.id) ok('Slot is held correctly BEFORE abandon')
  else fail('Slot not held before abandon')

  // ──── Now simulate TTL expiry: look for cron endpoint ────
  step('Checking if there is a cron/cleanup endpoint for slot TTL release...')
  
  // Check the expire-sessions cron
  const cronRoute = '/Users/abdulazizfantokh/airclinic-clone/app/api/cron/expire-sessions'
  const { existsSync } = await import('fs')
  const hasCron = existsSync(cronRoute)
  step(`Cron expire-sessions exists: ${hasCron}`)

  // Try to hit the cron endpoint to trigger TTL cleanup
  const cronRes = await fetch('http://localhost:3000/api/cron/expire-sessions', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }
  })
  step(`Cron response: ${cronRes.status}`)
  const cronBody = await cronRes.text()
  step(`Cron body: ${cronBody.substring(0, 200)}`)

  // NOTE: slot holds have NO automatic TTL release in a cron visible to us yet.
  // Check if slot hold is released after cron
  await wait(2000)
  const postCronSlot = await prisma.availableSlot.findUnique({ where: { id: heldSlotId } })
  step(`AFTER cron: isHeld=${postCronSlot?.isHeld}`)
  
  // Check the session expiry state
  const postCronSess = await getSession(PHONE2)
  step(`Session state after cron: ${postCronSess?.currentState}, expiresAt: ${postCronSess?.expiresAt}`)

  if (!postCronSlot?.isHeld) ok('Slot hold released after TTL cron')
  else warn('Slot hold NOT released — TTL cleanup may not release slot holds, only expire sessions')

  log('─── SCENARIO 3 COMPLETE ───')
  return heldSlotId
}

// ─────────────────────────────────────────────────
// SCENARIO 4: CANCELLATION FLOW
// ─────────────────────────────────────────────────
async function scenario4(bookingIdFromS1?: string) {
  log('═══════════════════════════════════════════')
  log('SCENARIO 4: CANCELLATION FLOW (+966099990001)')
  log('═══════════════════════════════════════════')

  if (!bookingIdFromS1) {
    warn('No bookingId from Scenario 1 — checking for existing appointment for PHONE1 patient')
    const patient = await prisma.patient.findFirst({
      where: { clinicId: CLINIC_ID, phone: PHONE1 }
    })
    if (!patient) { fail('No patient found for PHONE1'); return }
    const appt = await prisma.appointment.findFirst({
      where: { clinicId: CLINIC_ID, patientId: patient.id, status: { in: ['scheduled', 'confirmed'] } },
      orderBy: { scheduledAt: 'asc' }
    })
    if (!appt) { fail('No active appointment to cancel'); return }
    bookingIdFromS1 = appt.id
  }

  const preAppt = await prisma.appointment.findUnique({
    where: { id: bookingIdFromS1 },
    include: { reminders: true }
  })
  step(`Pre-cancel: appt status=${preAppt?.status}, reminders=${preAppt?.reminders.length}`)

  const preJobs = await prisma.notificationJob.findMany({
    where: { appointmentId: bookingIdFromS1, status: { in: ['pending', 'queued'] } }
  })
  step(`Pre-cancel pending notification jobs: ${preJobs.length}`)

  // Send cancellation intent
  step('Sending: أبغى ألغي الحجز')
  await send(PHONE1, 'أبغى ألغي الحجز')
  await wait(3000)

  let sess = await getSession(PHONE1)
  step(`State after cancel intent: ${sess?.currentState}`)
  if (sess?.currentState !== 'CANCELLATION_PENDING') { fail(`Expected CANCELLATION_PENDING, got ${sess?.currentState}`); return }
  ok('State = CANCELLATION_PENDING')

  // Confirm cancellation
  step('Sending: نعم (confirm cancel)')
  await send(PHONE1, 'نعم')
  await wait(3000)

  sess = await getSession(PHONE1)
  step(`State after confirm: ${sess?.currentState}`)

  // Verify appointment cancelled
  const postAppt = await prisma.appointment.findUnique({ where: { id: bookingIdFromS1 } })
  step(`Post-cancel appt status: ${postAppt?.status}`)
  if (postAppt?.status === 'cancelled') ok('Appointment status = cancelled')
  else fail(`Appointment NOT cancelled: status=${postAppt?.status}`)

  // Verify slot freed - find the slot for this appointment
  const apptService = preAppt?.serviceId
  step(`Checking if related slot was freed...`)
  // Note: the cancellation flow in handleCancellationConfirm does NOT free the slot
  // It only updates appointment.status. Let's check.
  const slotForAppt = await prisma.availableSlot.findFirst({
    where: {
      clinicId: CLINIC_ID,
      serviceId: apptService ?? undefined,
      isBooked: true,
      startTime: preAppt?.scheduledAt ?? undefined,
    }
  })
  step(`Slot still booked after cancel: ${slotForAppt ? JSON.stringify({id: slotForAppt.id, isBooked: slotForAppt.isBooked}) : 'not found or freed'}`)
  if (!slotForAppt) warn('Slot not found in booked state — may not have been freed or was a different mechanism')
  else fail(`Slot is STILL BOOKED after appointment cancellation — slot not freed`)

  // Verify notification jobs cancelled
  const postJobs = await prisma.notificationJob.findMany({
    where: { appointmentId: bookingIdFromS1 }
  })
  step(`Notification jobs post-cancel: ${JSON.stringify(postJobs.map(j => ({ status: j.status })))}`)
  const cancelledJobs = postJobs.filter(j => j.status === 'failed')
  if (cancelledJobs.length > 0) ok(`${cancelledJobs.length} notification job(s) invalidated`)
  else if (postJobs.length === 0) ok('No notification jobs to cancel')
  else warn('Notification jobs may not have been invalidated')

  // Idempotency: cancel again
  step('Testing idempotency: sending cancel again')
  await send(PHONE1, 'أبغى ألغي الحجز')
  await wait(3000)
  sess = await getSession(PHONE1)
  step(`State after second cancel attempt: ${sess?.currentState}`)
  await send(PHONE1, 'نعم')
  await wait(3000)
  sess = await getSession(PHONE1)
  step(`Final state: ${sess?.currentState}`)
  const postAppt2 = await prisma.appointment.findUnique({ where: { id: bookingIdFromS1 } })
  if (postAppt2?.status === 'cancelled') ok('Idempotent: still cancelled, not double-cancelled')
  else fail(`Status changed on second cancel: ${postAppt2?.status}`)

  log('─── SCENARIO 4 COMPLETE ───')
}

// ─────────────────────────────────────────────────
// SCENARIO 5: CONCURRENT USERS
// ─────────────────────────────────────────────────
async function scenario5() {
  log('═══════════════════════════════════════════')
  log('SCENARIO 5: CONCURRENT USERS — SAME SLOT')
  log('═══════════════════════════════════════════')

  // Both users need to be at SLOT_COLLECTION_TIME and offered the SAME slot
  // Get both to SLOT_COLLECTION_TIME first, then simultaneously try to book same slot

  // Find a free slot that both will see
  const freeSlots = await prisma.availableSlot.findMany({
    where: { clinicId: CLINIC_ID, serviceId: 'cmnkrgtrv000gdq9k1whjk7em', isBooked: false, isHeld: false, startTime: { gte: new Date() } },
    orderBy: { startTime: 'asc' },
    take: 1,
  })
  if (freeSlots.length === 0) { fail('No free slots available for concurrent test'); return }
  const targetSlot = freeSlots[0]
  step(`Target slot: ${targetSlot.id} at ${targetSlot.startTime}`)

  // Get both sessions to SLOT_COLLECTION_TIME
  // PHONE1: fresh session needed (should be in IDLE or terminal from S4)
  // PHONE2: should be in SLOT_COLLECTION_PATIENT_NAME from S3

  // Reset both through fresh booking flow up to SLOT_COLLECTION_TIME
  // For PHONE1
  step('Bringing PHONE1 to SLOT_COLLECTION_TIME...')
  await send(PHONE1, 'أبغى أحجز')
  await wait(3000)
  let s1 = await getSession(PHONE1)
  const svcs1 = s1?.ambiguousIntents as Array<{id: string; name: string}>
  const t1 = svcs1?.findIndex(s => s.name.includes('تنظيف'))
  await send(PHONE1, String(t1 + 1))
  await wait(3000)
  await send(PHONE1, 'بكرا')
  await wait(4000)
  s1 = await getSession(PHONE1)
  step(`PHONE1 state: ${s1?.currentState}`)

  // For PHONE2 (it might still be in SLOT_COLLECTION_PATIENT_NAME from S3)
  step('Bringing PHONE2 to SLOT_COLLECTION_TIME...')
  let s2 = await getSession(PHONE2)
  if (s2?.currentState !== 'SLOT_COLLECTION_TIME') {
    // Need to bring PHONE2 through the flow
    // If it's in SLOT_COLLECTION_PATIENT_NAME from S3, skip ahead
    // If in terminal, resolveSession resets
    await send(PHONE2, 'أبغى أحجز')
    await wait(3000)
    s2 = await getSession(PHONE2)
    const svcs2 = s2?.ambiguousIntents as Array<{id: string; name: string}>
    const t2 = svcs2?.findIndex(s => s.name.includes('تنظيف'))
    await send(PHONE2, String(t2 + 1))
    await wait(3000)
    await send(PHONE2, 'بكرا')
    await wait(4000)
    s2 = await getSession(PHONE2)
  }
  step(`PHONE2 state: ${s2?.currentState}`)

  // Now: check what slots are offered to each
  const slots1 = s1?.ambiguousIntents as Array<{id: string; startTime: string}>
  const slots2 = s2?.ambiguousIntents as Array<{id: string; startTime: string}>

  step(`PHONE1 offered slots: ${JSON.stringify(slots1?.map(s => s.id))}`)
  step(`PHONE2 offered slots: ${JSON.stringify(slots2?.map(s => s.id))}`)

  // Find a slot ID that appears in both lists
  const sharedSlotId = slots1?.find(s1slot => slots2?.some(s2slot => s2slot.id === s1slot.id))?.id
  if (!sharedSlotId) {
    warn('No shared slot offered to both users — concurrent conflict less likely but will test with any slot')
  } else {
    step(`Shared slot: ${sharedSlotId}`)
  }

  const pos1 = slots1?.findIndex(s => s.id === (sharedSlotId ?? slots1?.[0]?.id)) ?? 0
  const pos2 = slots2?.findIndex(s => s.id === (sharedSlotId ?? slots2?.[0]?.id)) ?? 0

  step(`PHONE1 will select slot position ${pos1 + 1}, PHONE2 will select position ${pos2 + 1}`)

  // Pre-booking slot state
  const conflictSlotId = sharedSlotId ?? slots1?.[0]?.id
  const preSlot = await prisma.availableSlot.findUnique({ where: { id: conflictSlotId! } })
  step(`Slot ${conflictSlotId}: isHeld=${preSlot?.isHeld}, isBooked=${preSlot?.isBooked}`)

  // FIRE BOTH SIMULTANEOUSLY
  step('Firing both slot selections simultaneously...')
  const [r1, r2] = await Promise.all([
    send(PHONE1, String(pos1 + 1)),
    send(PHONE2, String(pos2 + 1)),
  ])
  step(`PHONE1 response: ${r1.status}, PHONE2 response: ${r2.status}`)
  await wait(4000)

  s1 = await getSession(PHONE1)
  s2 = await getSession(PHONE2)
  step(`PHONE1 state: ${s1?.currentState}, slotTimeId: ${s1?.slotTimeId}`)
  step(`PHONE2 state: ${s2?.currentState}, slotTimeId: ${s2?.slotTimeId}`)

  const finalSlot = await prisma.availableSlot.findUnique({ where: { id: conflictSlotId! } })
  step(`Slot after concurrent attempt: isHeld=${finalSlot?.isHeld}, isBooked=${finalSlot?.isBooked}, heldBySessionId=${finalSlot?.heldBySessionId}`)

  // Check: only one winner
  const winner = s1?.slotTimeId === conflictSlotId ? 'PHONE1' : s2?.slotTimeId === conflictSlotId ? 'PHONE2' : 'NONE'
  const winnerState = winner === 'PHONE1' ? s1?.currentState : s2?.currentState
  step(`Winner: ${winner}, state: ${winnerState}`)

  if (finalSlot?.isHeld && finalSlot.heldBySessionId) {
    ok(`Only one session holds the slot: ${finalSlot.heldBySessionId}`)
  } else if (finalSlot?.isBooked) {
    ok('Slot is booked (already moved past hold to booking)')
  } else {
    warn('Slot is neither held nor booked after concurrent attempt')
  }

  // Check for double-booking
  const bookingsForSlotTime = await prisma.appointment.findMany({
    where: { clinicId: CLINIC_ID, scheduledAt: preSlot?.startTime, status: { not: 'cancelled' } }
  })
  step(`Appointments at this slot time: ${bookingsForSlotTime.length}`)
  if (bookingsForSlotTime.length <= 1) ok('No double-booking in DB')
  else fail(`DOUBLE BOOKING: ${bookingsForSlotTime.length} appointments for same slot time`)

  log('─── SCENARIO 5 COMPLETE ───')
}

// ─────────────────────────────────────────────────
// SCENARIO 6: ESCALATION FLOW
// ─────────────────────────────────────────────────
async function scenario6() {
  log('═══════════════════════════════════════════')
  log('SCENARIO 6: ESCALATION FLOW (+966099990002)')
  log('═══════════════════════════════════════════')

  // Fresh state for PHONE2
  step('Sending escalation request: أريد التحدث مع موظف')
  await send(PHONE2, 'أريد التحدث مع موظف')
  await wait(3000)

  let sess = await getSession(PHONE2)
  step(`State: ${sess?.currentState}, handoffActive: ${sess?.handoffActive}`)

  if (sess?.currentState === 'HUMAN_ESCALATION_PENDING') ok('State = HUMAN_ESCALATION_PENDING')
  else fail(`Expected HUMAN_ESCALATION_PENDING, got ${sess?.currentState}`)

  if (sess?.handoffActive) ok('handoffActive = true — bot is suppressed')
  else fail('handoffActive NOT set — bot will still reply')

  // Verify escalation log created
  const escLog = await prisma.escalationLog.findFirst({
    where: { clinicId: CLINIC_ID },
    orderBy: { createdAt: 'desc' }
  })
  step(`Recent escalation log: ${JSON.stringify(escLog)}`)
  // Note: EscalationLog is used by the cancel route. Escalation via FSM doesn't write EscalationLog.
  // Check saveLead instead
  const lead = await prisma.lead.findFirst({
    where: { clinicId: CLINIC_ID, patientPhone: PHONE2 },
    orderBy: { createdAt: 'desc' }
  })
  step(`Lead saved: ${JSON.stringify(lead)}`)
  if (lead) ok('Lead saved on escalation')
  else warn('No lead saved for this session')

  // Verify bot stops during handoff
  step('Sending message during handoff — bot should be silent')
  const r = await send(PHONE2, 'مرحبا هل أنتم هناك؟')
  step(`Response during handoff: ${r.status}`)
  await wait(3000)

  // The route returns 200 ok with no reply when handoffActive
  // Check that no new outbound message was sent
  const msgs = await getMessages(sess!.id)
  const msgsAfterEscalation = msgs.filter(m => 
    m.role === 'assistant' && m.sessionStateAtSend === 'HUMAN_ESCALATION_PENDING'
  )
  step(`Assistant msgs in ESCALATION_PENDING state: ${msgsAfterEscalation.length}`)
  // First escalation message should be the "بيتواصلون معك" response
  // Second message (during handoff) should produce no outbound (handoffActive=true)

  step('Verifying session state hasnt changed after message during handoff...')
  sess = await getSession(PHONE2)
  if (sess?.currentState === 'HUMAN_ESCALATION_PENDING') ok('State unchanged — bot correctly silent')
  else fail(`State changed during handoff: ${sess?.currentState}`)

  // Simulate staff resume (user sends new_booking intent which triggers handoff recovery)
  step('Simulating staff resolution — user sends booking intent to resume')
  await send(PHONE2, 'أبغى أحجز موعد')
  await wait(3000)

  sess = await getSession(PHONE2)
  step(`State after booking intent post-escalation: ${sess?.currentState}`)
  step(`handoffActive: ${sess?.handoffActive}`)

  if (!sess?.handoffActive && sess?.currentState === 'SLOT_COLLECTION_SERVICE') {
    ok('Bot resumed after booking intent — handoff cleared')
  } else if (sess?.currentState === 'HUMAN_ESCALATION_PENDING' || sess?.currentState === 'HUMAN_ESCALATION_ACTIVE') {
    warn('Bot still in escalation state — check handoff recovery logic')
  } else {
    step(`Unexpected state: ${sess?.currentState}`)
  }

  // State transitions audit
  const transitions = await getTransitions(sess!.id)
  log('State transitions:')
  transitions.forEach(t => step(`${t.fromState} → ${t.toState} [${t.triggerType}]`))

  log('─── SCENARIO 6 COMPLETE ───')
}

// ─────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────
async function main() {
  log('QA RUNNER START — ' + new Date().toISOString())
  log(`DB: ${new URL(process.env.DATABASE_URL!).hostname}`)
  log(`PHONES: ${PHONE1}, ${PHONE2}`)

  let bookingId: string | undefined
  try { bookingId = await scenario1() } catch(e) { console.error('S1 CRASH:', e) }
  try { await scenario2() } catch(e) { console.error('S2 CRASH:', e) }
  try { await scenario3() } catch(e) { console.error('S3 CRASH:', e) }
  try { await scenario4(bookingId) } catch(e) { console.error('S4 CRASH:', e) }
  try { await scenario5() } catch(e) { console.error('S5 CRASH:', e) }
  try { await scenario6() } catch(e) { console.error('S6 CRASH:', e) }

  log('\nQA RUNNER COMPLETE')
  await prisma.$disconnect()
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
