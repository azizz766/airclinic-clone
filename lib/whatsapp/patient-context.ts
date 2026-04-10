import { prisma } from '@/lib/prisma'

export type PatientContext = {
  patientId: string | null
  clinicId: string | null
  isNewPatient: boolean
  hasUpcomingAppointment: boolean
  upcomingAppointment: {
    id: string
    scheduledAt: Date
    status: string
    doctorName: string | null
  } | null
}

export async function resolvePatientContext(
  phoneNumber: string,
  clinicId: string
): Promise<PatientContext> {
  const last8 = phoneNumber.replace(/\D/g, '').slice(-8)

  const patient = await prisma.patient.findFirst({
    where: {
      clinicId,
      phone: { endsWith: last8 },
      isActive: true,
    },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  })

  if (!patient) {
    return {
      patientId: null,
      clinicId,
      isNewPatient: true,
      hasUpcomingAppointment: false,
      upcomingAppointment: null,
    }
  }

  const upcoming = await prisma.appointment.findFirst({
    where: {
      patientId: patient.id,
      clinicId,
      status: { in: ['scheduled', 'confirmed', 'confirmation_pending'] },
      scheduledAt: { gte: new Date() },
    },
    orderBy: { scheduledAt: 'asc' },
    select: {
      id: true,
      scheduledAt: true,
      status: true,
      doctor: {
        select: { firstName: true, lastName: true },
      },
    },
  })

  return {
    patientId: patient.id,
    clinicId,
    isNewPatient: false,
    hasUpcomingAppointment: !!upcoming,
    upcomingAppointment: upcoming
      ? {
          id: upcoming.id,
          scheduledAt: upcoming.scheduledAt,
          status: upcoming.status,
          doctorName: upcoming.doctor
            ? `${upcoming.doctor.firstName} ${upcoming.doctor.lastName}`
            : null,
        }
      : null,
  }
}
