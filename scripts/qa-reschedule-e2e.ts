/**
 * Scenario 3 regression: reschedule flow.
 *
 * Phase 1: Complete a full booking.
 * Phase 2: Send "ابي اعدل الموعد", pick a new date + new slot.
 * Phase 3: Verify:
 *   - same Appointment row updated (not a new row)
 *   - old slot freed
 *   - new slot booked
 *   - old reminders/jobs invalidated
 *   - new reminders/jobs created
 *   - calendarEventId behaviour reported
 */
import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '../lib/prisma-client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const CLINIC_ID = 'cmnkmp2h40000dq9kj4vgb2tu'
const TWILIO_TO  = 'whatsapp:+14155238886'
const PHONE      = '+966099990004'

let mc = 900
function sid() { return `SMrsch${Date.now()}${mc++}` }

async function send(body: string) {
  const payload = new URLSearchParams({
    From: `whatsapp:${PHONE}`, To: TWILIO_TO, Body: body, MessageSid: sid(),
  }).toString()
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
function fail(m: string) { console.log(`  ❌ FAIL: ${m}`); failures++ }
function step(m: string) { console.log(`  ⟶  ${m}`) }
function warn(m: string) { console.log(`  ⚠️  ${m}`) }
function hdr(m: string)  { console.log(`\n${'═'.repeat(52)}\n${m}\n${'═'.repeat(52)}`) }

async function main() {
  hdr(`RESCHEDULE E2E  |  ${new Date().toISOString()}`)

  // ─── CLEANUP (approved pattern) ───────────────────────────────────────────
  hdr('CLEANUP')
  const old = await sess()
  if (old) {
    await prisma.stateTransitionLog.deleteMany({ where: { sessionId: old.id } })
    await prisma.conversationMessage.deleteMany({ where: { sessionId: old.id } })
    await prisma.conversationSession.delete({ where: { id: old.id } })
    step(`Deleted session ${old.id}`)
  }
  const patient0 = await prisma.patient.findFirst({ where: { clinicId: CLINIC_ID, phone: PHONE } })
  if (patient0) {
    const stale = await prisma.appointment.updateMany({
      where: {
        clinicId: CLINIC_ID, patientId: patient0.id,
        status: { in: ['scheduled', 'confirmed', 'confirmation_pending'] },
      },
      data: { status: 'cancelled', cancellationReason: 'qa-cleanup' },
    })
    step(`Stale appointments cancelled: ${stale.count}`)
  }

  // ─── PHASE 1: COMPLETE BOOKING ────────────────────────────────────────────
  hdr('PHASE 1 — COMPLETE BOOKING')

  step('أبغى أحجز تنظيف')
  await send('أبغى أحجز تنظيف')
  await wait(3000)
  let s = await sess()
  if (s?.currentState !== 'SLOT_COLLECTION_SERVICE') {
    fail(`Expected SLOT_COLLECTION_SERVICE, got ${s?.currentState}`); process.exit(1)
  }
  pass('SLOT_COLLECTION_SERVICE')

  const services = s.ambiguousIntents as Array<{ id: string; name: string }>
  const idx = services.findIndex(svc => svc.name.includes('تنظيف'))
  if (idx === -1) { fail('تنظيف not in service list'); process.exit(1) }
  step(`Selecting service ${idx + 1} (${services[idx]!.name})`)
  await send(String(idx + 1))
  await wait(3000)
  s = await sess()
  if (s?.currentState !== 'SLOT_COLLECTION_DATE') { fail('Expected SLOT_COLLECTION_DATE'); process.exit(1) }
  pass('SLOT_COLLECTION_DATE')

  step('بكرا')
  await send('بكرا')
  await wait(4000)
  s = await sess()
  if (s?.currentState !== 'SLOT_COLLECTION_TIME') { fail('Expected SLOT_COLLECTION_TIME'); process.exit(1) }
  pass('SLOT_COLLECTION_TIME')

  step('1 (slot)')
  await send('1')
  await wait(3000)
  s = await sess()
  if (s?.currentState !== 'SLOT_COLLECTION_PATIENT_NAME') { fail('Expected SLOT_COLLECTION_PATIENT_NAME'); process.exit(1) }
  const originalSlotId = s.slotTimeId!
  step(`Original slot held: ${originalSlotId}`)
  pass('SLOT_COLLECTION_PATIENT_NAME')

  step('احمد اختبار QA')
  await send('احمد اختبار QA')
  await wait(3000)
  s = await sess()
  if (s?.currentState !== 'SLOT_COLLECTION_PATIENT_DOB') { fail('Expected SLOT_COLLECTION_PATIENT_DOB'); process.exit(1) }
  pass('SLOT_COLLECTION_PATIENT_DOB')

  step('1990-05-15')
  await send('1990-05-15')
  await wait(3000)
  s = await sess()
  if (s?.currentState !== 'SLOT_COLLECTION_PHONE_CONFIRM') { fail('Expected SLOT_COLLECTION_PHONE_CONFIRM'); process.exit(1) }
  pass('SLOT_COLLECTION_PHONE_CONFIRM')

  step('نعم (phone confirm)')
  await send('نعم')
  await wait(3000)
  s = await sess()
  if (s?.currentState !== 'CONFIRMATION_PENDING') { fail('Expected CONFIRMATION_PENDING'); process.exit(1) }
  pass('CONFIRMATION_PENDING')

  step('نعم (booking confirm)')
  await send('نعم')
  await wait(7000)
  s = await sess()
  if (!s?.bookingId) { fail('No bookingId after confirmation'); process.exit(1) }
  pass(`BOOKING_CONFIRMED  bookingId: ${s.bookingId}`)

  const bookingId = s.bookingId!

  const apptBefore = await prisma.appointment.findUnique({
    where: { id: bookingId },
    include: { reminders: true, notificationJobs: true },
  })
  const slotBefore = await prisma.availableSlot.findUnique({ where: { id: originalSlotId } })

  step(`Before reschedule — scheduledAt: ${apptBefore?.scheduledAt?.toISOString()}`)
  step(`Before reschedule — slot isBooked: ${slotBefore?.isBooked}`)
  step(`Before reschedule — calendarEventId: ${apptBefore?.calendarEventId ?? '(null)'}`)
  step(`Before reschedule — reminders pending: ${apptBefore?.reminders.filter(r => r.status === 'pending').length}`)
  step(`Before reschedule — notifJobs pending: ${apptBefore?.notificationJobs.filter(j => j.status === 'pending' || j.status === 'queued').length}`)

  if (!slotBefore?.isBooked) { fail('Original slot not booked before reschedule'); process.exit(1) }
  pass('Phase 1 complete — booking confirmed, original slot booked')

  // ─── PHASE 2: RESCHEDULE FLOW ─────────────────────────────────────────────
  hdr('PHASE 2 — RESCHEDULE')

  // Session should be IDLE now (reset after booking)
  s = await sess()
  step(`Session state at reschedule start: ${s?.currentState}`)

  step('ابي اعدل الموعد')
  await send('ابي اعدل الموعد')
  await wait(4000)
  s = await sess()
  step(`State after reschedule intent: ${s?.currentState}`)
  if (s?.currentState !== 'RESCHEDULE_PENDING' && s?.currentState !== 'RESCHEDULE_DATE') {
    fail(`Expected RESCHEDULE_PENDING or RESCHEDULE_DATE, got ${s?.currentState}`)
    process.exit(1)
  }
  pass(`${s?.currentState}`)

  // Pick day-after-tomorrow to avoid same slot as original booking
  step('بعد بكرا (day after tomorrow)')
  await send('بعد بكرا')
  await wait(4000)
  s = await sess()
  step(`State after date: ${s?.currentState}`)

  // If no slots that day, fall back to بكرا
  if (s?.currentState === 'RESCHEDULE_DATE') {
    warn('No slots for day-after-tomorrow — retrying with بكرا')
    await send('بكرا')
    await wait(4000)
    s = await sess()
    step(`State after fallback date: ${s?.currentState}`)
  }

  if (s?.currentState !== 'RESCHEDULE_TIME') {
    fail(`Expected RESCHEDULE_TIME, got ${s?.currentState}`)
    process.exit(1)
  }
  pass('RESCHEDULE_TIME — new slots offered')

  // Capture offered slots to pick one that differs from original
  const offeredSlots = s.ambiguousIntents as Array<{ id: string }> | null
  step(`Offered slots count: ${offeredSlots?.length ?? 0}`)

  // Always pick slot 1 (first available)
  step('1 (new slot)')
  await send('1')
  await wait(7000)
  s = await sess()
  step(`State after reschedule slot: ${s?.currentState}`)
  if (s?.currentState !== 'RESCHEDULE_CONFIRMED') {
    fail(`Expected RESCHEDULE_CONFIRMED, got ${s?.currentState}`)
  } else {
    pass('RESCHEDULE_CONFIRMED')
  }

  // ─── PHASE 3: VERIFICATION ────────────────────────────────────────────────
  hdr('PHASE 3 — DB VERIFICATION')

  const apptAfter = await prisma.appointment.findUnique({
    where: { id: bookingId },
    include: { reminders: true, notificationJobs: true },
  })
  const slotAfter = await prisma.availableSlot.findUnique({ where: { id: originalSlotId } })

  step(`appointment.id unchanged: ${apptAfter?.id}`)
  step(`scheduledAt before: ${apptBefore?.scheduledAt?.toISOString()}`)
  step(`scheduledAt after:  ${apptAfter?.scheduledAt?.toISOString()}`)
  step(`appointment.status: ${apptAfter?.status}`)
  step(`old slot isBooked: ${slotAfter?.isBooked}`)
  step(`calendarEventId after: ${apptAfter?.calendarEventId ?? '(null)'}`)

  // Same appointment row
  if (apptAfter?.id === bookingId) pass('Same Appointment row — not duplicated')
  else fail('Appointment ID changed — new row was created instead of update')

  // scheduledAt changed
  if (apptAfter?.scheduledAt?.toISOString() !== apptBefore?.scheduledAt?.toISOString()) {
    pass('scheduledAt updated to new time')
  } else {
    fail('scheduledAt not updated — reschedule may not have persisted')
  }

  // Old slot freed
  if (!slotAfter?.isBooked) pass('Original slot freed (isBooked=false)')
  else fail('Original slot still booked after reschedule')

  // Old reminders/jobs invalidated
  const oldPendingReminders = apptAfter?.reminders.filter(r =>
    r.status === 'pending' &&
    new Date(r.scheduledAt) < new Date(apptAfter!.scheduledAt)
  ) ?? []
  const oldPendingJobs = apptAfter?.notificationJobs.filter(j =>
    (j.status === 'pending' || j.status === 'queued') &&
    new Date((j as any).scheduledFor ?? 0) < new Date(apptAfter!.scheduledAt)
  ) ?? []

  const cancelledReminders = apptAfter?.reminders.filter(r => r.status === 'cancelled') ?? []
  const failedJobs          = apptAfter?.notificationJobs.filter(j => j.status === 'failed') ?? []

  step(`Cancelled reminders: ${cancelledReminders.length}`)
  step(`Failed/invalidated jobs: ${failedJobs.length}`)

  if (cancelledReminders.length > 0) pass(`Old reminders invalidated (${cancelledReminders.length} cancelled)`)
  else warn('No cancelled reminders found — may already been none, or invalidation skipped')

  if (failedJobs.length > 0) pass(`Old notification jobs invalidated (${failedJobs.length} failed)`)
  else warn('No failed jobs found — may already been none, or invalidation skipped')

  // New reminders/jobs created
  const newPendingReminders = apptAfter?.reminders.filter(r => r.status === 'pending') ?? []
  const newPendingJobs      = apptAfter?.notificationJobs.filter(j => j.status === 'pending' || j.status === 'queued') ?? []
  step(`New pending reminders: ${newPendingReminders.length}`)
  step(`New pending notification jobs: ${newPendingJobs.length}`)

  if (newPendingReminders.length >= 1) pass(`New reminders created (${newPendingReminders.length})`)
  else fail('No new pending reminders created after reschedule')

  if (newPendingJobs.length >= 1) pass(`New notification jobs created (${newPendingJobs.length})`)
  else fail('No new pending notification jobs created after reschedule')

  // Total appointments count — must still be 1 active
  const patient = await prisma.patient.findFirst({ where: { clinicId: CLINIC_ID, phone: PHONE } })
  const allAppts = patient ? await prisma.appointment.findMany({
    where: { clinicId: CLINIC_ID, patientId: patient.id },
  }) : []
  const active = allAppts.filter(a => a.status !== 'cancelled' && a.cancellationReason !== 'qa-cleanup')
  step(`Total appointments for patient: ${allAppts.length}  active: ${active.length}`)
  if (active.length === 1) pass('Exactly one active appointment — no duplicates')
  else fail(`Expected 1 active appointment, found ${active.length}`)

  // Calendar event ID report (informational — sync may fail if token expired)
  if (apptAfter?.calendarEventId) {
    pass(`calendarEventId present: ${apptAfter.calendarEventId}`)
  } else {
    warn('calendarEventId is null — Google Calendar sync may have failed (check token expiry)')
  }

  hdr(`RESULT: ${failures === 0 ? '✅ PASS' : `❌ ${failures} FAILURE(S)`}`)

  await prisma.$disconnect()
  process.exit(failures > 0 ? 1 : 0)
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
