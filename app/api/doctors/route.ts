import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { canManageDoctors, normalizeClinicRole } from '@/lib/auth/permissions'
import { DEFAULT_DOCTOR_AVAILABILITY, WEEK_DAYS } from '@/lib/doctor-availability'

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value)
}

function toTimeMinutes(value: string) {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

function parseAvailabilityForm(formData: FormData) {
  const startTimeRaw = String(formData.get('startTime') ?? '').trim()
  const endTimeRaw = String(formData.get('endTime') ?? '').trim()

  const startTime = startTimeRaw || DEFAULT_DOCTOR_AVAILABILITY.startTime
  const endTime = endTimeRaw || DEFAULT_DOCTOR_AVAILABILITY.endTime

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return { error: 'Working start and end time must be valid HH:MM values.' as const }
  }

  if (toTimeMinutes(startTime) >= toTimeMinutes(endTime)) {
    return { error: 'Working start time must be earlier than end time.' as const }
  }

  const workingDaysRaw = formData.getAll('workingDays').map((value) => String(value))
  const workingDays = workingDaysRaw.filter((day): day is (typeof WEEK_DAYS)[number] => {
    return WEEK_DAYS.includes(day as (typeof WEEK_DAYS)[number])
  })

  if (workingDays.length === 0) {
    return { error: 'Select at least one working day.' as const }
  }

  const isActiveRaw = String(formData.get('isActive') ?? '').trim().toLowerCase()
  const isActive = isActiveRaw === '1' || isActiveRaw === 'true' || isActiveRaw === 'on'

  return {
    availabilitySchedule: {
      workingDays,
      startTime,
      endTime,
    },
    isActive,
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

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

  const membership = await prisma.membership.findFirst({
    where: { userId },
  })

  if (!membership) {
    return NextResponse.json({ error: 'No clinic access' }, { status: 403 })
  }

  const role = normalizeClinicRole(membership.role)
  if (!canManageDoctors(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const formData = await request.formData()
  const firstName = formData.get('firstName')
  const lastName = formData.get('lastName')
  const specialty = formData.get('specialty')

  if (typeof firstName !== 'string' || !firstName.trim()) {
    return NextResponse.json({ error: 'First name required' }, { status: 400 })
  }

  if (typeof lastName !== 'string' || !lastName.trim()) {
    return NextResponse.json({ error: 'Last name required' }, { status: 400 })
  }

  const availabilityResult = parseAvailabilityForm(formData)
  if ('error' in availabilityResult) {
    return NextResponse.json({ error: availabilityResult.error }, { status: 400 })
  }

  try {
    const doctor = await prisma.doctor.create({
      data: {
        clinicId: membership.clinicId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        specialty: typeof specialty === 'string' ? specialty.trim() || null : null,
        isActive: availabilityResult.isActive,
        availabilitySchedule: availabilityResult.availabilitySchedule,
      },
    })

    return NextResponse.json(doctor)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to add doctor.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

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

  const membership = await prisma.membership.findFirst({
    where: { userId },
  })

  if (!membership) {
    return NextResponse.json({ error: 'No clinic access' }, { status: 403 })
  }

  const role = normalizeClinicRole(membership.role)
  if (!canManageDoctors(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const formData = await request.formData()
  const doctorId = String(formData.get('doctorId') ?? '').trim()

  if (!doctorId) {
    return NextResponse.json({ error: 'Doctor id required' }, { status: 400 })
  }

  const availabilityResult = parseAvailabilityForm(formData)
  if ('error' in availabilityResult) {
    return NextResponse.json({ error: availabilityResult.error }, { status: 400 })
  }

  const doctor = await prisma.doctor.findFirst({
    where: {
      id: doctorId,
      clinicId: membership.clinicId,
    },
    select: { id: true },
  })

  if (!doctor) {
    return NextResponse.json({ error: 'Doctor not found for this clinic' }, { status: 404 })
  }

  try {
    const updatedDoctor = await prisma.doctor.update({
      where: { id: doctor.id },
      data: {
        isActive: availabilityResult.isActive,
        availabilitySchedule: availabilityResult.availabilitySchedule,
      },
    })

    return NextResponse.json(updatedDoctor)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update doctor availability.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
