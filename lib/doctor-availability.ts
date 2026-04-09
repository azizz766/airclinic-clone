export const WEEK_DAYS = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
] as const

export type WeekDayKey = (typeof WEEK_DAYS)[number]

export interface DoctorAvailabilitySchedule {
  workingDays: WeekDayKey[]
  startTime: string
  endTime: string
}

export const DEFAULT_DOCTOR_AVAILABILITY: DoctorAvailabilitySchedule = {
  workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  startTime: '09:00',
  endTime: '17:00',
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value)
}

function toTimeMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(value: number) {
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  return `${hh}:${mm}`
}

export function parseDoctorAvailabilitySchedule(input: unknown): DoctorAvailabilitySchedule {
  if (!input || typeof input !== 'object') {
    return DEFAULT_DOCTOR_AVAILABILITY
  }

  const value = input as Record<string, unknown>

  const rawDays = Array.isArray(value.workingDays)
    ? value.workingDays.filter((day): day is WeekDayKey => {
        return typeof day === 'string' && WEEK_DAYS.includes(day as WeekDayKey)
      })
    : []

  const startTime = typeof value.startTime === 'string' && isValidTime(value.startTime)
    ? value.startTime
    : DEFAULT_DOCTOR_AVAILABILITY.startTime

  const endTime = typeof value.endTime === 'string' && isValidTime(value.endTime)
    ? value.endTime
    : DEFAULT_DOCTOR_AVAILABILITY.endTime

  return {
    workingDays: rawDays.length > 0 ? rawDays : DEFAULT_DOCTOR_AVAILABILITY.workingDays,
    startTime,
    endTime,
  }
}

export function getWeekDayKey(date: Date): WeekDayKey {
  return WEEK_DAYS[date.getDay()]
}

export function isDateWithinDoctorAvailability(
  scheduledAt: Date,
  durationMinutes: number,
  scheduleInput: unknown
) {
  const schedule = parseDoctorAvailabilitySchedule(scheduleInput)
  const day = getWeekDayKey(scheduledAt)

  if (!schedule.workingDays.includes(day)) {
    return false
  }

  const appointmentStartMinutes = scheduledAt.getHours() * 60 + scheduledAt.getMinutes()
  const appointmentEndMinutes = appointmentStartMinutes + durationMinutes

  const availableStartMinutes = toTimeMinutes(schedule.startTime)
  const availableEndMinutes = toTimeMinutes(schedule.endTime)

  return (
    appointmentStartMinutes >= availableStartMinutes &&
    appointmentEndMinutes <= availableEndMinutes &&
    availableStartMinutes < availableEndMinutes
  )
}

export function formatDoctorAvailability(scheduleInput: unknown) {
  const schedule = parseDoctorAvailabilitySchedule(scheduleInput)
  const dayLabel = schedule.workingDays.join(', ')
  return `${dayLabel} (${schedule.startTime}-${schedule.endTime})`
}

function overlapsRange(
  candidateStart: Date,
  candidateEnd: Date,
  existingStart: Date,
  existingEnd: Date
) {
  return candidateStart < existingEnd && candidateEnd > existingStart
}

export function buildDoctorAvailableSlots(params: {
  date: string
  durationMinutes: number
  scheduleInput: unknown
  existingAppointments: Array<{
    scheduledAt: Date
    durationMinutes: number
  }>
  intervalMinutes?: number
}) {
  const {
    date,
    durationMinutes,
    scheduleInput,
    existingAppointments,
    intervalMinutes = 15,
  } = params

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return [] as string[]
  }

  if (durationMinutes <= 0 || intervalMinutes <= 0) {
    return [] as string[]
  }

  const dayDate = new Date(`${date}T00:00:00`)
  if (Number.isNaN(dayDate.getTime())) {
    return [] as string[]
  }

  const schedule = parseDoctorAvailabilitySchedule(scheduleInput)
  const day = getWeekDayKey(dayDate)

  if (!schedule.workingDays.includes(day)) {
    return [] as string[]
  }

  const startMinutes = toTimeMinutes(schedule.startTime)
  const endMinutes = toTimeMinutes(schedule.endTime)

  if (startMinutes >= endMinutes) {
    return [] as string[]
  }

  const slots: string[] = []

  for (let slotStartMinutes = startMinutes; slotStartMinutes + durationMinutes <= endMinutes; slotStartMinutes += intervalMinutes) {
    const slotTime = minutesToTime(slotStartMinutes)
    const slotStart = new Date(`${date}T${slotTime}:00`)
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000)

    const blocked = existingAppointments.some((appointment) => {
      const existingStart = appointment.scheduledAt
      const existingEnd = new Date(existingStart.getTime() + appointment.durationMinutes * 60000)
      return overlapsRange(slotStart, slotEnd, existingStart, existingEnd)
    })

    if (!blocked) {
      slots.push(slotTime)
    }
  }

  return slots
}
