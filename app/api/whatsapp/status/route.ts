import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyTwilioSignature } from '@/lib/whatsapp/verify-twilio-signature'

// Twilio status values sent for WhatsApp messages
type TwilioMessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'undelivered'
  | 'failed'

async function applyStatusUpdate(
  messageSid: string,
  messageStatus: TwilioMessageStatus,
  errorCode: string | null,
  errorMessage: string | null
) {
  const now = new Date()
  const isFailed = messageStatus === 'failed' || messageStatus === 'undelivered'

  // Update Message row by externalId (covers inbound messages + persisted outbound messages)
  if (messageStatus === 'delivered') {
    // Only advance to delivered if not already at a higher state (read)
    await prisma.message.updateMany({
      where: { externalId: messageSid, status: { not: 'read' } },
      data: { status: 'delivered', deliveredAt: now },
    })
  } else if (messageStatus === 'read') {
    await prisma.message.updateMany({
      where: { externalId: messageSid },
      data: { status: 'read', readAt: now },
    })
    // WhatsApp may skip delivered → read. Backfill deliveredAt for rows missing it.
    await prisma.message.updateMany({
      where: { externalId: messageSid, deliveredAt: null },
      data: { deliveredAt: now },
    })
  } else if (isFailed) {
    await prisma.message.updateMany({
      where: { externalId: messageSid },
      data: { status: 'failed' },
    })
  }

  // On delivery failure, update NotificationJob that was sent with this SID
  if (isFailed) {
    const failureNote = [errorCode, errorMessage].filter(Boolean).join(': ') || 'Twilio delivery failure'
    await prisma.notificationJob.updateMany({
      where: { providerMessageId: messageSid, status: 'sent' },
      data: { status: 'failed', errorMessage: failureNote },
    })
  }
}

export async function POST(request: NextRequest) {
  const isDevMode = process.env.WHATSAPP_DEV_MODE === 'true'

  const rawBody = await request.text()

  if (!isDevMode) {
    if (!verifyTwilioSignature(request, rawBody)) {
      console.error('[whatsapp-status] rejected: invalid signature')
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  const params = new URLSearchParams(rawBody)
  const messageSid = params.get('MessageSid') ?? ''
  const messageStatus = (params.get('MessageStatus') ?? '') as TwilioMessageStatus
  const to = params.get('To') ?? ''
  const from = params.get('From') ?? ''
  const errorCode = params.get('ErrorCode') || null
  const errorMessage = params.get('ErrorMessage') || null

  console.log('[whatsapp-status] received', { messageSid, messageStatus, to, from, errorCode })

  if (!messageSid || !messageStatus) {
    // Malformed callback — still return 200 so Twilio does not retry
    console.warn('[whatsapp-status] missing-params', { messageSid, messageStatus })
    return new NextResponse(null, { status: 200 })
  }

  try {
    await applyStatusUpdate(messageSid, messageStatus, errorCode, errorMessage)
  } catch (error) {
    console.error('[whatsapp-status] update-failed', {
      error,
      messageSid,
      messageStatus,
    })
    // Still return 200 — the failure is internal, no point asking Twilio to retry a status callback
  }

  return new NextResponse(null, { status: 200 })
}
