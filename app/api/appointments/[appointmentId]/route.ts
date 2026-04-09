import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { canUpdateAppointmentStatus, normalizeClinicRole } from '@/lib/auth/permissions'

const VALID_STATUSES = [
  'scheduled',
  'confirmation_pending',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
] as const

type AppointmentStatus = (typeof VALID_STATUSES)[number]

// Valid status transitions: from current status -> allowed next statuses
const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['confirmation_pending', 'in_progress', 'cancelled', 'no_show', 'rescheduled'],
  confirmation_pending: ['confirmed', 'scheduled', 'cancelled', 'no_show', 'rescheduled'],
  confirmed: ['in_progress', 'cancelled', 'no_show', 'rescheduled'],
  in_progress: ['completed', 'cancelled', 'no_show'],
  completed: [], // terminal state: no transitions allowed
  cancelled: [], // terminal state
  no_show: [], // terminal state
  rescheduled: [], // terminal state (set by system only)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

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
      where: { userId, isActive: true },
    })

    if (!membership) {
      return NextResponse.json({ error: 'No clinic access' }, { status: 403 })
    }

    const role = normalizeClinicRole(membership.role)
    if (!canUpdateAppointmentStatus(role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { appointmentId } = await params

    const body = await request.json().catch(() => null)
    const status = body?.status

    if (typeof status !== 'string' || !VALID_STATUSES.includes(status as AppointmentStatus)) {
      return NextResponse.json({ error: 'Invalid appointment status' }, { status: 400 })
    }

    const validStatus = status as AppointmentStatus

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        clinicId: membership.clinicId,
      },
    })

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    const currentStatus = appointment.status as AppointmentStatus
    const validNextStatuses = VALID_TRANSITIONS[currentStatus]
    if (!validNextStatuses.includes(validStatus)) {
      return NextResponse.json(
        {
          error: `Cannot transition from ${currentStatus} to ${validStatus}. Valid transitions: ${validNextStatuses.join(', ') || 'none (terminal state)'}`,
        },
        { status: 400 }
      )
    }

    // When marking as rescheduled, cancel all pending/queued notification jobs for this appointment
    if (validStatus === 'rescheduled') {
      await prisma.notificationJob.updateMany({
        where: {
          appointmentId,
          status: {
            in: ['pending', 'queued'],
          },
        },
        data: {
          status: 'failed',
          errorMessage: 'Appointment was rescheduled. This job is no longer valid.',
        },
      })
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: validStatus,
        confirmedAt: validStatus === 'confirmed' ? new Date() : appointment.confirmedAt,
      },
    })

    return NextResponse.json(updatedAppointment)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update appointment status.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}