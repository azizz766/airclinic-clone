// Updated: sync available_slots on manual booking
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { prepareReminderNotificationJob } from '@/lib/notifications/reminder-jobs'
import { sendWhatsAppNotificationJob } from '@/lib/notifications/send-whatsapp-job'
import { canManageAppointments, normalizeClinicRole } from '@/lib/auth/permissions'
import { isDateWithinDoctorAvailability } from '@/lib/doctor-availability'
import { syncCreateEvent } from '@/lib/google/sync'

const REMINDER_OFFSETS_HOURS = [24, 3] as const

export async function POST(request: NextRequest) {
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
    where: { userId },
  })

  if (!membership) {
    return NextResponse.json({ error: 'No clinic access' }, { status: 403 })
  }

  const role = normalizeClinicRole(membership.role)
  if (!canManageAppointments(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const formData = await request.formData()
  const patientId = formData.get('patientId')
  const doctorId = formData.get('doctorId')
  const serviceId = formData.get('serviceId')
  const scheduledAt = formData.get('scheduledAt')
  const notes = formData.get('notes')

  if (typeof patientId !== 'string' || !patientId.trim()) {
    return NextResponse.json({ error: 'Patient required' }, { status: 400 })
  }

  if (typeof doctorId !== 'string' || !doctorId.trim()) {
    return NextResponse.json({ error: 'Doctor required' }, { status: 400 })
  }

  if (typeof serviceId !== 'string' || !serviceId.trim()) {
    return NextResponse.json({ error: 'Service required' }, { status: 400 })
  }

  if (typeof scheduledAt !== 'string' || !scheduledAt.trim()) {
    return NextResponse.json({ error: 'Appointment date/time required' }, { status: 400 })
  }

  // Verify patient belongs to this clinic
  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId.trim(),
      clinicId: membership.clinicId,
    },
  })

  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  const scheduledAtDate = new Date(scheduledAt)
  if (Number.isNaN(scheduledAtDate.getTime())) {
    return NextResponse.json({ error: 'Invalid appointment date/time' }, { status: 400 })
  }

  const clinicId = membership.clinicId

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { name: true },
  })

  const doctor = await prisma.doctor.findFirst({
    where: {
      id: doctorId.trim(),
      clinicId,
      isActive: true,
    },
  })

  if (!doctor) {
    return NextResponse.json({ error: 'Doctor not found for this clinic' }, { status: 400 })
  }

  const service = await prisma.service.findFirst({
    where: {
      id: serviceId.trim(),
      clinicId,
      isActive: true,
    },
  })

  if (!service) {
    return NextResponse.json({ error: 'Service not found for this clinic' }, { status: 400 })
  }

  const appointmentEnd = new Date(scheduledAtDate.getTime() + service.durationMinutes * 60000)

  const isWithinAvailability = isDateWithinDoctorAvailability(
    scheduledAtDate,
    service.durationMinutes,
    doctor.availabilitySchedule
  )

  if (!isWithinAvailability) {
    return NextResponse.json(
      {
        error:
          'Selected doctor is not working at this date/time. Please choose another time or doctor.',
      },
      { status: 409 }
    )
  }

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      clinicId,
      doctorId: doctor.id,
      NOT: { status: 'cancelled' },
      scheduledAt: {
        lt: appointmentEnd,
      },
    },
    orderBy: {
      scheduledAt: 'asc',
    },
  })

  const overlappingAppointment = existingAppointments.find((existingAppointment) => {
    const existingEnd = new Date(
      existingAppointment.scheduledAt.getTime() + existingAppointment.durationMinutes * 60000
    )
    return scheduledAtDate < existingEnd && appointmentEnd > existingAppointment.scheduledAt
  })

  if (overlappingAppointment) {
    return NextResponse.json(
      {
        error:
          'This appointment overlaps an existing appointment for the selected doctor. Please choose another time.',
      },
      { status: 409 }
    )
  }

  try {
    let confirmationJobId: string | null = null

    const appointment = await prisma.$transaction(async (tx) => {
      const now = new Date()
      const patientPhone = typeof patient.phone === 'string' ? patient.phone.trim() : ''
      const shouldRequestConfirmation = Boolean(patientPhone) && scheduledAtDate.getTime() > now.getTime()

      // Find and lock matching available slot
      const matchingSlot = await tx.availableSlot.findFirst({
        where: {
          clinicId,
          serviceId: service.id,
          startTime: scheduledAtDate,
          isBooked: false,
        },
      })
      if (matchingSlot) {
        await tx.availableSlot.update({
          where: { id: matchingSlot.id },
          data: { isBooked: true, isHeld: false, heldBySessionId: null, heldAt: null },
        })
      }

      const createdAppointment = await tx.appointment.create({
        data: {
          clinicId,
          patientId: patientId.trim(),
          doctorId: doctor.id,
          serviceId: service.id,
          scheduledAt: scheduledAtDate,
          durationMinutes: service.durationMinutes,
          status: shouldRequestConfirmation ? 'confirmation_pending' : 'scheduled',
          notes: typeof notes === 'string' ? notes.trim() || null : null,
          createdBy: userId,
        },
      })

      const existingReminders = await tx.reminder.findMany({
        where: { appointmentId: createdAppointment.id },
        select: { id: true, type: true, scheduledAt: true, template: true },
      })

      const reminderCandidates = REMINDER_OFFSETS_HOURS
        .map((offsetHours) => {
          const reminderDate = new Date(createdAppointment.scheduledAt.getTime() - offsetHours * 60 * 60 * 1000)
          return {
            clinicId,
            appointmentId: createdAppointment.id,
            type: 'whatsapp' as const,
            scheduledAt: reminderDate,
            status: 'pending' as const,
            template: offsetHours === 24 ? 'appointment_reminder_24h' : 'appointment_reminder_3h',
          }
        })
        .filter((candidate) => candidate.scheduledAt.getTime() > now.getTime())

      if (shouldRequestConfirmation) {
        reminderCandidates.unshift({
          clinicId,
          appointmentId: createdAppointment.id,
          type: 'whatsapp' as const,
          scheduledAt: now,
          status: 'pending' as const,
          template: 'appointment_confirmation',
        })
      }

      const remindersForNotifications = [] as Array<{
        id: string
        scheduledAt: Date
        template: string | null
      }>

      for (const candidate of reminderCandidates) {
        const existingReminder = existingReminders.find((item) => {
          return item.type === candidate.type && item.scheduledAt.getTime() === candidate.scheduledAt.getTime()
        })

        if (existingReminder) {
          remindersForNotifications.push({
            id: existingReminder.id,
            scheduledAt: existingReminder.scheduledAt,
            template: existingReminder.template,
          })
          continue
        }

        const createdReminder = await tx.reminder.create({ data: candidate })
        remindersForNotifications.push({
          id: createdReminder.id,
          scheduledAt: createdReminder.scheduledAt,
          template: createdReminder.template,
        })
      }

      for (const reminder of remindersForNotifications) {
        const notificationJob = await prepareReminderNotificationJob(tx, {
          clinicId,
          clinic: {
            name: clinic?.name ?? null,
          },
          reminderId: reminder.id,
          reminderScheduledFor: reminder.scheduledAt,
          appointmentId: createdAppointment.id,
          appointmentScheduledAt: createdAppointment.scheduledAt,
          patient: {
            id: patient.id,
            firstName: patient.firstName,
            lastName: patient.lastName,
            phone: patient.phone,
            email: patient.email,
          },
          doctor: {
            firstName: doctor.firstName,
            lastName: doctor.lastName,
          },
          service: {
            name: service.name,
          },
        })

        if (reminder.template === 'appointment_confirmation' && notificationJob.channel === 'whatsapp') {
          confirmationJobId = notificationJob.id
        }
      }

      return createdAppointment
    })

    if (confirmationJobId) {
      try {
        await sendWhatsAppNotificationJob({
          clinicId,
          notificationJobId: confirmationJobId,
        })
      } catch (error) {
        // Log send failure but don't throw; appointment is safely persisted and can retry
        console.error('[SEND FAILURE]', {
          action: 'send_confirmation_whatsapp',
          appointmentId: appointment.id,
          confirmationJobId,
          error: error instanceof Error ? error.message : String(error),
        })
        // Appointment still committed to DB; the job will be retried by cron
      }
    }

    syncCreateEvent(clinicId, appointment.id).catch(console.warn)

    return NextResponse.json(appointment)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to schedule appointment.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
