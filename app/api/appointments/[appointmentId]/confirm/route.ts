import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { canConfirmAppointment, normalizeClinicRole } from '@/lib/auth/permissions'

function normalizePhone(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, '')
  return trimmed.length > 0 ? trimmed : null
}

export async function POST(
  _request: Request,
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

    const { appointmentId } = await params

    const appointment = await prisma.appointment.findUnique({
      where: {
        id: appointmentId,
      },
      select: {
        id: true,
        clinicId: true,
        status: true,
        confirmedAt: true,
        patient: {
          select: {
            id: true,
            phone: true,
          },
        },
      },
    })

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        clinicId: appointment.clinicId,
        isActive: true,
      },
      select: {
        role: true,
      },
    })

    if (!membership) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    const role = normalizeClinicRole(membership.role)
    if (!canConfirmAppointment(role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    if (appointment.status === 'confirmed') {
      const result = appointment.confirmedAt
        ? appointment
        : await prisma.appointment.update({
            where: { id: appointment.id },
            data: { confirmedAt: new Date() },
            select: { id: true, status: true, confirmedAt: true },
          })

      await prisma.escalationLog.create({
        data: {
          clinicId: appointment.clinicId,
          entityType: 'appointment',
          entityId: appointment.id,
          eventType: 'whatsapp_operator_appointment_confirm',
          severity: 'info',
          message: 'Operator confirmed appointment from inbox.',
          userId,
          metadata: {
            actorUserId: userId,
            appointmentId: appointment.id,
            patientId: appointment.patient.id,
            phoneNormalized: normalizePhone(appointment.patient.phone),
            actionResult: appointment.confirmedAt ? 'already_confirmed_noop' : 'already_confirmed_set_timestamp',
          },
        },
      })

      return NextResponse.json(result)
    }

    if (appointment.status !== 'scheduled' && appointment.status !== 'confirmation_pending') {
      return NextResponse.json(
        { error: `Cannot confirm appointment from status: ${appointment.status}` },
        { status: 400 }
      )
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'confirmed',
        confirmedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        confirmedAt: true,
      },
    })

    await prisma.escalationLog.create({
      data: {
        clinicId: appointment.clinicId,
        entityType: 'appointment',
        entityId: appointment.id,
        eventType: 'whatsapp_operator_appointment_confirm',
        severity: 'info',
        message: 'Operator confirmed appointment from inbox.',
        userId,
        metadata: {
          actorUserId: userId,
          appointmentId: appointment.id,
          patientId: appointment.patient.id,
          phoneNormalized: normalizePhone(appointment.patient.phone),
          actionResult: 'status_updated',
        },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to confirm appointment.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
