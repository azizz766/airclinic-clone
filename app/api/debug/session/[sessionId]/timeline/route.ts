import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params

  const session = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
    select: { id: true },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
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
