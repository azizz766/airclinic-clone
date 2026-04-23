import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '../lib/prisma-client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const DB_URL = process.env.DATABASE_URL!
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DB_URL }),
})

const CLINIC_ID = 'cmnkmp2h40000dq9kj4vgb2tu'

async function main() {
  // 1. Show DATABASE_URL host (hide password)
  const url = new URL(DB_URL)
  console.log('=== DB ENVIRONMENT ===')
  console.log('Host:', url.hostname)
  console.log('Port:', url.port)
  console.log('Database:', url.pathname)
  console.log('User:', url.username)

  // 2. Show clinic details
  const clinic = await prisma.clinic.findUnique({
    where: { id: CLINIC_ID },
    select: {
      id: true, name: true, slug: true, email: true, phone: true,
      twilioPhoneNumber: true, isActive: true, subscriptionPlan: true,
      createdAt: true,
    }
  })
  console.log('\n=== CLINIC RECORD ===')
  console.log(JSON.stringify(clinic, null, 2))

  // 3. All clinic counts
  const [
    apptCount, sessionCount, msgCount, notifCount, reminderCount, slotCount, patientCount
  ] = await Promise.all([
    prisma.appointment.count({ where: { clinicId: CLINIC_ID } }),
    prisma.conversationSession.count({ where: { clinicId: CLINIC_ID } }),
    prisma.conversationMessage.count({ where: { clinicId: CLINIC_ID } }),
    prisma.notificationJob.count({ where: { clinicId: CLINIC_ID } }),
    prisma.reminder.count({ where: { clinicId: CLINIC_ID } }),
    prisma.availableSlot.count({ where: { clinicId: CLINIC_ID } }),
    prisma.patient.count({ where: { clinicId: CLINIC_ID } }),
  ])
  console.log('\n=== RECORD COUNTS (clinic cmnkmp2h40000dq9kj4vgb2tu) ===')
  console.log({ apptCount, sessionCount, msgCount, notifCount, reminderCount, slotCount, patientCount })

  // 4. Sample 3 recent appointments
  const appts = await prisma.appointment.findMany({
    where: { clinicId: CLINIC_ID },
    select: { id: true, status: true, scheduledAt: true, createdAt: true, source: true, notes: true },
    orderBy: { createdAt: 'desc' },
    take: 3,
  })
  console.log('\n=== RECENT APPOINTMENTS (last 3) ===')
  console.log(JSON.stringify(appts, null, 2))

  // 5. Sample 3 recent patients
  const patients = await prisma.patient.findMany({
    where: { clinicId: CLINIC_ID },
    select: { id: true, firstName: true, lastName: true, phone: true, email: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 3,
  })
  console.log('\n=== RECENT PATIENTS (last 3) ===')
  console.log(JSON.stringify(patients, null, 2))

  // 6. Sample 3 recent sessions
  const sessions = await prisma.conversationSession.findMany({
    where: { clinicId: CLINIC_ID },
    select: { id: true, phoneNumber: true, currentState: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'desc' },
    take: 3,
  })
  console.log('\n=== RECENT SESSIONS (last 3) ===')
  console.log(JSON.stringify(sessions, null, 2))

  // 7. Slot breakdown
  const slotStats = await prisma.availableSlot.groupBy({
    by: ['isBooked', 'isHeld'],
    where: { clinicId: CLINIC_ID },
    _count: true,
  })
  console.log('\n=== SLOT BREAKDOWN ===')
  console.log(JSON.stringify(slotStats, null, 2))

  // 8. Slots for تنظيف specifically
  const tandeefSlots = await prisma.availableSlot.findMany({
    where: { clinicId: CLINIC_ID, serviceId: 'cmnkrgtrv000gdq9k1whjk7em' },
    select: { id: true, startTime: true, isBooked: true, isHeld: true, heldBySessionId: true },
    orderBy: { startTime: 'asc' },
  })
  console.log('\n=== SLOTS FOR تنظيف الأسنان (all) ===')
  console.log(JSON.stringify(tandeefSlots, null, 2))

  // 9. Memberships (who owns this clinic)
  const memberships = await prisma.membership.findMany({
    where: { clinicId: CLINIC_ID },
    select: { role: true, isActive: true, joinedAt: true, user: { select: { email: true, firstName: true } } },
  })
  console.log('\n=== MEMBERSHIPS ===')
  console.log(JSON.stringify(memberships, null, 2))

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
