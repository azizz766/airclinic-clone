import { prisma } from '@/lib/prisma'

export async function ensureConversation(params: {
  clinicId: string
  patientId: string
  channel: 'whatsapp'
  externalId: string
}) {
  const now = new Date()

  const existing = await prisma.conversation.findFirst({
    where: {
      clinicId: params.clinicId,
      patientId: params.patientId,
      channel: params.channel,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  })

  if (existing) {
    return prisma.conversation.update({
      where: {
        id: existing.id,
      },
      data: {
        lastMessageAt: now,
        externalId: params.externalId,
      },
    })
  }

  return prisma.conversation.create({
    data: {
      clinicId: params.clinicId,
      patientId: params.patientId,
      channel: params.channel,
      externalId: params.externalId,
      lastMessageAt: now,
    },
  })
}

export async function persistInboundMessage(params: {
  conversationId: string
  content: string
  externalId: string | null
  senderType: 'patient'
}) {
  const externalId = params.externalId?.trim() || null

  if (externalId) {
    const existing = await prisma.message.findFirst({
      where: {
        externalId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (existing) {
      return existing
    }
  }

  return prisma.message.create({
    data: {
      conversationId: params.conversationId,
      senderType: params.senderType,
      content: params.content,
      messageType: 'text',
      status: 'sent',
      sentAt: new Date(),
      externalId,
    },
  })
}

export async function persistOutboundMessage(params: {
  clinicId: string
  patientId: string
  patientPhone: string
  content: string
  externalId: string | null
}) {
  const externalId = params.externalId?.trim() || null

  if (externalId) {
    const existing = await prisma.message.findFirst({
      where: { externalId },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) return existing
  }

  const conversation = await ensureConversation({
    clinicId: params.clinicId,
    patientId: params.patientId,
    channel: 'whatsapp',
    externalId: params.patientPhone,
  })

  return prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderType: 'clinic',
      content: params.content,
      messageType: 'text',
      status: 'sent',
      sentAt: new Date(),
      externalId,
    },
  })
}
