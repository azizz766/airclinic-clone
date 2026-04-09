import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { canRescheduleAppointment, normalizeClinicRole } from '@/lib/auth/permissions'
import { isDateWithinDoctorAvailability } from '@/lib/doctor-availability'
import { regenerateAppointmentReminderJobs } from '@/lib/notifications/reminder-jobs'
import { sendWhatsAppNotificationJob } from '@/lib/notifications/send-whatsapp-job'

function normalizePhone(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, '')
  return trimmed.length > 0 ? trimmed : null
}

export async function POST(
  request: Request,
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
      where: { id: appointmentId },
      select: {
        id: true,
        clinicId: true,
        clinic: {
          select: {
            name: true,
          },
        },
        doctorId: true,
        durationMinutes: true,
        status: true,
        scheduledAt: true,
        notes: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        doctor: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        service: {
          select: {
            name: true,
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
    if (!canRescheduleAppointment(role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    if (
      appointment.status !== 'scheduled'
      && appointment.status !== 'confirmation_pending'
      && appointment.status !== 'confirmed'
    ) {
      return NextResponse.json(
        { error: `Cannot reschedule appointment from status: ${appointment.status}` },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => null)
    const scheduledAtRaw = body?.scheduledAt

    if (typeof scheduledAtRaw !== 'string' || !scheduledAtRaw.trim()) {
      return NextResponse.json({ error: 'New appointment date/time required' }, { status: 400 })
    }

    const newScheduledAt = new Date(scheduledAtRaw)
    if (Number.isNaN(newScheduledAt.getTime())) {
      return NextResponse.json({ error: 'Invalid appointment date/time' }, { status: 400 })
    }

    if (newScheduledAt.getTime() === appointment.scheduledAt.getTime()) {
      return NextResponse.json({ error: 'Please select a different time slot' }, { status: 400 })
    }

    const doctor = await prisma.doctor.findFirst({
      where: {
        id: appointment.doctorId,
        clinicId: appointment.clinicId,
        isActive: true,
      },
      select: {
        id: true,
        availabilitySchedule: true,
      },
    })

    if (!doctor) {
      return NextResponse.json({ error: 'Doctor not found for this clinic' }, { status: 400 })
    }

    const withinAvailability = isDateWithinDoctorAvailability(
      newScheduledAt,
      appointment.durationMinutes,
      doctor.availabilitySchedule
    )

    if (!withinAvailability) {
      return NextResponse.json(
        { error: 'Selected doctor is not working at this date/time.' },
        { status: 409 }
      )
    }

    const newEnd = new Date(newScheduledAt.getTime() + appointment.durationMinutes * 60000)

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        clinicId: appointment.clinicId,
        doctorId: appointment.doctorId,
        id: {
          not: appointment.id,
        },
        status: {
          notIn: ['cancelled', 'rescheduled'],
        },
        scheduledAt: {
          lt: newEnd,
        },
      },
      select: {
        scheduledAt: true,
        durationMinutes: true,
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    })

    const hasOverlap = existingAppointments.some((existing) => {
      const existingEnd = new Date(existing.scheduledAt.getTime() + existing.durationMinutes * 60000)
      return newScheduledAt < existingEnd && newEnd > existing.scheduledAt
    })

    if (hasOverlap) {
      return NextResponse.json(
        { error: 'This time overlaps an existing appointment for the selected doctor.' },
        { status: 409 }
      )
    }

    const appointmentData = appointment
    const previousScheduledAt = appointmentData.scheduledAt
    const patientPhone = normalizePhone(appointmentData.patient.phone)

    let confirmationWhatsAppJobId: string | null = null
    let regeneratedReminderJobCount = 0
    let invalidatedNotificationJobCount = 0

    const updated = await prisma.$transaction(async (tx) => {
      const invalidatedJobs = await tx.notificationJob.updateMany({
        where: {
          appointmentId: appointmentData.id,
          status: {
            in: ['pending', 'queued'],
          },
        },
        data: {
          status: 'failed',
          errorMessage: 'Appointment was rescheduled from inbox. This job is no longer valid.',
        },
      })
      invalidatedNotificationJobCount = invalidatedJobs.count

      const updatedAppointment = await tx.appointment.update({
        where: { id: appointmentData.id },
        data: {
          scheduledAt: newScheduledAt,
          status: 'scheduled',
          confirmedAt: null,
          notes: appointmentData.notes
            ? `${appointmentData.notes}\n[Inbox Reschedule] ${previousScheduledAt.toISOString()} -> ${newScheduledAt.toISOString()}`
            : `[Inbox Reschedule] ${previousScheduledAt.toISOString()} -> ${newScheduledAt.toISOString()}`,
        },
        select: {
          id: true,
          scheduledAt: true,
          status: true,
        },
      })

      const reminderGeneration = await regenerateAppointmentReminderJobs(tx, {
        clinicId: appointmentData.clinicId,
        clinic: {
          name: appointmentData.clinic?.name ?? null,
        },
        appointmentId: updatedAppointment.id,
        appointmentScheduledAt: updatedAppointment.scheduledAt,
        patient: appointmentData.patient,
        doctor: appointmentData.doctor,
        service: appointmentData.service,
        includeImmediateConfirmation: true,
      })

      confirmationWhatsAppJobId = reminderGeneration.confirmationWhatsAppJobId
      regeneratedReminderJobCount = reminderGeneration.generatedJobs.length

      await tx.escalationLog.create({
        data: {
          clinicId: appointmentData.clinicId,
          entityType: 'appointment',
          entityId: appointmentData.id,
          eventType: 'whatsapp_operator_appointment_reschedule',
          severity: 'info',
          message: 'Operator rescheduled appointment from inbox.',
          userId,
          metadata: {
            actorUserId: userId,
            appointmentId: appointmentData.id,
            patientId: appointmentData.patient.id,
            phoneNormalized: patientPhone,
            previousScheduledAt: previousScheduledAt.toISOString(),
            newScheduledAt: updatedAppointment.scheduledAt.toISOString(),
            invalidatedNotificationJobCount,
            regeneratedReminderJobCount,
            confirmationWhatsAppJobId,
          },
        },
      })

      await tx.escalationLog.create({
        data: {
          clinicId: appointmentData.clinicId,
          entityType: 'appointment',
          entityId: appointmentData.id,
          eventType: 'whatsapp_reschedule_reminders_regenerated',
          severity: 'info',
          message: 'Reminder jobs regenerated after reschedule.',
          userId,
          metadata: {
            actorUserId: userId,
            appointmentId: appointmentData.id,
            patientId: appointmentData.patient.id,
            phoneNormalized: patientPhone,
            regeneratedReminderJobCount,
            confirmationWhatsAppJobId,
            generatedJobs: reminderGeneration.generatedJobs,
          },
        },
      })

      return updatedAppointment
    })

    if (confirmationWhatsAppJobId) {
      try {
        const sendResult = await sendWhatsAppNotificationJob({
          clinicId: appointmentData.clinicId,
          notificationJobId: confirmationWhatsAppJobId,
        })

        await prisma.escalationLog.create({
          data: {
            clinicId: appointmentData.clinicId,
            entityType: 'appointment',
            entityId: appointmentData.id,
            eventType: 'whatsapp_reschedule_confirmation_dispatch',
            severity: sendResult.ok ? 'info' : 'warning',
            message: sendResult.ok
              ? 'Reschedule confirmation WhatsApp dispatched.'
              : 'Reschedule confirmation WhatsApp dispatch failed.',
            userId,
            metadata: {
              actorUserId: userId,
              appointmentId: appointmentData.id,
              patientId: appointmentData.patient.id,
              phoneNormalized: patientPhone,
              confirmationWhatsAppJobId,
              dispatchOk: sendResult.ok,
              dispatchStatus: sendResult.status,
              providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
              error: sendResult.ok ? null : sendResult.error,
              regeneratedReminderJobCount,
              invalidatedNotificationJobCount,
            },
          },
        })
      } catch (sendError) {
        await prisma.escalationLog.create({
          data: {
            clinicId: appointmentData.clinicId,
            entityType: 'appointment',
            entityId: appointmentData.id,
            eventType: 'whatsapp_reschedule_confirmation_dispatch',
            severity: 'error',
            message: 'Reschedule confirmation WhatsApp dispatch failed with exception.',
            userId,
            metadata: {
              actorUserId: userId,
              appointmentId: appointmentData.id,
              patientId: appointmentData.patient.id,
              phoneNormalized: patientPhone,
              confirmationWhatsAppJobId,
              dispatchOk: false,
              error: sendError instanceof Error ? sendError.message : String(sendError),
              regeneratedReminderJobCount,
              invalidatedNotificationJobCount,
            },
          },
        })

        console.error('[SEND FAILURE]', {
          action: 'send_reschedule_confirmation_whatsapp',
          appointmentId: appointmentData.id,
          confirmationWhatsAppJobId,
          error: sendError instanceof Error ? sendError.message : String(sendError),
        })
      }
    }

    return NextResponse.json(updated)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reschedule appointment.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
