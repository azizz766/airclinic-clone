import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isDateWithinDoctorAvailability } from '@/lib/doctor-availability'
import { normalizePhone } from '@/lib/whatsapp/context-resolution'
import { prepareReminderNotificationJob } from '@/lib/notifications/reminder-jobs'
import { sendWhatsAppNotificationJob } from '@/lib/notifications/send-whatsapp-job'

const REMINDER_OFFSETS_HOURS = [24, 3] as const

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { clinicId, serviceId, doctorId, scheduledAt, patientFirstName, patientLastName, patientPhone } = body

    // Validate required fields
    if (!clinicId || typeof clinicId !== 'string') {
      return NextResponse.json({ error: 'Invalid clinic' }, { status: 400 })
    }

    if (!serviceId || typeof serviceId !== 'string') {
      return NextResponse.json({ error: 'Service required' }, { status: 400 })
    }

    if (!scheduledAt || typeof scheduledAt !== 'string') {
      return NextResponse.json({ error: 'Date/time required' }, { status: 400 })
    }

    if (!patientFirstName || typeof patientFirstName !== 'string') {
      return NextResponse.json({ error: 'First name required' }, { status: 400 })
    }

    if (!patientLastName || typeof patientLastName !== 'string') {
      return NextResponse.json({ error: 'Last name required' }, { status: 400 })
    }

    if (!patientPhone || typeof patientPhone !== 'string') {
      return NextResponse.json({ error: 'Phone required' }, { status: 400 })
    }

    // Parse and validate scheduled time
    const scheduledAtDate = new Date(scheduledAt)
    if (Number.isNaN(scheduledAtDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date/time format' }, { status: 400 })
    }

    const now = new Date()
    if (scheduledAtDate < now) {
      return NextResponse.json({ error: 'Cannot book in the past' }, { status: 400 })
    }

    // Verify clinic exists
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true, isActive: true },
    })

    if (!clinic || !clinic.isActive) {
      return NextResponse.json({ error: 'Clinic not found or inactive' }, { status: 404 })
    }

    // Verify service belongs to clinic and is active
    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        clinicId,
        isActive: true,
      },
    })

    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }

    // Verify doctor if specified
    let doctor = null
    if (doctorId && typeof doctorId === 'string') {
      doctor = await prisma.doctor.findFirst({
        where: {
          id: doctorId,
          clinicId,
          isActive: true,
        },
      })

      if (!doctor) {
        return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
      }
    }

    // If no specific doctor, find the first available active doctor
    if (!doctor) {
      doctor = await prisma.doctor.findFirst({
        where: {
          clinicId,
          isActive: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      })

      if (!doctor) {
        return NextResponse.json({ error: 'No doctors available' }, { status: 404 })
      }
    }

    // Validate availability
    const appointmentEnd = new Date(scheduledAtDate.getTime() + service.durationMinutes * 60000)

    const isWithinAvailability = isDateWithinDoctorAvailability(
      scheduledAtDate,
      service.durationMinutes,
      doctor.availabilitySchedule
    )

    if (!isWithinAvailability) {
      return NextResponse.json(
        { error: 'Selected time is outside doctor availability' },
        { status: 409 }
      )
    }

    // Check for conflicts
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
      return NextResponse.json({ error: 'Time slot already booked' }, { status: 409 })
    }

    // Find or create patient
    const phoneNormalized = normalizePhone(patientPhone)
    const last8 = phoneNormalized.replace(/\D/g, '').slice(-8)

    let patient = null
    if (last8) {
      patient = await prisma.patient.findFirst({
        where: {
          clinicId,
          phone: {
            endsWith: last8,
          },
          isActive: true,
        },
      })
    }

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          clinicId,
          firstName: patientFirstName.trim(),
          lastName: patientLastName.trim(),
          phone: phoneNormalized,
          isActive: true,
        },
      })
    }

    // Get clinic admin/owner for createdBy (public booking uses system user)
    const clinicMembership = await prisma.membership.findFirst({
      where: {
        clinicId,
        isActive: true,
        role: { in: ['owner', 'admin'] },
      },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    })

    if (!clinicMembership) {
      return NextResponse.json({ error: 'Clinic has no admin' }, { status: 500 })
    }

    // Create appointment in transaction
    let confirmationJobId: string | null = null

    const appointment = await prisma.$transaction(async (tx) => {
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
          patientId: patient.id,
          doctorId: doctor.id,
          serviceId: service.id,
          scheduledAt: scheduledAtDate,
          durationMinutes: service.durationMinutes,
          status: 'confirmation_pending',
          notes: '[Public Booking]',
          createdBy: clinicMembership.userId,
        },
      })

      // Create reminders
      const reminderCandidates = [
        {
          clinicId,
          appointmentId: createdAppointment.id,
          type: 'whatsapp' as const,
          scheduledAt: now,
          status: 'pending' as const,
          template: 'appointment_confirmation',
        },
        ...REMINDER_OFFSETS_HOURS
          .map((offsetHours) => ({
            clinicId,
            appointmentId: createdAppointment.id,
            type: 'whatsapp' as const,
            scheduledAt: new Date(createdAppointment.scheduledAt.getTime() - offsetHours * 60 * 60 * 1000),
            status: 'pending' as const,
            template: offsetHours === 24 ? 'appointment_reminder_24h' : 'appointment_reminder_3h',
          }))
          .filter((r) => r.scheduledAt > now),
      ]

      const remindersForNotifications = [] as Array<{
        id: string
        scheduledAt: Date
        template: string | null
      }>

      for (const candidate of reminderCandidates) {
        const createdReminder = await tx.reminder.create({ data: candidate })
        remindersForNotifications.push({
          id: createdReminder.id,
          scheduledAt: createdReminder.scheduledAt,
          template: createdReminder.template,
        })
      }

      // Create notification jobs for reminders
      for (const reminder of remindersForNotifications) {
        const notificationJob = await prepareReminderNotificationJob(tx, {
          clinicId,
          clinic: { name: clinic.name },
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

    // Send confirmation WhatsApp immediately
    if (confirmationJobId) {
      try {
        await sendWhatsAppNotificationJob({
          clinicId,
          notificationJobId: confirmationJobId,
        })
      } catch (error) {
        console.error('[PUBLIC_BOOKING] Confirmation send failed:', {
          appointmentId: appointment.id,
          confirmationJobId,
          error: error instanceof Error ? error.message : String(error),
        })
        // Don't fail the booking - job will retry
      }
    }

    return NextResponse.json({
      id: appointment.id,
      clinicId: appointment.clinicId,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      serviceId: appointment.serviceId,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Booking failed'
    console.error('[PUBLIC_BOOKING] Error:', { message, error })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
