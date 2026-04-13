import twilio from 'twilio'

interface StaffNotificationParams {
  patientName: string
  serviceName: string
  scheduledAt: Date
  phone: string
}

export async function sendStaffBookingNotification(params: StaffNotificationParams): Promise<void> {
  const staffNumber = process.env.STAFF_WHATSAPP_NUMBER
  const twilioFrom = process.env.TWILIO_WHATSAPP_NUMBER
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!staffNumber) {
    console.warn('[staff-whatsapp] STAFF_WHATSAPP_NUMBER not set — skipping notification')
    return
  }

  const scheduledStr = params.scheduledAt.toLocaleString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const message = `🔔 حجز جديد عبر واتساب\n👤 المريض: ${params.patientName}\n🦷 الخدمة: ${params.serviceName}\n📅 الموعد: ${scheduledStr}\n📞 رقم المريض: ${params.phone}`

  try {
    const client = twilio(accountSid, authToken)
    await client.messages.create({
      from: `whatsapp:${twilioFrom}`,
      to: `whatsapp:${staffNumber}`,
      body: message,
    })
    console.log('[staff-whatsapp] notification sent to staff')
  } catch (err) {
    console.error('[staff-whatsapp] failed to send notification', { err })
  }
}
