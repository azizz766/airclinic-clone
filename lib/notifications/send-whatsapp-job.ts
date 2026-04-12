import { prisma } from '@/lib/prisma'
import { persistOutboundMessage } from '@/lib/whatsapp/persist-message'
import {
  sendAppointmentConfirmationMessage,
  sendAppointmentReminder24h,
  sendAppointmentReminder3h,
} from '@/lib/notifications/appointment-whatsapp'

type SendWhatsAppNotificationJobInput = {
  clinicId: string
  notificationJobId: string
}

export async function sendWhatsAppNotificationJob(input: SendWhatsAppNotificationJobInput) {
  const claimed = await prisma.notificationJob.updateMany({
    where: {
      id: input.notificationJobId,
      clinicId: input.clinicId,
      channel: 'whatsapp',
      status: 'pending',
    },
    data: {
      status: 'queued',
      provider: 'twilio-whatsapp',
      errorMessage: null,
    },
  })

  if (claimed.count === 0) {
    const existingJob = await prisma.notificationJob.findFirst({
      where: {
        id: input.notificationJobId,
        clinicId: input.clinicId,
        channel: 'whatsapp',
      },
      select: {
        status: true,
      },
    })

    if (!existingJob) {
      return {
        ok: false as const,
        status: 'failed' as const,
        error: 'Notification job not found for this clinic.',
      }
    }

    return {
      ok: false as const,
      status: 'failed' as const,
      error: `Notification job is ${existingJob.status} and cannot be sent manually.`,
    }
  }

  const notificationJob = await prisma.notificationJob.findFirst({
    where: {
      id: input.notificationJobId,
      clinicId: input.clinicId,
      channel: 'whatsapp',
      status: 'queued',
    },
    select: {
      id: true,
      patientId: true,
      reminderId: true,
      destination: true,
      reminder: {
        select: {
          template: true,
        },
      },
      appointment: {
        select: {
          id: true,
          scheduledAt: true,
          status: true,
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
      },
      patient: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  })

  if (!notificationJob) {
    return {
      ok: false as const,
      status: 'failed' as const,
      error: 'Notification job is no longer queued for sending.',
    }
  }

  if (['cancelled', 'completed', 'no_show', 'rescheduled'].includes(notificationJob.appointment.status)) {
    await prisma.notificationJob.updateMany({
      where: {
        id: notificationJob.id,
        status: 'queued',
      },
      data: {
        status: 'failed',
        errorMessage: `Skipped because appointment status is ${notificationJob.appointment.status}.`,
      },
    })

    await prisma.reminder.updateMany({
      where: { id: notificationJob.reminderId },
      data: { status: 'failed' },
    })

    return {
      ok: false as const,
      status: 'failed' as const,
      error: `Appointment status ${notificationJob.appointment.status} is not eligible for reminder sending.`,
    }
  }

  const patientName = `${notificationJob.patient.firstName} ${notificationJob.patient.lastName}`.trim()
  const doctorName = `${notificationJob.appointment.doctor?.firstName ?? ''} ${notificationJob.appointment.doctor?.lastName ?? ''}`.trim()
  const template = notificationJob.reminder.template ?? 'appointment_reminder_24h'

  const senderInput = {
    to: notificationJob.destination,
    reminderRef: notificationJob.reminderId,
    patientName,
    doctorName,
    serviceName: notificationJob.appointment.service.name,
    appointmentDate: notificationJob.appointment.scheduledAt,
  }

  let senderFn = sendAppointmentReminder24h
  if (template === 'appointment_confirmation') {
    senderFn = sendAppointmentConfirmationMessage
  } else if (template === 'appointment_reminder_3h') {
    senderFn = sendAppointmentReminder3h
  }

  const composed = await senderFn(senderInput)
  const messageBody = composed.body

  await prisma.notificationJob.updateMany({
    where: {
      id: notificationJob.id,
      status: 'queued',
    },
    data: {
      messageBody,
    },
  })

  try {
    await prisma.notificationJob.updateMany({
      where: {
        id: notificationJob.id,
        status: 'queued',
      },
      data: {
        provider: 'twilio-whatsapp',
        providerMessageId: composed.sid,
        status: 'sent',
        errorMessage: null,
        sentAt: new Date(),
      },
    })

    const now = new Date()
    const appointmentUpdateData: {
      confirmationRequestedAt?: Date
      reminder24hSentAt?: Date
      reminder3hSentAt?: Date
      lastReminderType?: string
    } = {
      lastReminderType: template,
    }

    if (template === 'appointment_confirmation') {
      appointmentUpdateData.confirmationRequestedAt = now
    }
    if (template === 'appointment_reminder_24h') {
      appointmentUpdateData.reminder24hSentAt = now
    }
    if (template === 'appointment_reminder_3h') {
      appointmentUpdateData.reminder3hSentAt = now
    }

    await prisma.appointment.update({
      where: { id: notificationJob.appointment.id },
      data: appointmentUpdateData,
    })

    try {
      await persistOutboundMessage({
        clinicId: input.clinicId,
        patientId: notificationJob.patientId,
        patientPhone: notificationJob.destination,
        content: messageBody,
        externalId: composed.sid,
      })
    } catch (persistError) {
      console.error('[send-whatsapp-job] outbound-persist-failed', { persistError, jobId: notificationJob.id })
    }

    await prisma.reminder.updateMany({
      where: { id: notificationJob.reminderId },
      data: { status: 'sent', sentAt: new Date() },
    })

    return {
      ok: true as const,
      status: 'sent' as const,
      providerMessageId: composed.sid,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send WhatsApp message.'

    await prisma.notificationJob.updateMany({
      where: {
        id: notificationJob.id,
        status: 'queued',
      },
      data: {
        provider: 'twilio-whatsapp',
        status: 'failed',
        errorMessage: message,
      },
    })

    await prisma.reminder.updateMany({
      where: { id: notificationJob.reminderId },
      data: { status: 'failed' },
    })

    return {
      ok: false as const,
      status: 'failed' as const,
      error: message,
    }
  }
}

type SendDueWhatsAppNotificationsForClinicInput = {
  clinicId: string
  now?: Date
  limit?: number
}

export async function sendDueWhatsAppNotificationsForClinic(
  input: SendDueWhatsAppNotificationsForClinicInput
) {
  const now = input.now ?? new Date()
  const limit = input.limit ?? 20

  // Recover jobs stuck in 'queued' state (e.g. from a crashed or timed-out prior execution).
  // updatedAt is an approximation: it reflects the last write to the row, which includes
  // an intermediate messageBody update before the Twilio call. The 5-minute threshold
  // safely exceeds Vercel's 60s max function timeout, so any job still 'queued'
  // after 5 minutes is definitively stuck.
  const staleQueuedCutoff = new Date(now.getTime() - 5 * 60 * 1000)
  await prisma.notificationJob.updateMany({
    where: {
      clinicId: input.clinicId,
      channel: 'whatsapp',
      status: 'queued',
      updatedAt: {
        lte: staleQueuedCutoff,
      },
    },
    data: {
      status: 'pending',
      errorMessage: 'Reset from stale queued state (prior execution did not complete).',
    },
  })

  const dueJobs = await prisma.notificationJob.findMany({
    where: {
      clinicId: input.clinicId,
      channel: 'whatsapp',
      status: 'pending',
      scheduledFor: {
        lte: now,
      },
      appointment: {
        status: {
          notIn: ['cancelled', 'completed', 'no_show', 'rescheduled'],
        },
        scheduledAt: {
          gt: now,
        },
      },
    },
    orderBy: {
      scheduledFor: 'asc',
    },
    select: {
      id: true,
    },
    take: limit,
  })

  const result = {
    total: dueJobs.length,
    sent: 0,
    failed: 0,
  }

  for (const job of dueJobs) {
    const sendResult = await sendWhatsAppNotificationJob({
      clinicId: input.clinicId,
      notificationJobId: job.id,
    })

    if (sendResult.ok) {
      result.sent += 1
    } else {
      result.failed += 1
    }
  }

  return result
}
