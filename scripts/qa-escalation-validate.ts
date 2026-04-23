import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '../lib/prisma-client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const CLINIC_ID = 'cmnkmp2h40000dq9kj4vgb2tu'
const TWILIO_TO  = 'whatsapp:+14155238886'
const PHONE1     = '+966099990001'
const PHONE2     = '+966099990002'

let ctr = 900

async function send(phone: string, body: string) {
  const payload = new URLSearchParams({
    From: `whatsapp:${phone}`, To: TWILIO_TO,
    Body: body, MessageSid: `SMtest${Date.now()}${ctr++}`,
  }).toString()
  const res = await fetch('http://localhost:3000/api/whatsapp/webhook-v2', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: payload,
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function getSession(phone: string) {
  return prisma.conversationSession.findUnique({
    where: { phoneNumber_clinicId: { phoneNumber: phone, clinicId: CLINIC_ID } },
  })
}

async function wait(ms: number) { return new Promise(r => setTimeout(r, ms)) }
function ok(m: string)   { console.log('  ✅ ' + m) }
function fail(m: string) { console.log('  ❌ FAIL: ' + m) }
function step(m: string) { console.log('  → ' + m) }

// Helper: expire and reset a test session
async function expireSession(phone: string) {
  const sess = await getSession(phone)
  if (!sess) return
  await prisma.conversationSession.update({
    where: { id: sess.id }, data: { expiresAt: new Date(Date.now() - 60_000) },
  })
  await fetch('http://localhost:3000/api/cron/expire-sessions', {
    method: 'GET', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  await wait(500)
}

// Helper: drive a session to a target state
async function driveToState(phone: string, targetState: string): Promise<boolean> {
  await expireSession(phone)
  // initial message to reset + enter booking flow
  await send(phone, 'أبغى أحجز')
  await wait(3000)
  let sess = await getSession(phone)
  if (targetState === 'SLOT_COLLECTION_SERVICE') return sess?.currentState === targetState

  const svcs = (sess?.ambiguousIntents ?? []) as Array<{ id: string; name: string }>
  const tidx = svcs.findIndex(s => typeof s.name === 'string' && s.name.includes('تنظيف'))
  if (tidx === -1) { console.log('  تنظيف not found'); return false }
  await send(phone, String(tidx + 1))
  await wait(3000)
  sess = await getSession(phone)
  if (targetState === 'SLOT_COLLECTION_DATE') return sess?.currentState === targetState

  await send(phone, 'بكرا')
  await wait(4000)
  sess = await getSession(phone)
  if (targetState === 'SLOT_COLLECTION_TIME') return sess?.currentState === targetState

  await send(phone, '1')
  await wait(3000)
  sess = await getSession(phone)
  if (targetState === 'SLOT_COLLECTION_PATIENT_NAME') return sess?.currentState === targetState

  await send(phone, 'احمد اختبار')
  await wait(3000)
  sess = await getSession(phone)
  if (targetState === 'SLOT_COLLECTION_PATIENT_DOB') return sess?.currentState === targetState

  await send(phone, '1990-05-15')
  await wait(3000)
  sess = await getSession(phone)
  if (targetState === 'SLOT_COLLECTION_PHONE_CONFIRM') return sess?.currentState === targetState

  await send(phone, 'نعم')
  await wait(3000)
  sess = await getSession(phone)
  if (targetState === 'CONFIRMATION_PENDING') return sess?.currentState === targetState

  return false
}

async function checkEscalation(label: string, phone: string, fromState: string) {
  console.log(`\n── ${label} (from ${fromState}) ──`)
  await send(phone, 'اريد موظف')
  await wait(3000)
  const sess = await getSession(phone)
  step(`currentState = ${sess?.currentState}`)
  step(`handoffActive = ${sess?.handoffActive}`)

  if (sess?.currentState === 'HUMAN_ESCALATION_PENDING') ok('currentState = HUMAN_ESCALATION_PENDING')
  else fail(`currentState should be HUMAN_ESCALATION_PENDING, got ${sess?.currentState}`)

  if (sess?.handoffActive) ok('handoffActive = true')
  else fail('handoffActive should be true')

  // Verify bot is silent on next message during handoff
  await send(phone, 'هل أنتم هناك؟')
  await wait(2000)
  const sess2 = await getSession(phone)
  if (sess2?.currentState === 'HUMAN_ESCALATION_PENDING') ok('State unchanged during handoff — bot silent')
  else fail(`State changed during handoff: ${sess2?.currentState}`)

  // Verify resume path still works
  await send(phone, 'أبغى أحجز')
  await wait(3000)
  const sess3 = await getSession(phone)
  step(`State after booking resume: ${sess3?.currentState}, handoffActive: ${sess3?.handoffActive}`)
  if (!sess3?.handoffActive && sess3?.currentState === 'SLOT_COLLECTION_SERVICE') {
    ok('Resume path works — handoff cleared, booking flow restarted')
  } else {
    fail(`Resume unexpected: state=${sess3?.currentState} handoffActive=${sess3?.handoffActive}`)
  }
}

async function main() {
  console.log('=== ESCALATION VALIDATION — ' + new Date().toISOString() + ' ===')

  // Case 1: Escalation from SLOT_COLLECTION_DATE
  const ready1 = await driveToState(PHONE1, 'SLOT_COLLECTION_DATE')
  step(`PHONE1 at SLOT_COLLECTION_DATE: ${ready1}`)
  if (ready1) await checkEscalation('Case 1', PHONE1, 'SLOT_COLLECTION_DATE')
  else fail('Could not reach SLOT_COLLECTION_DATE')

  // Case 2: Escalation from SLOT_COLLECTION_PATIENT_NAME
  const ready2 = await driveToState(PHONE2, 'SLOT_COLLECTION_PATIENT_NAME')
  step(`PHONE2 at SLOT_COLLECTION_PATIENT_NAME: ${ready2}`)
  if (ready2) await checkEscalation('Case 2', PHONE2, 'SLOT_COLLECTION_PATIENT_NAME')
  else fail('Could not reach SLOT_COLLECTION_PATIENT_NAME')

  // Case 3: Escalation from CONFIRMATION_PENDING
  const ready3 = await driveToState(PHONE1, 'CONFIRMATION_PENDING')
  step(`PHONE1 at CONFIRMATION_PENDING: ${ready3}`)
  if (ready3) await checkEscalation('Case 3', PHONE1, 'CONFIRMATION_PENDING')
  else fail('Could not reach CONFIRMATION_PENDING')

  console.log('\n=== DONE ===')
  await prisma.$disconnect()
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
