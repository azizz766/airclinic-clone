import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isDateWithinDoctorAvailability } from '@/lib/doctor-availability'
import { buildDoctorAvailableSlots } from '@/lib/doctor-availability'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const { clinicId } = await params
    const { searchParams } = new URL(request.url)

    if (!clinicId || typeof clinicId !== 'string') {
      return NextResponse.json({ error: 'Invalid clinic' }, { status: 400 })
    }

    const serviceId = searchParams.get('serviceId')
    const doctorId = searchParams.get('doctorId')

    if (!serviceId) {
      return NextResponse.json({ error: 'Service required' }, { status: 400 })
    }

    // Verify clinic exists and is active
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, isActive: true },
    })

    if (!clinic || !clinic.isActive) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 })
    }

    // Verify service
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
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }

    // Get doctor(s)
    let doctors
    if (doctorId) {
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
        return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
      }

      doctors = [doctor]
    } else {
      doctors = await prisma.doctor.findMany({
        where: {
          clinicId,
          isActive: true,
        },
        select: {
          id: true,
          availabilitySchedule: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 1,
      })

      if (doctors.length === 0) {
        return NextResponse.json({ error: 'No doctors available' }, { status: 404 })
      }
    }

    // Generate slots for the next 14 days
    const slots: Array<{ isoDateTime: string; label: string }> = []
    const now = new Date()
    const seenDates = new Set<string>()

    for (let dayOffset = 0; dayOffset < 14 && slots.length < 20; dayOffset += 1) {
      const day = new Date(now)
      day.setDate(now.getDate() + dayOffset)
      const dateKey = day.toISOString().slice(0, 10)

      if (seenDates.has(dateKey)) continue
      seenDates.add(dateKey)

      const dayStart = new Date(`${dateKey}T00:00:00Z`)
      const dayEnd = new Date(`${dateKey}T23:59:59.999Z`)

      for (const doctor of doctors) {
        // Get existing appointments for this doctor on this day
        const existingAppointments = await prisma.appointment.findMany({
          where: {
            clinicId,
            doctorId: doctor.id,
            NOT: { status: 'cancelled' },
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

        // Build available slots
        const daySlots = buildDoctorAvailableSlots({
          date: dateKey,
          durationMinutes: service.durationMinutes,
          scheduleInput: doctor.availabilitySchedule,
          existingAppointments,
          intervalMinutes: 15,
        })

        for (const slot of daySlots) {
          const slotDate = new Date(`${dateKey}T${slot}:00`)
          if (slotDate > now) {
            const label = slotDate.toLocaleString('ar-SA', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })

            slots.push({
              isoDateTime: slotDate.toISOString(),
              label,
            })

            if (slots.length >= 20) break
          }
        }

        if (slots.length >= 20) break
      }
    }

    return NextResponse.json({
      slots: slots.slice(0, 20),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load slots'
    console.error('[PUBLIC_AVAILABLE_SLOTS]', { message, error })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
