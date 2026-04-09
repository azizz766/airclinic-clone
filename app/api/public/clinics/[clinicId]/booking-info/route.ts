import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const { clinicId } = await params

    if (!clinicId || typeof clinicId !== 'string') {
      return NextResponse.json({ error: 'Invalid clinic' }, { status: 400 })
    }

    // Verify clinic exists and is active
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, isActive: true },
    })

    if (!clinic || !clinic.isActive) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 })
    }

    // Get active services
    const services = await prisma.service.findMany({
      where: {
        clinicId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        durationMinutes: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    // Get active doctors
    const doctors = await prisma.doctor.findMany({
      where: {
        clinicId,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    return NextResponse.json({
      services,
      doctors,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load clinic data'
    console.error('[PUBLIC_BOOKING_INFO]', { message, error })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
