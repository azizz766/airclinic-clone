// Application constants

export const APP_NAME = 'AirClinic Clone'
export const APP_VERSION = '0.1.0'

export const ROLES = {
  ADMIN: 'admin',
  CLINIC_OWNER: 'clinic_owner',
  DOCTOR: 'doctor',
  STAFF: 'staff'
} as const

export const APPOINTMENT_STATUSES = {
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
} as const

export const MESSAGE_SENDERS = {
  PATIENT: 'patient',
  CLINIC: 'clinic'
} as const

export const REMINDER_TYPES = {
  EMAIL: 'email',
  SMS: 'sms'
} as const