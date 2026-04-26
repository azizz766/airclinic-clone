import { Prisma } from '@/lib/prisma-client/client'

type ReminderNotificationInput = {
  clinicId: string
  clinic: {
    name: string | null
  }
  reminderId: string
  reminderScheduledFor: Date
  appointmentId: string
  appointmentScheduledAt: Date
  patient: {
    id: string
    firstName: string
    lastName: string
    phone: string | null
    email: string | null
  }
  doctor: {
    firstName: string
    lastName: string
  }
  service: {
    name: string
  }
}

type ReminderMessageTemplateInput = {
  patientName: string
  doctorName: string
  serviceName: string
  appointmentDate: Date
  reminderId: string
}

function normalizeDestination(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveNotificationTarget(patient: ReminderNotificationInput['patient']) {
  const phone = normalizeDestination(patient.phone)
  const email = normalizeDestination(patient.email)

  if (phone) {
    return {
      channel: 'whatsapp' as const,
      destination: phone,
      status: 'pending' as const,
      errorMessage: null,
    }
  }

  if (email) {
    return {
      channel: 'email' as const,
      destination: email,
      status: 'pending' as const,
      errorMessage: null,
    }
  }

  return {
    channel: 'sms' as const,
    destination: 'unavailable',
    status: 'failed' as const,
    errorMessage: 'No phone or email available for patient.',
  }
}

export function buildBilingualReminderMessage(input: ReminderMessageTemplateInput) {
  const appointmentDateAr = input.appointmentDate.toLocaleDateString('ar-SA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Riyadh',
  })
  const appointmentDateEn = input.appointmentDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Riyadh',
  })
  const appointmentTime = input.appointmentDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Riyadh',
  })

  return [
    `مرحبًا ${input.patientName} 👋`,
    `موعدك مع د. ${input.doctorName}`,
    `الخدمة: ${input.serviceName}`,
    `📅 ${appointmentDateAr}`,
    `⏰ ${appointmentTime}`,
    '',
    'لتأكيد الموعد أرسل: 1',
    'لطلب إعادة الجدولة أرسل: 2',
    '',
    'ننتظرك 🌟',
    '',
    '---',
    '',
    `Hello ${input.patientName} 👋`,
    `Your appointment with Dr. ${input.doctorName}`,
    `Service: ${input.serviceName}`,
    `📅 ${appointmentDateEn}`,
    `⏰ ${appointmentTime}`,
    '',
    'Reply 1 to confirm.',
    'Reply 2 to request reschedule.',
    '',
    'We look forward to seeing you!',
    '',
    `Reference: R-${input.reminderId}`,
  ].join('\n')
}

export async function prepareReminderNotificationJob(
  tx: Prisma.TransactionClient,
  input: ReminderNotificationInput
) {
  const target = resolveNotificationTarget(input.patient)

  const patientName = `${input.patient.firstName} ${input.patient.lastName}`.trim()
  const doctorName = `${input.doctor.firstName} ${input.doctor.lastName}`.trim()
  const messageBody = buildBilingualReminderMessage({
    patientName,
    doctorName,
    serviceName: input.service.name,
    appointmentDate: input.appointmentScheduledAt,
    reminderId: input.reminderId,
  })

  const notificationJob = await tx.notificationJob.upsert({
    where: {
      reminderId_channel_destination: {
        reminderId: input.reminderId,
        channel: target.channel,
        destination: target.destination,
      },
    },
    create: {
      clinicId: input.clinicId,
      reminderId: input.reminderId,
      appointmentId: input.appointmentId,
      patientId: input.patient.id,
      channel: target.channel,
      destination: target.destination,
      messageBody,
      provider: null,
      providerMessageId: null,
      status: target.status,
      errorMessage: target.errorMessage,
      scheduledFor: input.reminderScheduledFor,
      sentAt: null,
    },
    update: {
      clinicId: input.clinicId,
      appointmentId: input.appointmentId,
      patientId: input.patient.id,
      messageBody,
      provider: null,
      providerMessageId: null,
      status: target.status,
      errorMessage: target.errorMessage,
      scheduledFor: input.reminderScheduledFor,
    },
  })

  return notificationJob
}

