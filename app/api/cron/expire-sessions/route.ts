import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const TERMINAL_STATES = [
  'BOOKING_CONFIRMED',
  'CANCELLATION_CONFIRMED',
  'BOOKING_FAILED',
  'EXPIRED',
  'CORRUPTED',
]

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const now = new Date()

  const expiredSessions = await prisma.conversationSession.findMany({
    where: {
      expiresAt: { lt: now },
      currentState: { notIn: TERMINAL_STATES as any },
    },
    select: {
      id: true,
      clinicId: true,
      phoneNumber: true,
      currentState: true,
      slotTimeId: true,
    },
  })

  let resolved = 0
  let failed = 0

  for (const session of expiredSessions) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.conversationSession.update({
          where: { id: session.id },
          data: {
            previousState: session.currentState,
            currentState: 'EXPIRED',
            resolvedAt: now,
          },
        })

        await tx.stateTransitionLog.create({
          data: {
            sessionId: session.id,
            clinicId: session.clinicId,
            fromState: session.currentState,
            toState: 'EXPIRED',
            triggerType: 'TIMEOUT',
          },
        })

        if (session.slotTimeId) {
          await tx.availableSlot.update({
            where: { id: session.slotTimeId },
            data: {
              isHeld: false,
              heldBySessionId: null,
              heldAt: null,
            },
          })
        }
      })

      resolved++
    } catch (err) {
      console.error('[expire-sessions] failed to expire session', {
        sessionId: session.id,
        error: err,
      })
      failed++
    }
  }

  return NextResponse.json({ resolved, failed, total: expiredSessions.length })
}
