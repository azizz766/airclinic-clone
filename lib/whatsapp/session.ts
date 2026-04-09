import { prisma } from '@/lib/prisma'
import { ConversationState, DetectedLanguage } from '@/lib/prisma-client/enums'

const TERMINAL_STATES: ConversationState[] = [
  'BOOKING_CONFIRMED',
  'CANCELLATION_CONFIRMED',
  'BOOKING_FAILED',
  'EXPIRED',
  'CORRUPTED',
]

export async function resolveSession(phoneNumber: string, clinicId: string) {
  const existing = await prisma.conversationSession.findUnique({
    where: { phoneNumber_clinicId: { phoneNumber, clinicId } },
  })

  if (existing && !TERMINAL_STATES.includes(existing.currentState)) {
    return existing
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

  const session = await prisma.conversationSession.create({
    data: {
      clinicId,
      phoneNumber,
      currentState: 'IDLE',
      detectedLanguage: 'UNKNOWN',
      expiresAt,
    },
  })

  await prisma.stateTransitionLog.create({
    data: {
      sessionId: session.id,
      clinicId,
      fromState: 'IDLE',
      toState: 'IDLE',
      triggerType: 'SESSION_CREATED',
    },
  })

  return session
}

export async function transitionSession(
  sessionId: string,
  clinicId: string,
  toState: ConversationState,
  triggerType: string,
  triggeredBy?: string
) {
  const session = await prisma.conversationSession.findUniqueOrThrow({
    where: { id: sessionId },
  })

  const updatedSession = await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      previousState: session.currentState,
      currentState: toState,
      retryCount: 0,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      resolvedAt: TERMINAL_STATES.includes(toState) ? new Date() : undefined,
    },
  })

  await prisma.stateTransitionLog.create({
    data: {
      sessionId,
      clinicId,
      fromState: session.currentState,
      toState,
      triggerType,
      triggeredBy: triggeredBy ?? null,
    },
  })

  return updatedSession
}

export async function incrementRetry(sessionId: string): Promise<number> {
  const updated = await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      retryCount: { increment: 1 },
      invalidInputCount: { increment: 1 },
    },
    select: { retryCount: true, maxRetriesPerState: true },
  })
  return updated.retryCount
}

export async function persistMessage(params: {
  sessionId: string
  clinicId: string
  role: 'patient' | 'assistant' | 'system'
  channel: 'whatsapp' | 'web'
  content: string
  currentState: ConversationState
  twilioMessageSid?: string
  claudeModel?: string
  claudeInputTokens?: number
  claudeOutputTokens?: number
}) {
  const roleMap = {
    patient: 'patient',
    assistant: 'assistant',
    system: 'system',
  } as const

  return prisma.conversationMessage.create({
    data: {
      sessionId: params.sessionId,
      clinicId: params.clinicId,
      role: roleMap[params.role],
      channel: params.channel === 'whatsapp' ? 'whatsapp' : 'web',
      content: params.content,
      contentNormalized: params.content.toLowerCase().trim(),
      twilioMessageSid: params.twilioMessageSid ?? null,
      claudeModel: params.claudeModel ?? null,
      claudeInputTokens: params.claudeInputTokens ?? null,
      claudeOutputTokens: params.claudeOutputTokens ?? null,
      sessionStateAtSend: params.currentState,
    },
  })
}

export async function getMessageHistory(sessionId: string) {
  return prisma.conversationMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      content: true,
      sessionStateAtSend: true,
      createdAt: true,
    },
  })
}
