import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '../lib/prisma-client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

async function main() {
  const clinics = await prisma.clinic.findMany({ 
    select: { id: true, name: true, slug: true, twilioPhoneNumber: true, isActive: true } 
  })
  console.log('CLINICS:', JSON.stringify(clinics, null, 2))
  
  const services = await prisma.service.findMany({
    select: { id: true, clinicId: true, name: true, isActive: true, durationMinutes: true, price: true }
  })
  console.log('SERVICES:', JSON.stringify(services, null, 2))
  
  const slots = await prisma.availableSlot.findMany({
    where: { startTime: { gte: new Date() }, isBooked: false },
    select: { id: true, clinicId: true, serviceId: true, startTime: true, isHeld: true, isBooked: true, heldBySessionId: true },
    take: 10,
    orderBy: { startTime: 'asc' }
  })
  console.log('UPCOMING FREE SLOTS:', JSON.stringify(slots, null, 2))
  
  const appointments = await prisma.appointment.findMany({
    select: { id: true, status: true, scheduledAt: true, clinicId: true, serviceId: true },
    take: 5,
    orderBy: { createdAt: 'desc' }
  })
  console.log('RECENT APPOINTMENTS:', JSON.stringify(appointments, null, 2))
  
  const reminderCount = await prisma.reminder.count()
  const notifJobCount = await prisma.notificationJob.count()
  console.log('REMINDERS:', reminderCount, 'NOTIFICATION_JOBS:', notifJobCount)
  
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
