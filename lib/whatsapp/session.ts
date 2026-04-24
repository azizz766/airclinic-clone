import { prisma } from '@/lib/prisma'
import { Prisma } from '@/lib/prisma-client/client'
import { ConversationState } from '@/lib/prisma-client/enums'
import { transition, isTerminal } from './fsm'

export async function resolveSession(phoneNumber: string, clinicId: string) {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

  const existing = await prisma.conversationSession.findUnique({
    where: { phoneNumber_clinicId: { phoneNumber, clinicId } },
  })

  if (existing && !isTerminal(existing.currentState)) {
    return existing
  }

  if (existing) {
    if (existing.slotTimeId) {
      await prisma.availableSlot.updateMany({
        where: { id: existing.slotTimeId, isBooked: false },
        data: { isHeld: false, heldBySessionId: null, heldAt: null },
      })
    }

    const updated = await prisma.conversationSession.update({
      where: { id: existing.id },
      data: {
        currentState: 'IDLE',
        previousState: existing.currentState,
        detectedLanguage: 'UNKNOWN',
        expiresAt,
        resolvedAt: null,
        retryCount: 0,
        invalidInputCount: 0,
        slotServiceId: null,
        slotDate: null,
        slotTimeId: null,
        slotPatientName: null,
        slotPatientDob: null,
        slotPhoneConfirmed: null,
        bookingId: null,
        handoffActive: false,
        escalationReason: null,
        escalationClaimedBy: null,
        escalationClaimedAt: null,
        ambiguousIntents: Prisma.JsonNull,
      },
    })

    await prisma.stateTransitionLog.create({
      data: {
        sessionId: updated.id,
        clinicId,
        fromState: existing.currentState,
        toState: 'IDLE',
        triggerType: 'SESSION_RESET',
      },
    })

    return updated
  }

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

  let nextState: ConversationState

  try {
    nextState = transition(session.currentState, triggerType)
  } catch {
    await prisma.stateTransitionLog.create({
      data: {
        sessionId,
        clinicId,
        fromState: session.currentState,
        toState: session.currentState,
        triggerType: 'INVALID_' + triggerType,
        triggeredBy: triggeredBy ?? null,
      },
    })

    return session
  }

  const updatedSession = await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      previousState: session.currentState,
      currentState: nextState,
      retryCount: 0,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      resolvedAt: isTerminal(nextState) ? new Date() : undefined,
    },
  })

  await prisma.stateTransitionLog.create({
    data: {
      sessionId,
      clinicId,
      fromState: session.currentState,
      toState: nextState,
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
    select: { retryCount: true },
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
  return prisma.conversationMessage.create({
    data: {
      sessionId: params.sessionId,
      clinicId: params.clinicId,
      role: params.role,
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
  })
}