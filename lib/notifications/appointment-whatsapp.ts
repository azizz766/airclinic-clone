import { sendWhatsAppMessage } from '@/lib/whatsapp'

type AppointmentWhatsAppInput = {
  to: string
  reminderRef: string
  patientName: string
  doctorName: string
  serviceName?: string | null
  appointmentDate: Date
}

function formatAppointmentDate(date: Date) {
  return date.toLocaleDateString('ar-SA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatAppointmentTime(date: Date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizePhoneDestination(value: string) {
  const trimmed = value.trim().toLowerCase().replace('whatsapp:', '')
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  return hasPlus ? `+${digits}` : digits
}

function buildConfirmationMessage(input: AppointmentWhatsAppInput) {
  const dateLabel = formatAppointmentDate(input.appointmentDate)
  const timeLabel = formatAppointmentTime(input.appointmentDate)

  return [
    `مرحبًا ${input.patientName} 👋`,
    `موعدك مع د. ${input.doctorName}`,
    input.serviceName ? `الخدمة: ${input.serviceName}` : null,
    `📅 ${dateLabel}`,
    `⏰ ${timeLabel}`,
    '',
    'لتأكيد الموعد أرسل: 1',
    'لطلب إعادة الجدولة أرسل: 2',
    '',
    `Reference: R-${input.reminderRef}`,
  ].filter(Boolean).join('\n')
}

function buildReminder24hMessage(input: AppointmentWhatsAppInput) {
  const dateLabel = formatAppointmentDate(input.appointmentDate)
  const timeLabel = formatAppointmentTime(input.appointmentDate)

  return [
    `تذكير قبل 24 ساعة - ${input.patientName}`,
    `موعدك مع د. ${input.doctorName}`,
    input.serviceName ? `الخدمة: ${input.serviceName}` : null,
    `📅 ${dateLabel}`,
    `⏰ ${timeLabel}`,
    '',
    'لتأكيد الموعد أرسل: 1',
    'لطلب إعادة الجدولة أرسل: 2',
    '',
    `Reference: R-${input.reminderRef}`,
  ].filter(Boolean).join('\n')
}

function buildReminder3hMessage(input: AppointmentWhatsAppInput) {
  const dateLabel = formatAppointmentDate(input.appointmentDate)
  const timeLabel = formatAppointmentTime(input.appointmentDate)

  return [
    `تذكير قبل 3 ساعات - ${input.patientName}`,
    `موعدك مع د. ${input.doctorName}`,
    input.serviceName ? `الخدمة: ${input.serviceName}` : null,
    `📅 ${dateLabel}`,
    `⏰ ${timeLabel}`,
    '',
    'إذا تحتاج تغيير الموعد أرسل: 2',
    '',
    `Reference: R-${input.reminderRef}`,
  ].filter(Boolean).join('\n')
}

export async function sendAppointmentConfirmationMessage(input: AppointmentWhatsAppInput) {
  const body = buildConfirmationMessage(input)
  const result = await sendWhatsAppMessage(normalizePhoneDestination(input.to), body)
  return { sid: result.sid, body, mocked: Boolean((result as { mocked?: boolean }).mocked) }
}

export async function sendAppointmentReminder24h(input: AppointmentWhatsAppInput) {
  const body = buildReminder24hMessage(input)
  const result = await sendWhatsAppMessage(normalizePhoneDestination(input.to), body)
  return { sid: result.sid, body, mocked: Boolean((result as { mocked?: boolean }).mocked) }
}

export async function sendAppointmentReminder3h(input: AppointmentWhatsAppInput) {
  const body = buildReminder3hMessage(input)
  const result = await sendWhatsAppMessage(normalizePhoneDestination(input.to), body)
  return { sid: result.sid, body, mocked: Boolean((result as { mocked?: boolean }).mocked) }
}
