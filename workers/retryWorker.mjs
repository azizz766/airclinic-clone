import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { prisma } from '../lib/prisma.ts'
import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

const connection = new IORedis(
  process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  { maxRetriesPerRequest: null }
)

new Worker(
  'notifications',
  async (job) => {
    console.log('Processing job', job.id)
    console.log('STEP 1 BEFORE DB')

    const dbJob = await prisma.notificationJob.findUnique({
      where: { id: job.data.id }
    })

    console.log('STEP 2 AFTER DB')

    if (!dbJob) return

    try {
      console.log('Sending WhatsApp to:', dbJob.destination)
      console.log('STEP 3 BEFORE TWILIO')

      await client.messages.create({
        from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        to: 'whatsapp:' + dbJob.destination,
        body: dbJob.messageBody || 'Test message'
      })

      console.log('STEP 4 AFTER TWILIO')

      await prisma.notificationJob.update({
        where: { id: dbJob.id },
        data: { status: 'sent' }
      })

      console.log('✅ Sent')
    } catch (err) {
      console.error('❌ Error:', err.message)

      await prisma.notificationJob.update({
        where: { id: dbJob.id },
        data: {
          retryCount: { increment: 1 }
        }
      })

      throw err
    }
  },
  { connection }
)

console.log('🔥 Worker ready')
