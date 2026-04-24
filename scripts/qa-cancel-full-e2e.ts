/**
 * Full booking → WhatsApp cancel E2E test.
 * Phase 1: Complete a real booking for PHONE1.
 * Phase 2: Re-enter the flow mid-booking then confirm cancel.
 * Phase 3: Strict DB verification of all side effects.
 */
import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '../lib/prisma-client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const CLINIC_ID = 'cmnkmp2h40000dq9kj4vgb2tu'
const TWILIO_TO  = 'whatsapp:+14155238886'
const PHONE      = '+966099990001'

let mc = 700
function sid() { return `SMfull${Date.now()}${mc++}` }

async function send(body: string) {
  const payload = new URLSearchParams({ From: `whatsapp:${PHONE}`, To: TWILIO_TO, Body: body, MessageSid: sid() }).toString()
  const res = await fetch('http://localhost:3000/api/whatsapp/webhook-v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload,
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function sess() {
  return prisma.conversationSession.findUnique({
    where: { phoneNumber_clinicId: { phoneNumber: PHONE, clinicId: CLINIC_ID } },
  })
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

let failures = 0
function pass(m: string) { console.log(`  ✅ ${m}`) }
function fail(m: string) { console.log(`  ❌ FAIL: ${m}`); failures++; }
function step(m: string) { console.log(`  ⟶  ${m}`) }
function hdr(m: string)  { console.log(`\n${'═'.repeat(50)}\n${m}\n${'═'.repeat(50)}`) }

async function main() {
  hdr(`FULL BOOKING → CANCEL E2E  |  ${new Date().toISOString()}`)

  // ──────────────────────────────────────────────────────────────────────────
  // CLEANUP: wipe session (keep patient — code must handle existing patient)
  // ──────────────────────────────────────────────────────────────────────────
  hdr('CLEANUP')
  const old = await sess()
  if (old) {
    await prisma.stateTransitionLog.deleteMany({ where: { sessionId: old.id } })
    await prisma.conversationMessage.deleteMany({ where: { sessionId: old.id } })
    await prisma.conversationSession.delete({ where: { id: old.id } })
    step(`Deleted session ${old.id}`)
  }

  // Cancel any stale active appointments so scenario4 picks the fresh one only
  const patient0 = await prisma.patient.findFirst({ where: { clinicId: CLINIC_ID, phone: PHONE } })
  if (patient0) {
    const stale = await prisma.appointment.updateMany({
      where: { clinicId: CLINIC_ID, patientId: patient0.id, status: { in: ['scheduled', 'confirmed', 'confirmation_pending'] } },
      data: { status: 'cancelled', cancellationReason: 'qa-cleanup' },
    })
    step(`Stale active appointments cancelled: ${stale.count}`)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 1: COMPLETE A FULL BOOKING
  // ──────────────────────────────────────────────────────────────────────────
  hdr('PHASE 1 — COMPLETE BOOKING')

  // 1. Booking intent
  step('أبغى أحجز تنظيف')
  await send('أبغى أحجز تنظيف')
  await wait(3000)
  let s = await sess()
  step(`State: ${s?.currentState}`)
  if (s?.currentState !== 'SLOT_COLLECTION_SERVICE') { fail(`Expected SLOT_COLLECTION_SERVICE, got ${s?.currentState}`); process.exit(1) }
  pass('SLOT_COLLECTION_SERVICE')

  // 2. Select service
  const services = s.ambiguousIntents as Array<{id: string; name: string}>
  const idx = services.findIndex(svc => svc.name.includes('تنظيف'))
  if (idx === -1) { fail('تنظيف not in service list'); process.exit(1) }
  step(`Selecting service ${idx + 1} (${services[idx]!.name})`)
  await send(String(idx + 1))
  await wait(3000)
  s = await sess()
  step(`State: ${s?.currentState}`)
  if (s?.currentState !== 'SLOT_COLLECTION_DATE') { fail(`Expected SLOT_COLLECTION_DATE`); process.exit(1) }
  pass('SLOT_COLLECTION_DATE')

  // 3. Date
  step('بكرا')
  await send('بكرا')
  await wait(4000)
  s = await sess()
  step(`State: ${s?.currentState}`)
  if (s?.currentState !== 'SLOT_COLLECTION_TIME') { fail(`Expected SLOT_COLLECTION_TIME`); process.exit(1) }
  pass('SLOT_COLLECTION_TIME')

  // 4. Select slot 1
  step('1 (slot)')
  await send('1')
  await wait(3000)
  s = await sess()
  step(`State: ${s?.currentState}  slotTimeId: ${s?.slotTimeId}`)
  if (s?.currentState !== 'SLOT_COLLECTION_PATIENT_NAME') { fail(`Expected SLOT_COLLECTION_PATIENT_NAME`); process.exit(1) }
  pass('SLOT_COLLECTION_PATIENT_NAME')

  const slotTimeId = s.slotTimeId!

  // 5. Name
  step('احمد اختبار QA')
  await send('احمد اختبار QA')
  await wait(3000)
  s = await sess()
  if (s?.currentState !== 'SLOT_COLLECTION_PATIENT_DOB') { fail(`Expected SLOT_COLLECTION_PATIENT_DOB`); process.exit(1) }
  pass('SLOT_COLLECTION_PATIENT_DOB')

  // 6. DOB
  step('1990-05-15')
  await send('1990-05-15')
  await wait(3000)
  s = await sess()
  if (s?.currentState !== 'SLOT_COLLECTION_PHONE_CONFIRM') { fail(`Expected SLOT_COLLECTION_PHONE_CONFIRM`); process.exit(1) }
  pass('SLOT_COLLECTION_PHONE_CONFIRM')

  // 7. Confirm phone
  step('نعم (phone)')
  await send('نعم')
  await wait(3000)
  s = await sess()
  if (s?.currentState !== 'CONFIRMATION_PENDING') { fail(`Expected CONFIRMATION_PENDING`); process.exit(1) }
  pass('CONFIRMATION_PENDING')

  // 8. Confirm booking
  step('نعم (confirm booking)')
  await send('نعم')
  await wait(7000)  // 2s server sleep + booking + reminder creation
  s = await sess()
  step(`State after booking: ${s?.currentState}  bookingId: ${s?.bookingId}`)
  if (!s?.bookingId) { fail('No bookingId — booking failed'); process.exit(1) }
  pass(`Booking created: ${s.bookingId}`)

  const bookingId = s.bookingId

  // Verify booking state
  const bookedAppt = await prisma.appointment.findUnique({ where: { id: bookingId }, include: { reminders: true, notificationJobs: true } })
  const bookedSlot  = await prisma.availableSlot.findUnique({ where: { id: slotTimeId } })
  step(`Appointment: status=${bookedAppt?.status}`)
  step(`Slot: isBooked=${bookedSlot?.isBooked} isHeld=${bookedSlot?.isHeld}`)
  step(`Reminders: ${bookedAppt?.reminders.length} (${bookedAppt?.reminders.map(r=>r.status).join(',')})`)
  step(`NotifJobs: ${bookedAppt?.notificationJobs.length} (${bookedAppt?.notificationJobs.map(j=>j.status).join(',')})`)

  if (bookedAppt?.status !== 'scheduled') { fail(`Appointment status ${bookedAppt?.status} — expected scheduled`); process.exit(1) }
  if (!bookedSlot?.isBooked) { fail('Slot not booked after confirmation'); process.exit(1) }
  pass('Phase 1 complete — booking confirmed, slot booked')

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 2: CANCEL FLOW (enter mid-booking then cancel existing appt)
  // ──────────────────────────────────────────────────────────────────────────
  hdr('PHASE 2 — CANCEL FLOW')

  // Session should be IDLE now (SESSION_RESET_AFTER_BOOKING)
  s = await sess()
  step(`Session state entering Phase 2: ${s?.currentState}`)

  // Start a new booking so we're mid-flow before hitting cancel
  step('أبغى أحجز')
  await send('أبغى أحجز')
  await wait(3000)
  s = await sess()
  step(`State: ${s?.currentState}`)

  // Select service to get to SLOT_COLLECTION_DATE
  const svcs2 = s?.ambiguousIntents as Array<{id: string; name: string}> | null
  if (svcs2 && svcs2.length > 0) {
    await send('1')
    await wait(3000)
    s = await sess()
    step(`State after service: ${s?.currentState}`)
  }

  // Now send cancel intent from mid-booking state
  step('أبغى ألغي الحجز')
  await send('أبغى ألغي الحجز')
  await wait(3500)
  s = await sess()
  step(`State after cancel intent: ${s?.currentState}`)
  if (s?.currentState !== 'CANCELLATION_PENDING') {
    fail(`Expected CANCELLATION_PENDING, got ${s?.currentState}`)
  } else {
    pass('State = CANCELLATION_PENDING ✔')
  }

  // Confirm cancel
  step('نعم (confirm cancel)')
  await send('نعم')
  await wait(4000)
  s = await sess()
  step(`State after cancel confirm: ${s?.currentState}`)

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 3: STRICT DB VERIFICATION
  // ──────────────────────────────────────────────────────────────────────────
  hdr('PHASE 3 — DB VERIFICATION')

  const finalAppt = await prisma.appointment.findUnique({
    where: { id: bookingId },
    include: { reminders: true, notificationJobs: true },
  })
  const finalSlot = await prisma.availableSlot.findUnique({ where: { id: slotTimeId } })

  step(`appointment.status      = ${finalAppt?.status}`)
  step(`slot.isBooked           = ${finalSlot?.isBooked}`)
  step(`slot.isHeld             = ${finalSlot?.isHeld}`)
  step(`slot.heldBySessionId    = ${finalSlot?.heldBySessionId}`)
  step(`slot.heldAt             = ${finalSlot?.heldAt}`)
  step(`reminders               = ${JSON.stringify(finalAppt?.reminders.map(r => ({ status: r.status })))}`)
  step(`notificationJobs        = ${JSON.stringify(finalAppt?.notificationJobs.map(j => ({ status: j.status })))}`)

  // STRICT ASSERTIONS
  if (finalAppt?.status === 'cancelled') pass('appointment.status = cancelled')
  else fail(`appointment.status = ${finalAppt?.status}  (expected: cancelled)`)

  if (finalSlot?.isBooked === false) pass('slot.isBooked = false')
  else fail(`slot.isBooked = ${finalSlot?.isBooked}  (expected: false)`)

  if (finalSlot?.isHeld === false) pass('slot.isHeld = false')
  else fail(`slot.isHeld = ${finalSlot?.isHeld}  (expected: false)`)

  if (finalSlot?.heldBySessionId === null) pass('slot.heldBySessionId = null')
  else fail(`slot.heldBySessionId = ${finalSlot?.heldBySessionId}  (expected: null)`)

  if (finalSlot?.heldAt === null) pass('slot.heldAt = null')
  else fail(`slot.heldAt = ${finalSlot?.heldAt}  (expected: null)`)

  const pendingReminders = finalAppt?.reminders.filter(r => r.status === 'pending') ?? []
  if (pendingReminders.length === 0) pass('No reminders in pending state')
  else fail(`${pendingReminders.length} reminder(s) still pending`)

  const activeJobs = finalAppt?.notificationJobs.filter(j => ['pending', 'queued'].includes(j.status)) ?? []
  if (activeJobs.length === 0) pass('No notification jobs in pending/queued')
  else fail(`${activeJobs.length} notification job(s) still pending/queued`)

  // ──────────────────────────────────────────────────────────────────────────
  // FSM VERIFICATION
  // ──────────────────────────────────────────────────────────────────────────
  hdr('FSM STATE + TRANSITIONS')

  const finalSess = await sess()
  step(`Final session state: ${finalSess?.currentState}`)
  if (finalSess?.currentState === 'IDLE') pass('Session reset to IDLE after cancellation')
  else step(`State: ${finalSess?.currentState}`)

  const transitions = await prisma.stateTransitionLog.findMany({
    where: { sessionId: finalSess?.id ?? '' },
    orderBy: { createdAt: 'asc' },
    select: { fromState: true, toState: true, triggerType: true },
  })
  console.log('\nState transitions:')
  transitions.forEach(t => step(`  ${t.fromState} → ${t.toState}  [${t.triggerType}]`))

  const invalidReset = transitions.find(t => t.triggerType === 'INVALID_SESSION_RESET_AFTER_CANCELLATION')
  if (invalidReset) fail('INVALID_SESSION_RESET_AFTER_CANCELLATION transition found')
  else pass('No INVALID_SESSION_RESET_AFTER_CANCELLATION in log')

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  hdr(`RESULT: ${failures === 0 ? '✅ PASS' : `❌ FAIL (${failures} failure(s))`}`)

  await prisma.$disconnect()
  if (failures > 0) process.exit(1)
}

main().catch(async e => {
  console.error('CRASH:', e)
  await prisma.$disconnect()
  process.exit(1)
})
