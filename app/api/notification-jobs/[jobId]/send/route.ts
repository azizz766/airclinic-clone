import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { canRetryNotificationJob, normalizeClinicRole } from '@/lib/auth/permissions'
import { sendWhatsAppNotificationJob } from '@/lib/notifications/send-whatsapp-job'

interface SendNotificationJobRouteContext {
  params: Promise<{
    jobId: string
  }>
}

export async function POST(_request: NextRequest, context: SendNotificationJobRouteContext) {
  const { jobId } = await context.params

  if (!jobId) {
    return NextResponse.json({ error: 'Notification job id is required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const email = session.user.email ?? ''

  await prisma.user.upsert({
    where: { id: userId },
    update: { email },
    create: {
      id: userId,
      email,
      passwordHash: '',
    },
  })

  const targetJob = await prisma.notificationJob.findUnique({
    where: { id: jobId },
    select: { id: true, clinicId: true },
  })

  if (!targetJob) {
    return NextResponse.json({ error: 'Notification job not found.' }, { status: 404 })
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      clinicId: targetJob.clinicId,
      isActive: true,
    },
  })

  if (!membership) {
    return NextResponse.json({ error: 'No clinic access' }, { status: 403 })
  }

  const role = normalizeClinicRole(membership.role)
  if (!canRetryNotificationJob(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const result = await sendWhatsAppNotificationJob({
    clinicId: targetJob.clinicId,
    notificationJobId: jobId,
  })

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: result.status,
        error: result.error,
      },
      { status: 400 }
    )
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    providerMessageId: result.providerMessageId,
  })
}
