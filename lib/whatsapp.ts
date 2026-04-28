import twilio from "twilio"
import { normalizeDigitsToEnglish } from '@/lib/whatsapp/twilio-sender'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

export async function sendWhatsAppMessage(to: string, body: string) {
  const isDevMode = process.env.WHATSAPP_DEV_MODE === 'true'
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction && isDevMode) {
    console.error('[WHATSAPP] WhatsApp dev mode enabled in production — aborting send')
    throw new Error(
      'WHATSAPP_DEV_MODE cannot be enabled in a production environment. Unset WHATSAPP_DEV_MODE to send real messages.'
    )
  }

  if (isDevMode) {
    const sid = `mock_whatsapp_${Date.now()}`
    const from = process.env.TWILIO_WHATSAPP_NUMBER ?? 'whatsapp:+000000000000'

    console.info('[WHATSAPP MOCK SEND]', {
      to,
      body,
      sid,
      mocked: true,
    })

    return {
      sid,
      status: 'sent',
      to: `whatsapp:${to}`,
      from,
      body,
      mocked: true,
      provider: 'mock-twilio',
      createdAt: new Date().toISOString(),
    }
  }

  const statusCallbackUrl = process.env.APP_URL
    ? `${process.env.APP_URL.replace(/\/$/, '')}/api/whatsapp/status`
    : undefined

  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER!,
    to: `whatsapp:${to}`,
    body: normalizeDigitsToEnglish(body),
    ...(statusCallbackUrl ? { statusCallback: statusCallbackUrl } : {}),
  })
}