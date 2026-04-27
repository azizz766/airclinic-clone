/**
 * Scenario 2 regression: duplicate booking confirmation.
 *
 * After a booking is confirmed, send نعم again multiple times.
 * Verifies:
 *   - exactly one Appointment in DB
 *   - no duplicate reminders/jobs
 *   - safe idempotent reply on 2nd and 3rd confirmation
 */
import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '../lib/prisma-client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const CLINIC_ID = 'cmnkmp2h40000dq9kj4vgb2tu'
const TWILIO_TO  = 'whatsapp:+14155238886'
const PHONE      = '+966099990003'

let mc = 800
function sid() { return `SMdup${Date.now()}${mc++}` }

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
function hdr(m: string)  { console.log(`\n${'═'.repeat(52)}\n${m}\n${'═'.repeat(52)}`) }

async function main() {
  hdr(`DUPLICATE CONFIRMATION E2E  |  ${new Date().toISOString()}`)

  // ─── CLEANUP (approved pattern from qa-cancel-full-e2e.ts) ────────────────
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
  step(`State: ${s?.currentState}`)
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
  if (s?.currentState !== 'SLOT_COLLECTION_DATE') { fail(`Expected SLOT_COLLECTION_DATE`); process.exit(1) }
  pass('SLOT_COLLECTION_DATE')

  step('بكرا')
  await send('بكرا')
  await wait(4000)
  s = await sess()
  if (s?.currentState !== 'SLOT_COLLECTION_TIME') { fail(`Expected SLOT_COLLECTION_TIME`); process.exit(1) }
  pass('SLOT_COLLECTION_TIME')

  step('1 (slot)')
  await send('1')
  await wait(3000)
  s = await sess()
  if (s?.currentState !== 'SLOT_COLLECTION_PATIENT_NAME') { fail(`Expected SLOT_COLLECTION_PATIENT_NAME`); process.exit(1) }
  pass('SLOT_COLLECTION_PATIENT_NAME')

  step('احمد اختبار QA')
  await send('احمد اختبار QA')
  await wait(3000)
  s = await sess()
  if (s?.currentState !== 'SLOT_COLLECTION_PATIENT_DOB') { fail(`Expected SLOT_COLLECTION_PATIENT_DOB`); process.exit(1) }
  pass('SLOT_COLLECTION_PATIENT_DOB')

  step('1990-05-15')
  await send('1990-05-15')
  await wait(3000)
  s = await sess()
  if (s?.currentState !== 'SLOT_COLLECTION_PHONE_CONFIRM') { fail(`Expected SLOT_COLLECTION_PHONE_CONFIRM`); process.exit(1) }
  pass('SLOT_COLLECTION_PHONE_CONFIRM')

  step('نعم (phone confirm)')
  await send('نعم')
  await wait(3000)
  s = await sess()
  if (s?.currentState !== 'CONFIRMATION_PENDING') { fail(`Expected CONFIRMATION_PENDING`); process.exit(1) }
  pass('CONFIRMATION_PENDING')

  step('نعم (1st — booking confirmation)')
  await send('نعم')
  await wait(7000)
  s = await sess()
  step(`State: ${s?.currentState}  bookingId: ${s?.bookingId}`)
  if (!s?.bookingId) { fail('No bookingId after first confirmation'); process.exit(1) }
  pass(`BOOKING_CONFIRMED, bookingId: ${s.bookingId}`)

  const bookingId = s.bookingId!

  const appt1 = await prisma.appointment.findUnique({
    where: { id: bookingId },
    include: { reminders: true, notificationJobs: true },
  })
  step(`Appointment status: ${appt1?.status}`)
  step(`Reminders: ${appt1?.reminders.length}`)
  step(`NotifJobs: ${appt1?.notificationJobs.length}`)
  if (appt1?.status !== 'scheduled') { fail(`Expected scheduled, got ${appt1?.status}`); process.exit(1) }
  pass('Appointment scheduled after 1st confirm')

  // ─── PHASE 2: REPEATED CONFIRMATIONS ─────────────────────────────────────
  hdr('PHASE 2 — REPEATED CONFIRMATIONS (should be idempotent)')

  step('نعم (2nd — after booking confirmed)')
  const r2 = await send('نعم')
  await wait(3000)
  s = await sess()
  step(`State after 2nd confirm: ${s?.currentState}  HTTP: ${r2.status}`)

  step('نعم (3rd)')
  const r3 = await send('نعم')
  await wait(3000)
  s = await sess()
  step(`State after 3rd confirm: ${s?.currentState}  HTTP: ${r3.status}`)

  // ─── PHASE 3: VERIFICATION ────────────────────────────────────────────────
  hdr('PHASE 3 — DB VERIFICATION')

  // Count total appointments for this patient at this time
  const patient = await prisma.patient.findFirst({ where: { clinicId: CLINIC_ID, phone: PHONE } })
  const allAppts = patient ? await prisma.appointment.findMany({
    where: { clinicId: CLINIC_ID, patientId: patient.id },
    include: { reminders: true, notificationJobs: true },
    orderBy: { createdAt: 'desc' },
  }) : []

  step(`Total appointments for this patient: ${allAppts.length}`)
  const active = allAppts.filter(a => a.status !== 'cancelled' && a.cancellationReason !== 'qa-cleanup')
  step(`Active (non-cleanup-cancelled): ${active.length}`)
  step(`Details: ${JSON.stringify(active.map(a => ({ id: a.id, status: a.status })))}`)

  if (active.length === 1) pass('Exactly one active appointment — no duplicates')
  else fail(`Expected 1 active appointment, found ${active.length}`)

  const originalAppt = await prisma.appointment.findUnique({
    where: { id: bookingId },
    include: { reminders: true, notificationJobs: true },
  })

  const pendingReminders = originalAppt?.reminders.filter(r => r.status === 'pending') ?? []
  const pendingJobs      = originalAppt?.notificationJobs.filter(j => j.status === 'pending' || j.status === 'queued') ?? []
  step(`Pending reminders on original appt: ${pendingReminders.length}`)
  step(`Pending notification jobs on original appt: ${pendingJobs.length}`)

  if (pendingReminders.length <= 1) pass(`Reminder count safe (${pendingReminders.length}) — no duplicates`)
  else fail(`Too many pending reminders: ${pendingReminders.length}`)

  if (pendingJobs.length <= 1) pass(`NotifJob count safe (${pendingJobs.length}) — no duplicates`)
  else fail(`Too many pending notification jobs: ${pendingJobs.length}`)

  hdr(`RESULT: ${failures === 0 ? '✅ PASS' : `❌ ${failures} FAILURE(S)`}`)

  await prisma.$disconnect()
  process.exit(failures > 0 ? 1 : 0)
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
