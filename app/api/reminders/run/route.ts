import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendDueWhatsAppNotificationsForClinic } from '@/lib/notifications/send-whatsapp-job'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return ''
  }
  return authHeader.slice(7).trim()
}

function isAuthorized(token: string) {
  if (!token) return false
  const reminderSecret = process.env.REMINDER_CRON_SECRET?.trim() ?? ''
  const cronSecret = process.env.CRON_SECRET?.trim() ?? ''

  const allowed = [reminderSecret, cronSecret].filter((value) => value.length > 0)
  if (allowed.length === 0) {
    return null
  }

  return allowed.includes(token)
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'reminder-cron',
    message: 'Use POST with Bearer token to trigger',
  })
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request)
  const authState = isAuthorized(token)

  if (authState === null) {
    return NextResponse.json(
      { error: 'Neither CRON_SECRET nor REMINDER_CRON_SECRET is configured.' },
      { status: 500 }
    )
  }

  if (!authState) {
    return unauthorized()
  }

  const startedAt = Date.now()
  const url = new URL(request.url)
  const clinicId = url.searchParams.get('clinicId')?.trim() ?? ''

  const targetClinicIds = clinicId
    ? [clinicId]
    : (await prisma.clinic.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })).map((clinic) => clinic.id)

  await prisma.escalationLog.create({
    data: {
      clinicId: clinicId || 'system',
      entityType: 'system',
      entityId: clinicId || 'all-clinics',
      eventType: 'cron_reminder_run',
      severity: 'info',
      message: 'Reminder cron run started.',
      metadata: {
        trigger: 'cron',
        phase: 'start',
        jobsProcessed: 0,
        jobsFailed: 0,
        duration: 0,
        requestedClinicId: clinicId || null,
        clinicsTargeted: targetClinicIds.length,
      },
    },
  })

  const results: Array<{ clinicId: string; total: number; sent: number; failed: number }> = []
  const clinicErrors: Array<{ clinicId: string; error: string }> = []
  let jobsSent = 0
  let jobsFailed = 0

  for (const id of targetClinicIds) {
    try {
      const result = await sendDueWhatsAppNotificationsForClinic({
        clinicId: id,
        limit: 50,
      })

      results.push({ clinicId: id, ...result })
      jobsSent += result.sent
      jobsFailed += result.failed
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown clinic processing failure.'
      clinicErrors.push({ clinicId: id, error: message })
    }
  }

  const durationMs = Date.now() - startedAt
  const jobsProcessed = jobsSent + jobsFailed

  await prisma.escalationLog.create({
    data: {
      clinicId: clinicId || 'system',
      entityType: 'system',
      entityId: clinicId || 'all-clinics',
      eventType: 'cron_reminder_run',
      severity: 'info',
      message: 'Reminder cron run completed.',
      metadata: {
        trigger: 'cron',
        phase: 'end',
        requestedClinicId: clinicId || null,
        clinicsProcessed: results.length,
        clinicsFailed: clinicErrors.length,
        jobsProcessed,
        jobsFailed,
        duration: durationMs,
      },
    },
  })

  return NextResponse.json({
    success: clinicErrors.length === 0,
    clinicsProcessed: results.length,
    jobsSent,
    jobsFailed,
    durationMs,
  })
}
