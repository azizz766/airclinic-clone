import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/lib/prisma-client/client'

type ReleaseAction = 'release' | 'close'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { session: authSession } } = await supabase.auth.getSession()

    if (!authSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = authSession.user.id
    const email = authSession.user.email ?? ''

    await prisma.user.upsert({
      where: { id: userId },
      update: { email },
      create: { id: userId, email, passwordHash: '' },
    })

    // ── Parse body ──────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const action: ReleaseAction = body.action === 'close' ? 'close' : 'release'

    // ── Load session ────────────────────────────────────────────────────────
    const { sessionId } = await params

    const convSession = await prisma.conversationSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        clinicId: true,
        currentState: true,
        handoffActive: true,
      },
    })

    if (!convSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // ── Membership check ────────────────────────────────────────────────────
    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        clinicId: convSession.clinicId,
        isActive: true,
      },
      select: { role: true },
    })

    if (!membership) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (!convSession.handoffActive) {
      return NextResponse.json(
        { error: 'Session is not in handoff state' },
        { status: 400 },
      )
    }

    const fromState = convSession.currentState

    if (action === 'release') {
      // Release back to AI — reset to IDLE, clear stale slot state
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: {
          handoffActive: false,
          currentState: 'IDLE',
          previousState: fromState,
          retryCount: 0,
          invalidInputCount: 0,
          slotServiceId: null,
          slotDate: null,
          slotTimeId: null,
          slotPatientName: null,
          slotPatientDob: null,
          slotPhoneConfirmed: null,
          slotOfferedAt: null,
          ambiguousIntents: Prisma.JsonNull,
          escalationReason: null,
          escalationClaimedBy: null,
          escalationClaimedAt: null,
          resolvedAt: null,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      })

      await prisma.stateTransitionLog.create({
        data: {
          sessionId,
          clinicId: convSession.clinicId,
          fromState,
          toState: 'IDLE',
          triggerType: 'STAFF_RELEASE',
          triggeredBy: userId,
        },
      })

      await prisma.escalationLog.create({
        data: {
          clinicId: convSession.clinicId,
          entityType: 'conversation',
          entityId: sessionId,
          eventType: 'handoff_released_to_ai',
          severity: 'info',
          message: 'Staff released conversation back to AI.',
          userId,
          metadata: { fromState, action: 'release' },
        },
      })

      return NextResponse.json({ ok: true, action: 'release', state: 'IDLE' })
    }

    // action === 'close' — mark as resolved, patient starts fresh next message
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        handoffActive: false,
        currentState: 'EXPIRED',
        previousState: fromState,
        resolvedAt: new Date(),
        escalationClaimedBy: userId,
        escalationClaimedAt: new Date(),
      },
    })

    await prisma.stateTransitionLog.create({
      data: {
        sessionId,
        clinicId: convSession.clinicId,
        fromState,
        toState: 'EXPIRED',
        triggerType: 'STAFF_CLOSE',
        triggeredBy: userId,
      },
    })

    await prisma.escalationLog.create({
      data: {
        clinicId: convSession.clinicId,
        entityType: 'conversation',
        entityId: sessionId,
        eventType: 'handoff_closed_by_staff',
        severity: 'info',
        message: 'Staff closed conversation thread.',
        userId,
        metadata: { fromState, action: 'close' },
      },
    })

    return NextResponse.json({ ok: true, action: 'close', state: 'EXPIRED' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
