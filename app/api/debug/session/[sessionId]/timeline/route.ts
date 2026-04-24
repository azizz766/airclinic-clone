import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { normalizeClinicRole, canRetryNotificationJob } from '@/lib/auth/permissions'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient()
  const { data: { session: authSession } } = await supabase.auth.getSession()

  if (!authSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sessionId } = await params

  const session = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
    select: { id: true, clinicId: true },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: authSession.user.id,
      clinicId: session.clinicId,
      isActive: true,
    },
    select: { role: true },
  })

  if (!membership || !canRetryNotificationJob(normalizeClinicRole(membership.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const logs = await prisma.stateTransitionLog.findMany({
    where: { sessionId },
    select: {
      fromState: true,
      toState: true,
      triggerType: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({
    sessionId,
    timeline: logs.map((l) => ({
      fromState: l.fromState,
      toState: l.toState,
      triggerType: l.triggerType,
      createdAt: l.createdAt.toISOString(),
    })),
  })
}
