import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { canManageAppointments, normalizeClinicRole } from '@/lib/auth/permissions'
import { buildDoctorAvailableSlots } from '@/lib/doctor-availability'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const email = session.user.email ?? ''

  await prisma.user.upsert({
    where: { id: userId },
    update: { email },
    create: {
      id: userId,
      email,
      passwordHash: '',
    },
  })

  const membership = await prisma.membership.findFirst({ where: { userId } })

  if (!membership) {
    return NextResponse.json({ error: 'No clinic access' }, { status: 403 })
  }

  const role = normalizeClinicRole(membership.role)
  if (!canManageAppointments(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const doctorId = request.nextUrl.searchParams.get('doctorId')?.trim() ?? ''
  const serviceId = request.nextUrl.searchParams.get('serviceId')?.trim() ?? ''
  const date = request.nextUrl.searchParams.get('date')?.trim() ?? ''
  const excludeAppointmentId = request.nextUrl.searchParams.get('excludeAppointmentId')?.trim() ?? ''

  if (!doctorId || !serviceId || !date) {
    return NextResponse.json({ slots: [] })
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  const clinicId = membership.clinicId

  const doctor = await prisma.doctor.findFirst({
    where: {
      id: doctorId,
      clinicId,
      isActive: true,
    },
    select: {
      id: true,
      availabilitySchedule: true,
    },
  })

  if (!doctor) {
    return NextResponse.json({ slots: [] })
  }

  const service = await prisma.service.findFirst({
    where: {
      id: serviceId,
      clinicId,
      isActive: true,
    },
    select: {
      id: true,
      durationMinutes: true,
    },
  })

  if (!service) {
    return NextResponse.json({ slots: [] })
  }

  const dayStart = new Date(`${date}T00:00:00`)
  const dayEnd = new Date(`${date}T23:59:59.999`)

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      clinicId,
      doctorId: doctor.id,
      status: {
        notIn: ['cancelled', 'rescheduled'],
      },
      ...(excludeAppointmentId
        ? {
            id: {
              not: excludeAppointmentId,
            },
          }
        : {}),
      scheduledAt: {
        gte: dayStart,
        lte: dayEnd,
      },
    },
    select: {
      scheduledAt: true,
      durationMinutes: true,
    },
    orderBy: {
      scheduledAt: 'asc',
    },
  })

  const slots = buildDoctorAvailableSlots({
    date,
    durationMinutes: service.durationMinutes,
    scheduleInput: doctor.availabilitySchedule,
    existingAppointments,
    intervalMinutes: 15,
  })

  return NextResponse.json({ slots })
}
