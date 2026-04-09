import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { canRetryNotificationJob, normalizeClinicRole } from '@/lib/auth/permissions'
import { sendWhatsAppNotificationJob } from '@/lib/notifications/send-whatsapp-job'

type RetryRouteContext = {
  params: Promise<{
    clinicId: string
    jobId: string
  }>
}

function isInvalidatedJob(errorMessage: string | null) {
  if (!errorMessage) return false
  return errorMessage.toLowerCase().includes('no longer valid')
}

export async function POST(_request: Request, context: RetryRouteContext) {
  const { clinicId, jobId } = await context.params

  if (!clinicId || !jobId) {
    return NextResponse.json({ error: 'Clinic id and job id are required.' }, { status: 400 })
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

  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      clinicId,
      isActive: true,
    },
    select: {
      role: true,
    },
  })

  if (!membership) {
    return NextResponse.json({ error: 'Notification job not found.' }, { status: 404 })
  }

  const role = normalizeClinicRole(membership.role)
  if (!canRetryNotificationJob(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const job = await prisma.notificationJob.findFirst({
    where: {
      id: jobId,
      clinicId,
    },
    select: {
      id: true,
      status: true,
      channel: true,
      errorMessage: true,
      appointmentId: true,
      patientId: true,
      destination: true,
    },
  })

  if (!job) {
    return NextResponse.json({ error: 'Notification job not found.' }, { status: 404 })
  }

  if (job.channel !== 'whatsapp') {
    return NextResponse.json({ error: 'Only WhatsApp jobs are retryable from this action.' }, { status: 400 })
  }

  if (job.status !== 'failed') {
    return NextResponse.json({ error: `Only failed jobs can be retried. Current status: ${job.status}.` }, { status: 400 })
  }

  if (isInvalidatedJob(job.errorMessage)) {
    return NextResponse.json({ error: 'Invalidated jobs cannot be retried.' }, { status: 400 })
  }

  await prisma.notificationJob.updateMany({
    where: {
      id: job.id,
      clinicId,
      status: 'failed',
    },
    data: {
      status: 'pending',
      errorMessage: null,
      provider: null,
      providerMessageId: null,
      sentAt: null,
    },
  })

  const sendResult = await sendWhatsAppNotificationJob({
    clinicId,
    notificationJobId: job.id,
  })

  if (!sendResult.ok) {
    await prisma.escalationLog.create({
      data: {
        clinicId,
        entityType: 'appointment',
        entityId: job.appointmentId,
        eventType: 'whatsapp_operator_notification_retry',
        severity: 'warning',
        message: 'Operator retried failed WhatsApp notification job and dispatch failed.',
        userId,
        metadata: {
          actorUserId: userId,
          notificationJobId: job.id,
          appointmentId: job.appointmentId,
          patientId: job.patientId,
          destination: job.destination,
          channel: job.channel,
          dispatchOk: false,
          dispatchStatus: sendResult.status,
          error: sendResult.error,
        },
      },
    })

    return NextResponse.json(
      {
        ok: false,
        status: sendResult.status,
        error: sendResult.error,
      },
      { status: 400 }
    )
  }

  await prisma.escalationLog.create({
    data: {
      clinicId,
      entityType: 'appointment',
      entityId: job.appointmentId,
      eventType: 'whatsapp_operator_notification_retry',
      severity: 'info',
      message: 'Operator retried failed WhatsApp notification job successfully.',
      userId,
      metadata: {
        actorUserId: userId,
        notificationJobId: job.id,
        appointmentId: job.appointmentId,
        patientId: job.patientId,
        destination: job.destination,
        channel: job.channel,
        dispatchOk: true,
        dispatchStatus: sendResult.status,
        providerMessageId: sendResult.providerMessageId,
      },
    },
  })

  return NextResponse.json({
    ok: true,
    status: sendResult.status,
    providerMessageId: sendResult.providerMessageId,
  })
}
