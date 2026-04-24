import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '../lib/prisma-client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const CLINIC_ID = 'cmnkmp2h40000dq9kj4vgb2tu'
const TWILIO_TO = 'whatsapp:+14155238886'
const PHONE = '+966099990099'
let c = 990

async function send(body: string) {
  const sid = `SMtest${Date.now()}${c++}`
  const res = await fetch('http://localhost:3000/api/whatsapp/webhook-v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      From: `whatsapp:${PHONE}`,
      To: TWILIO_TO,
      Body: body,
      MessageSid: sid,
    }).toString(),
  })
  return res.text()
}

async function getSession() {
  return prisma.conversationSession.findUnique({
    where: {
      phoneNumber_clinicId: {
        phoneNumber: PHONE,
        clinicId: CLINIC_ID,
      },
    },
  })
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function run() {
  await prisma.conversationSession.deleteMany({
    where: { phoneNumber: PHONE, clinicId: CLINIC_ID },
  })

  await send('أبغى أحجز')
  await wait(3500)

  let s = await getSession()
  if (s?.currentState !== 'SLOT_COLLECTION_SERVICE') {
    console.log('SETUP FAIL state=', s?.currentState)
    process.exit(1)
  }

  const svcs = s.ambiguousIntents as Array<{ id: string; name: string }>
  const idx = (svcs.findIndex((x) => x.name.includes('تنظيف')) + 1) || 1

  await send(String(idx))
  await wait(3500)

  s = await getSession()
  if (s?.currentState !== 'SLOT_COLLECTION_DATE') {
    console.log('SETUP FAIL state=', s?.currentState)
    process.exit(1)
  }

  await send('اليوم')
  await wait(5000)

  s = await getSession()
  if (s?.currentState !== 'SLOT_COLLECTION_TIME') {
    console.log('SETUP FAIL state=', s?.currentState)
    process.exit(1)
  }

  const initDate = s.slotDate?.toISOString().slice(0, 10)

  const tomorrowBase = new Date()
  const slotStart = new Date(Date.UTC(
    tomorrowBase.getUTCFullYear(),
    tomorrowBase.getUTCMonth(),
    tomorrowBase.getUTCDate() + 1,
    10, 0, 0,
  ))
  const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000)
  const seededSlot = await prisma.availableSlot.create({
    data: {
      clinicId: CLINIC_ID,
      serviceId: s.slotServiceId!,
      startTime: slotStart,
      endTime: slotEnd,
    },
  })

  try {
    await send('لا خلها بكرا')
    await wait(5000)

    s = await getSession()
    if (!s) {
      console.log('NO SESSION')
      process.exit(1)
    }

    const newSlots = s.ambiguousIntents as Array<{ id: string; startTime: string }> | null
    const newDateStr = s.slotDate?.toISOString().slice(0, 10) ?? 'null'

    const lastLog = await prisma.stateTransitionLog.findFirst({
      where: { sessionId: s.id },
      orderBy: { createdAt: 'desc' },
    })

    const slotsOnNewDate =
      (newSlots?.length ?? 0) > 0 &&
      newSlots!.every((x) => new Date(x.startTime).toISOString().slice(0, 10) === newDateStr)

    console.log('1. currentState:', s.currentState === 'SLOT_COLLECTION_TIME' ? 'PASS' : 'FAIL', s.currentState)
    console.log('2. slotDate changed:', newDateStr !== initDate ? 'PASS' : 'FAIL', newDateStr, 'was', initDate)
    console.log('3. slotTimeId null:', s.slotTimeId === null ? 'PASS' : 'FAIL', s.slotTimeId)
    console.log('4. slots only new date:', slotsOnNewDate ? 'PASS' : 'FAIL', 'count=', newSlots?.length ?? 0)
    console.log(
      '5. DATE_OVERRIDE log:',
      lastLog?.triggerType === 'DATE_OVERRIDE' ? 'PASS' : 'FAIL',
      lastLog?.triggerType,
      lastLog?.toState,
    )
  } finally {
    await prisma.availableSlot.delete({ where: { id: seededSlot.id } }).catch(() => {})
    await prisma.$disconnect()
  }
}

run().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
