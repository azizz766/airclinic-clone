import { notificationQueue } from '../lib/queue.ts'
import { prisma } from '../lib/prisma.js'

async function main() {
  // 1) جيب بيانات حقيقية من الداتابيس
  const clinic = await prisma.clinic.findFirst()
  const service = await prisma.service.findFirst({ where: { clinicId: clinic.id } })

  if (!clinic || !service) {
    throw new Error("❌ لازم يكون عندك clinic + service في الداتابيس")
  }

  // 2) أنشئ patient
  const patient = await prisma.patient.create({
    data: {
      clinicId: clinic.id,
      firstName: "Test",
      lastName: "User",
      phone: "966599994144"
    }
  })

  // 3) أنشئ appointment
  const appointment = await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      serviceId: service.id,
      scheduledAt: new Date(),
      durationMinutes: 30,
    }
  })

  // 4) أنشئ reminder
  const reminder = await prisma.reminder.create({
    data: {
      clinicId: clinic.id,
      appointmentId: appointment.id,
      type: "whatsapp",
      scheduledAt: new Date(),
    }
  })

  // 5) أنشئ notification job
const job = await prisma.notificationJob.create({
  data: {
    clinicId: clinic.id,
    reminderId: reminder.id,
    appointmentId: appointment.id,
    patientId: patient.id,
    destination: patient.phone,
    messageBody: "Hello from Velora 🔥",
    status: "pending",
    retryCount: 0,
    channel: "whatsapp",
    scheduledFor: new Date(),
  }
})

await notificationQueue.add('send', {
  id: job.id
})

  console.log("✅ Test job created")
}

main()
