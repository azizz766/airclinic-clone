import { prisma } from '@/lib/prisma'

export function normalizePhone(value: string) {
  const trimmed = value.trim().toLowerCase().replace('whatsapp:', '')
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  return hasPlus ? `+${digits}` : digits
}

export function normalizeReplyValue(rawBody: string) {
  const normalizedDigits = rawBody.replace(/[١۱]/g, '1').replace(/[٢۲]/g, '2')
  const compact = normalizedDigits.replace(/\s+/g, ' ').trim()

  if (/(^|\s)1(\s|$)/.test(compact)) {
    return 1
  }

  if (/(^|\s)2(\s|$)/.test(compact)) {
    return 2
  }

  const directNumberMatch = compact.match(/^([1-9])$/)
  if (directNumberMatch) {
    return Number(directNumberMatch[1])
  }

  return null
}

export async function findSingleClinicContextFromPhone(fromRaw: string) {
  const phone = normalizePhone(fromRaw)
  const last8 = phone.replace(/\D/g, '').slice(-8)

  if (!last8) {
    return {
      clinicId: null as string | null,
      reason: 'no_phone_match',
      candidateClinicCount: 0,
    }
  }

  const patients = await prisma.patient.findMany({
    where: {
      phone: {
        endsWith: last8,
      },
      isActive: true,
    },
    select: {
      clinicId: true,
    },
    take: 20,
  })

  const clinicIds = Array.from(new Set(patients.map((item) => item.clinicId)))

  if (clinicIds.length === 1) {
    return {
      clinicId: clinicIds[0],
      reason: 'single_patient_clinic',
      candidateClinicCount: clinicIds.length,
    }
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentJobs = await prisma.notificationJob.findMany({
    where: {
      channel: 'whatsapp',
      sentAt: {
        gte: since,
      },
      destination: {
        endsWith: last8,
      },
    },
    select: {
      clinicId: true,
    },
    take: 20,
  })

  const jobClinicIds = Array.from(new Set(recentJobs.map((item) => item.clinicId)))
  if (jobClinicIds.length === 1) {
    return {
      clinicId: jobClinicIds[0],
      reason: 'single_recent_job_clinic',
      candidateClinicCount: jobClinicIds.length,
    }
  }

  return {
    clinicId: null as string | null,
    reason: clinicIds.length > 1 || jobClinicIds.length > 1 ? 'ambiguous_clinic' : 'no_clinic_match',
    candidateClinicCount: Math.max(clinicIds.length, jobClinicIds.length),
  }
}

export async function findSafeRecentNotificationJobFallback(fromRaw: string) {
  const phone = normalizePhone(fromRaw)
  const last8 = phone.replace(/\D/g, '').slice(-8)

  if (!last8) {
    return {
      job: null as Awaited<ReturnType<typeof prisma.notificationJob.findFirst>>,
      reason: 'no_phone_match',
      candidateJobs: 0,
      candidateAppointments: 0,
    }
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const recentJobs = await prisma.notificationJob.findMany({
    where: {
      channel: 'whatsapp',
      status: 'sent',
      sentAt: {
        gte: since,
      },
      destination: {
        endsWith: last8,
      },
    },
    include: {
      appointment: true,
    },
    orderBy: {
      sentAt: 'desc',
    },
    take: 10,
  })

  const uniqueAppointmentIds = new Set(recentJobs.map((job) => job.appointmentId))

  if (recentJobs.length !== 1 || uniqueAppointmentIds.size !== 1) {
    return {
      job: null as Awaited<ReturnType<typeof prisma.notificationJob.findFirst>>,
      reason: recentJobs.length === 0 ? 'no_recent_jobs' : 'ambiguous_recent_jobs',
      candidateJobs: recentJobs.length,
      candidateAppointments: uniqueAppointmentIds.size,
    }
  }

  return {
    job: recentJobs[0],
    reason: 'safe_recent_job_match',
    candidateJobs: recentJobs.length,
    candidateAppointments: uniqueAppointmentIds.size,
  }
}

export async function findLatestActiveAppointmentByPhone(fromRaw: string, clinicId?: string) {
  const phone = normalizePhone(fromRaw)
  const last8 = phone.replace(/\D/g, '').slice(-8)

  if (!last8) {
    return {
      appointment: null as Awaited<ReturnType<typeof prisma.appointment.findFirst>>,
      reason: 'no_phone_match',
      candidateCount: 0,
    }
  }

  const candidates = await prisma.appointment.findMany({
    where: {
      status: {
        in: ['scheduled', 'confirmation_pending', 'confirmed'],
      },
      ...(clinicId ? { clinicId } : {}),
      patient: {
        phone: {
          endsWith: last8,
        },
      },
    },
    include: {
      patient: true,
    },
    orderBy: {
      scheduledAt: 'desc',
    },
    take: 2,
  })

  if (candidates.length === 0) {
    return {
      appointment: null as Awaited<ReturnType<typeof prisma.appointment.findFirst>>,
      reason: 'no_active_appointments',
      candidateCount: 0,
    }
  }

  if (candidates.length > 1) {
    return {
      appointment: null as Awaited<ReturnType<typeof prisma.appointment.findFirst>>,
      reason: 'multiple_active_appointments',
      candidateCount: candidates.length,
    }
  }

  return {
    appointment: candidates[0],
    reason: 'single_latest_appointment',
    candidateCount: 1,
  }
}
