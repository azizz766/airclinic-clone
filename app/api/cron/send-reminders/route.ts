import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import twilio from 'twilio'

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
)

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const now = new Date()

  const jobs = await prisma.notificationJob.findMany({
    where: {
      status: 'pending',
      scheduledFor: { lte: now },
      channel: 'whatsapp',
      appointment: { status: { not: 'cancelled' } },
    },
    select: {
      id: true,
      destination: true,
      messageBody: true,
      clinicId: true,
    },
    take: 50,
  })

  let sent = 0
  let failed = 0

  for (const job of jobs) {
    try {
      const clinic = await prisma.clinic.findUnique({
        where: { id: job.clinicId },
        select: { twilioPhoneNumber: true },
      })

      if (!clinic?.twilioPhoneNumber) {
        console.error('[send-reminders] no twilioPhoneNumber', { clinicId: job.clinicId })
        failed++
        continue
      }

      const msg = await twilioClient.messages.create({
        from: `whatsapp:${clinic.twilioPhoneNumber}`,
        to: `whatsapp:${job.destination}`,
        body: job.messageBody,
      })

      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: 'sent', sentAt: now, providerMessageId: msg.sid },
      })

      sent++
    } catch (err) {
      console.error('[send-reminders] failed', { jobId: job.id, err })
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: 'failed', errorMessage: String(err) },
      })
      failed++
    }
  }

  return NextResponse.json({ sent, failed, total: jobs.length })
}
