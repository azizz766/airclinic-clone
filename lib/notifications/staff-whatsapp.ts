import twilio from 'twilio'
import { normalizeDigitsToEnglish } from '@/lib/whatsapp/twilio-sender'

interface StaffNotificationParams {
  patientName: string
  serviceName: string
  scheduledAt: Date
  phone: string
}

export async function sendStaffBookingNotification(
  params: StaffNotificationParams
): Promise<void> {
  const staffNumber = process.env.STAFF_WHATSAPP_NUMBER
  const twilioFrom = process.env.TWILIO_WHATSAPP_NUMBER
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!staffNumber) {
    console.warn('[staff-whatsapp] STAFF_WHATSAPP_NUMBER not set — skipping notification')
    return
  }

  if (!twilioFrom || !accountSid || !authToken) {
    console.warn('[staff-whatsapp] Missing Twilio env vars')
    return
  }

  const scheduledStr = params.scheduledAt.toLocaleString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Riyadh',
  })

  const message = `حجز جديد
الخدمة: ${params.serviceName}
الاسم: ${params.patientName}
الجوال: ${params.phone || 'غير متوفر'}
الموعد: ${scheduledStr}`

  try {
    const client = twilio(accountSid, authToken)

    const result = await client.messages.create({
      from: `whatsapp:${twilioFrom}`,
      to: `whatsapp:${staffNumber}`,
      body: normalizeDigitsToEnglish(message),
    })

    console.log(JSON.stringify({
      event: '[staff-booking-whatsapp] send_success',
      sid: result.sid,
      status: result.status,
    }))
  } catch (err) {
    const e = err as Record<string, unknown>
    console.error(JSON.stringify({
      event: '[staff-booking-whatsapp] send_failure',
      code: e['code'],
      status: e['status'],
      message: e['message'],
    }))
  }
}