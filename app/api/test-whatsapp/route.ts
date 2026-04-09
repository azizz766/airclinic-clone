import { NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export async function GET() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_ENDPOINT !== 'true') {
    console.error('Blocked test endpoint in production')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const to = process.env.TEST_WHATSAPP_TO || '+15551234567'
  const body = `AirClinic test message (${new Date().toISOString()})`

  try {
    const message = await sendWhatsAppMessage(to, body)

    return NextResponse.json({
      ok: true,
      sid: message.sid,
      to,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send test WhatsApp message'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
