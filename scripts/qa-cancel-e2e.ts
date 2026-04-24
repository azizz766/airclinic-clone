import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '../lib/prisma-client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const CLINIC_ID = 'cmnkmp2h40000dq9kj4vgb2tu'
const TWILIO_TO = 'whatsapp:+14155238886'
const PHONE = '+966099990001'

let mc = 500
function sid() { return `SMqacancel${Date.now()}${mc++}` }

async function send(body: string) {
  const payload = new URLSearchParams({ From: `whatsapp:${PHONE}`, To: TWILIO_TO, Body: body, MessageSid: sid() }).toString()
  const res = await fetch('http://localhost:3000/api/whatsapp/webhook-v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload,
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function getSession() {
  return prisma.conversationSession.findUnique({
    where: { phoneNumber_clinicId: { phoneNumber: PHONE, clinicId: CLINIC_ID } },
  })
}

async function wait(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function pass(msg: string) { console.log(`  ✅ PASS: ${msg}`) }
function fail(msg: string) { console.log(`  ❌ FAIL: ${msg}`); process.exitCode = 1 }
function step(msg: string) { console.log(`  ⟶  ${msg}`) }

async function main() {
  console.log('\n═══════════════════════════════════════════')
  console.log('CANCELLATION E2E — FRESH RUN')
  console.log(`Time: ${new Date().toISOString()}`)
  console.log('═══════════════════════════════════════════\n')

  // ── RESET: wipe session and any existing test appointment ─────────────────
  step('Resetting session and test data for PHONE1...')
  const existing = await prisma.conversationSession.findUnique({
    where: { phoneNumber_clinicId: { phoneNumber: PHONE, clinicId: CLINIC_ID } },
  })
  if (existing) {
    await prisma.stateTransitionLog.deleteMany({ where: { sessionId: existing.id } })
    await prisma.conversationMessage.deleteMany({ where: { sessionId: existing.id } })
    await prisma.conversationSession.delete({ where: { id: existing.id } })
    step(`Deleted existing session: ${existing.id}`)
  }

  // ── STEP 1: Start booking ─────────────────────────────────────────────────
  console.log('\n--- Step 1: أبغى أحجز ---')
  const r1 = await send('أبغى أحجز')
  step(`HTTP ${r1.status}`)
  await wait(2500)
  const s1 = await getSession()
  step(`State: ${s1?.currentState}`)
  if (!['SLOT_COLLECTION_SERVICE', 'LANGUAGE_DETECTION', 'INTENT_DISAMBIGUATION'].includes(s1?.currentState ?? '')) {
    fail(`Unexpected state after booking intent: ${s1?.currentState}`)
  } else {
    pass(`Booking intent processed → ${s1?.currentState}`)
  }

  // ── STEP 2: Select service "1" ────────────────────────────────────────────
  console.log('\n--- Step 2: 1 (select service) ---')
  await send('1')
  await wait(2500)
  const s2 = await getSession()
  step(`State: ${s2?.currentState}`)
  if (s2?.currentState === 'SLOT_COLLECTION_DATE') pass('Service selected → SLOT_COLLECTION_DATE')
  else step(`Note: state is ${s2?.currentState} (service list may have gone to date already)`)

  // ── STEP 3: بكرا (date) ────────────────────────────────────────────────────
  console.log('\n--- Step 3: بكرا (tomorrow) ---')
  await send('بكرا')
  await wait(2500)
  const s3 = await getSession()
  step(`State: ${s3?.currentState}`)
  const midBookingStates = ['SLOT_COLLECTION_DATE', 'SLOT_COLLECTION_TIME', 'SLOT_COLLECTION_PATIENT_NAME']
  if (midBookingStates.includes(s3?.currentState ?? '')) {
    pass(`Mid-booking state reached: ${s3?.currentState}`)
  } else {
    step(`State after date: ${s3?.currentState}`)
  }

  // ── STEP 4: Cancel intent ────────────────────────────────────────────────
  console.log('\n--- Step 4: أبغى ألغي الحجز ---')
  await send('أبغى ألغي الحجز')
  await wait(3000)
  const s4 = await getSession()
  step(`State: ${s4?.currentState}`)
  if (s4?.currentState === 'CANCELLATION_PENDING') pass('State = CANCELLATION_PENDING')
  else fail(`Expected CANCELLATION_PENDING, got ${s4?.currentState}`)

  // ── STEP 5: Confirm cancellation ─────────────────────────────────────────
  console.log('\n--- Step 5: نعم (confirm cancel) ---')
  await send('نعم')
  await wait(4000)
  const s5 = await getSession()
  step(`State after confirm: ${s5?.currentState}`)

  // ── DB VERIFICATION ────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════')
  console.log('DB VERIFICATION')
  console.log('═══════════════════════════════════')

  // Find patient + appointment
  const patient = await prisma.patient.findFirst({ where: { clinicId: CLINIC_ID, phone: PHONE } })
  step(`Patient: ${patient?.id ?? 'NOT FOUND'}`)

  if (!patient) {
    step('No patient found — no appointment was created. Checking if session had a mid-booking slot held...')
    // Still check that any held slot was freed
    const heldSlot = await prisma.availableSlot.findFirst({
      where: { clinicId: CLINIC_ID, heldBySessionId: s5?.id ?? '' }
    })
    if (heldSlot) {
      if (!heldSlot.isHeld && !heldSlot.isBooked) pass('Held slot was freed on cancel')
      else fail(`Slot still held: isBooked=${heldSlot.isBooked}, isHeld=${heldSlot.isHeld}`)
    } else {
      step('No held slot found for session — cancellation was before slot selection, nothing to free')
    }
  } else {
    const appt = await prisma.appointment.findFirst({
      where: { clinicId: CLINIC_ID, patientId: patient.id },
      orderBy: { createdAt: 'desc' },
      include: { reminders: true, notificationJobs: true },
    })

    if (!appt) {
      step('No appointment created — cancellation happened before booking completed')
      // Still check slot
      const heldSlot = await prisma.availableSlot.findFirst({
        where: { clinicId: CLINIC_ID, heldBySessionId: s5?.id ?? '' }
      })
      if (heldSlot) {
        if (!heldSlot.isHeld && !heldSlot.isBooked) pass('Held slot freed on cancel')
        else fail(`Slot still held: isBooked=${heldSlot.isBooked}, isHeld=${heldSlot.isHeld}`)
      }
    } else {
      step(`Appointment: ${appt.id}, status=${appt.status}, scheduledAt=${appt.scheduledAt}`)

      // 1. Appointment status
      if (appt.status === 'cancelled') pass('appointment.status = cancelled')
      else fail(`appointment.status = ${appt.status} (expected cancelled)`)

      // 2. Slot freed
      const slot = await prisma.availableSlot.findFirst({
        where: { clinicId: CLINIC_ID, serviceId: appt.serviceId, startTime: appt.scheduledAt },
      })
      if (slot) {
        step(`Slot: id=${slot.id} isBooked=${slot.isBooked} isHeld=${slot.isHeld} heldBy=${slot.heldBySessionId}`)
        if (!slot.isBooked) pass('slot.isBooked = false')
        else fail('slot.isBooked = true (NOT FREED)')
        if (!slot.isHeld) pass('slot.isHeld = false')
        else fail('slot.isHeld = true (NOT FREED)')
        if (!slot.heldBySessionId) pass('slot.heldBySessionId = null')
        else fail(`slot.heldBySessionId = ${slot.heldBySessionId} (not cleared)`)
      } else {
        step('No AvailableSlot found for this appointment — may have been deleted or serviceId/time mismatch')
      }

      // 3. Reminders
      if (appt.reminders.length === 0) {
        pass('No reminders to check')
      } else {
        const pendingReminders = appt.reminders.filter(r => r.status === 'pending')
        step(`Reminders: ${appt.reminders.map(r => r.status).join(', ')}`)
        if (pendingReminders.length === 0) pass('No reminders in pending state')
        else fail(`${pendingReminders.length} reminder(s) still pending`)
      }

      // 4. Notification jobs
      if (appt.notificationJobs.length === 0) {
        pass('No notification jobs to check')
      } else {
        const activeJobs = appt.notificationJobs.filter(j => ['pending', 'queued'].includes(j.status))
        step(`Notification jobs: ${appt.notificationJobs.map(j => j.status).join(', ')}`)
        if (activeJobs.length === 0) pass('No notification jobs in pending/queued state')
        else fail(`${activeJobs.length} notification job(s) still pending/queued`)
      }
    }
  }

  // ── FSM STATE VERIFICATION ────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════')
  console.log('FSM STATE + TRANSITIONS')
  console.log('═══════════════════════════════════')
  const finalSess = await getSession()
  step(`Final session state: ${finalSess?.currentState}`)
  if (finalSess?.currentState === 'IDLE') pass('Session reset to IDLE after cancellation')
  else step(`State is ${finalSess?.currentState} — acceptable if CANCELLATION_CONFIRMED (terminal) or IDLE`)

  // Show transitions
  const transitions = await prisma.stateTransitionLog.findMany({
    where: { sessionId: finalSess?.id ?? '' },
    orderBy: { createdAt: 'asc' },
    select: { fromState: true, toState: true, triggerType: true },
  })
  console.log('\nState transitions:')
  transitions.forEach(t => step(`  ${t.fromState} → ${t.toState}  [${t.triggerType}]`))

  const invalidReset = transitions.find(t => t.triggerType === 'INVALID_SESSION_RESET_AFTER_CANCELLATION')
  if (invalidReset) fail('INVALID_SESSION_RESET_AFTER_CANCELLATION transition logged')
  else pass('No INVALID_SESSION_RESET_AFTER_CANCELLATION in transitions')

  console.log('\n═══════════════════════════════════')
  console.log('QA COMPLETE')
  console.log('═══════════════════════════════════\n')

  await prisma.$disconnect()
}

main().catch(async e => { console.error('CRASH:', e); await prisma.$disconnect(); process.exit(1) })
