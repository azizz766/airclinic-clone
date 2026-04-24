
import { sendStaffBookingNotification } from '@/lib/notifications/staff-whatsapp'
import { prisma } from '@/lib/prisma'
import { regenerateAppointmentReminderJobs } from '@/lib/notifications/reminder-jobs'

export class SlotConflictError extends Error {
  constructor() {
    super('Slot is no longer available')
    this.name = 'SlotConflictError'
  }
}

export class BookingValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BookingValidationError'
  }
}

export async function processBooking(sessionId: string) {
  const session = await prisma.conversationSession.findUniqueOrThrow({
    where: { id: sessionId },
  })

  if (
    !session.slotTimeId ||
    !session.slotServiceId ||
    !session.slotPatientName ||
    !session.slotPatientDob ||
    !session.slotDate
  ) {
    throw new BookingValidationError('Missing required slot fields on session')
  }

  let attempt = 0
  const MAX_ATTEMPTS = 3

  while (attempt < MAX_ATTEMPTS) {
    attempt++
    try {
      const appointment = await prisma.$transaction(async (tx) => {
        const slot = await tx.availableSlot.findUniqueOrThrow({
          where: { id: session.slotTimeId! },
        })

        if (
          slot.isBooked ||
          (slot.isHeld && slot.heldBySessionId !== sessionId)
        ) {
          throw new SlotConflictError()
        }

        await tx.availableSlot.update({
          where: { id: slot.id },
          data: {
            isBooked: true,
            isHeld: false,
            heldBySessionId: null,
            heldAt: null,
          },
        })

        let patient = await tx.patient.findFirst({
          where: {
            clinicId: session.clinicId,
            phone: session.phoneNumber,
          },
        })

        if (!patient) {
          const nameParts = session.slotPatientName!.trim().split(' ')
          patient = await tx.patient.create({
            data: {
              clinicId: session.clinicId,
              firstName: nameParts[0] ?? session.slotPatientName!,
              lastName: nameParts.slice(1).join(' ') || '-',
              phone: session.slotPhoneConfirmed ?? session.phoneNumber,
              dateOfBirth: session.slotPatientDob,
            },
          })
        }

        const appointment = await tx.appointment.create({
          data: {
            clinicId: session.clinicId,
            patientId: patient.id,
            serviceId: session.slotServiceId!,
            scheduledAt: slot.startTime,
            durationMinutes: Math.round(
              (slot.endTime.getTime() - slot.startTime.getTime()) / 60000
            ),
            status: 'scheduled',
          },
        })

        await tx.conversationSession.update({
          where: { id: sessionId },
          data: { bookingId: appointment.id },
        })

        // Fetch clinic and service for reminder job
        const clinic = await tx.clinic.findUniqueOrThrow({
          where: { id: session.clinicId },
          select: { name: true },
        })
        const service = await tx.service.findUniqueOrThrow({
          where: { id: session.slotServiceId! },
          select: { name: true },
        })

        try {
          await regenerateAppointmentReminderJobs(tx, {
            clinicId: session.clinicId,
            clinic: { name: clinic.name },
            appointmentId: appointment.id,
            appointmentScheduledAt: slot.startTime,
            patient: {
              id: patient.id,
              firstName: patient.firstName,
              lastName: patient.lastName,
              phone: patient.phone,
              email: patient.email ?? null,
            },
            doctor: { firstName: '', lastName: '' },
            service: { name: service.name },
            includeImmediateConfirmation: false,
          })
        } catch (reminderErr) {
          console.error('[booking-handler] reminder generation failed', { reminderErr })
        }

        try {
          await sendStaffBookingNotification({
            patientName: `${patient.firstName} ${patient.lastName}`,
            serviceName: service.name,
            scheduledAt: slot.startTime,
            phone: patient.phone ?? '',
          })
        } catch (err) {
          console.error('[booking-handler] staff notification failed', { err })
        }
        return appointment
      })

      return appointment

    } catch (err) {
      if (err instanceof SlotConflictError) throw err
      if (err instanceof BookingValidationError) throw err
      if (attempt >= MAX_ATTEMPTS) throw err
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }

  throw new Error('processBooking: unreachable')
}

export async function releaseSlotHold(slotId: string) {
  await prisma.availableSlot.update({
    where: { id: slotId },
    data: {
      isHeld: false,
      heldBySessionId: null,
      heldAt: null,
    },
  })
}