const REMINDER_OFFSETS_HOURS = [24, 3] as const

type RegenerateAppointmentReminderJobsInput = {
  clinicId: string
  clinic: {
    name: string | null
  }
  appointmentId: string
  appointmentScheduledAt: Date
  patient: {
    id: string
    firstName: string
    lastName: string
    phone: string | null
    email: string | null
  }
  doctor: {
    firstName: string
    lastName: string
  }
  service: {
    name: string
  }
  includeImmediateConfirmation?: boolean
}

export async function regenerateAppointmentReminderJobs(
  tx: Prisma.TransactionClient,
  input: RegenerateAppointmentReminderJobsInput
) {
  const now = new Date()

  const reminderCandidates = REMINDER_OFFSETS_HOURS
    .map((offsetHours) => {
      const reminderDate = new Date(input.appointmentScheduledAt.getTime() - offsetHours * 60 * 60 * 1000)
      return {
        clinicId: input.clinicId,
        appointmentId: input.appointmentId,
        type: 'whatsapp' as const,
        scheduledAt: reminderDate,
        status: 'pending' as const,
        template: offsetHours === 24 ? 'appointment_reminder_24h' : 'appointment_reminder_3h',
      }
    })
    .filter((candidate) => candidate.scheduledAt.getTime() > now.getTime())

  const patientPhone = typeof input.patient.phone === 'string' ? input.patient.phone.trim() : ''
  const shouldCreateImmediateConfirmation =
    input.includeImmediateConfirmation === true
    && Boolean(patientPhone)
    && input.appointmentScheduledAt.getTime() > now.getTime()

  if (shouldCreateImmediateConfirmation) {
    reminderCandidates.unshift({
      clinicId: input.clinicId,
      appointmentId: input.appointmentId,
      type: 'whatsapp' as const,
      scheduledAt: now,
      status: 'pending' as const,
      template: 'appointment_confirmation',
    })
  }

  const existingReminders = await tx.reminder.findMany({
    where: {
      appointmentId: input.appointmentId,
      type: 'whatsapp',
    },
    select: {
      id: true,
      type: true,
      scheduledAt: true,
      template: true,
    },
  })

  const remindersForNotifications = [] as Array<{
    id: string
    scheduledAt: Date
    template: string | null
  }>

  for (const candidate of reminderCandidates) {
    const existingReminder = existingReminders.find((item) => {
      return item.type === candidate.type
        && item.template === candidate.template
        && item.scheduledAt.getTime() === candidate.scheduledAt.getTime()
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

  const generatedJobs = [] as Array<{
    id: string
    reminderId: string
    scheduledFor: Date
    channel: string
    destination: string
    status: string
    template: string | null
  }>
  let confirmationWhatsAppJobId: string | null = null

  for (const reminder of remindersForNotifications) {
    const notificationJob = await prepareReminderNotificationJob(tx, {
      clinicId: input.clinicId,
      clinic: {
        name: input.clinic.name,
      },
      reminderId: reminder.id,
      reminderScheduledFor: reminder.scheduledAt,
      appointmentId: input.appointmentId,
      appointmentScheduledAt: input.appointmentScheduledAt,
      patient: input.patient,
      doctor: input.doctor,
      service: input.service,
    })

    generatedJobs.push({
      id: notificationJob.id,
      reminderId: reminder.id,
      scheduledFor: reminder.scheduledAt,
      channel: notificationJob.channel,
      destination: notificationJob.destination,
      status: notificationJob.status,
      template: reminder.template,
    })

    if (reminder.template === 'appointment_confirmation' && notificationJob.channel === 'whatsapp') {
      confirmationWhatsAppJobId = notificationJob.id
    }
  }

  return {
    generatedJobs,
    confirmationWhatsAppJobId,
  }
}
