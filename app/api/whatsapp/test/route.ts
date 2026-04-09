import { NextRequest, NextResponse } from 'next/server'
import { POST as webhookPost } from '@/app/api/whatsapp/webhook/route'

type TestInboundPayload = {
  from?: string
  body?: string
  originalRepliedSid?: string
  messageSid?: string
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_ENDPOINT !== 'true') {
    console.error('Blocked test endpoint in production')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (process.env.WHATSAPP_DEV_MODE !== 'true') {
    return NextResponse.json(
      { error: 'WhatsApp test endpoint is available only when WHATSAPP_DEV_MODE=true' },
      { status: 403 }
    )
  }

  let payload: TestInboundPayload

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const from = String(payload.from ?? '').trim()
  const body = String(payload.body ?? '').trim()
  const originalRepliedSid = String(payload.originalRepliedSid ?? '').trim()
  const messageSid = String(payload.messageSid ?? `mock_inbound_${Date.now()}`).trim()

  if (!from || !body) {
    return NextResponse.json({ error: 'Both from and body are required' }, { status: 400 })
  }

  const formData = new URLSearchParams()
  formData.set('From', from)
  formData.set('Body', body)
  if (originalRepliedSid) formData.set('OriginalRepliedMessageSid', originalRepliedSid)
  if (messageSid) formData.set('MessageSid', messageSid)

  console.info('[WHATSAPP TEST INBOUND]', {
    mocked: true,
    from,
    body,
    originalRepliedSid: originalRepliedSid || null,
    messageSid,
  })

  const simulatedRequest = new NextRequest(new Request('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  }))

  return webhookPost(simulatedRequest)
}
