export type ClinicRole = 'owner' | 'admin' | 'doctor' | 'receptionist'

type MembershipRole = ClinicRole | 'staff'

const CLINIC_ACCESS_ROLES: ClinicRole[] = ['owner', 'admin', 'doctor', 'receptionist']
const CLINIC_OPERATOR_ROLES: ClinicRole[] = ['owner', 'admin', 'receptionist']
const CLINIC_ADMIN_ROLES: ClinicRole[] = ['owner', 'admin']

export function isClinicRole(value: string): value is ClinicRole {
  return ['owner', 'admin', 'doctor', 'receptionist'].includes(value)
}

export function normalizeClinicRole(role: MembershipRole): ClinicRole {
  // Preserve existing staff behavior by treating legacy staff memberships as receptionist.
  if (role === 'staff') {
    return 'receptionist'
  }

  return role
}

export function canAccessClinic(role: ClinicRole) {
  return CLINIC_ACCESS_ROLES.includes(role)
}

export function canManagePatients(role: ClinicRole) {
  return CLINIC_OPERATOR_ROLES.includes(role)
}

export function canManageAppointments(role: ClinicRole) {
  return CLINIC_OPERATOR_ROLES.includes(role)
}

export function canUpdateAppointmentStatus(role: ClinicRole) {
  return CLINIC_OPERATOR_ROLES.includes(role)
}

export function canConfirmAppointment(role: ClinicRole) {
  return CLINIC_OPERATOR_ROLES.includes(role)
}

export function canCancelAppointment(role: ClinicRole) {
  return CLINIC_OPERATOR_ROLES.includes(role)
}

export function canRescheduleAppointment(role: ClinicRole) {
  return CLINIC_OPERATOR_ROLES.includes(role)
}

export function canRetryNotificationJob(role: ClinicRole) {
  return CLINIC_ADMIN_ROLES.includes(role)
}

export function canViewDashboardMetrics(role: ClinicRole) {
  return CLINIC_OPERATOR_ROLES.includes(role)
}

export function canViewNotificationCenter(role: ClinicRole) {
  return CLINIC_OPERATOR_ROLES.includes(role)
}

export function canViewActivityLog(role: ClinicRole) {
  return CLINIC_OPERATOR_ROLES.includes(role)
}

export function canViewInbox(role: ClinicRole) {
  return CLINIC_OPERATOR_ROLES.includes(role)
}

export function canOperateInbox(role: ClinicRole) {
  return CLINIC_OPERATOR_ROLES.includes(role)
}

export function canManageDoctors(role: ClinicRole) {
  return CLINIC_ADMIN_ROLES.includes(role)
}

export function canManageServices(role: ClinicRole) {
  return CLINIC_ADMIN_ROLES.includes(role)
}

export function canAccessClinicSettings(role: ClinicRole) {
  return CLINIC_ADMIN_ROLES.includes(role)
}

export function canManageTeam(role: ClinicRole) {
  return CLINIC_ADMIN_ROLES.includes(role)
}

export function toMembershipRole(role: ClinicRole): MembershipRole {
  if (role === 'receptionist') {
    return 'staff'
  }

  return role
}