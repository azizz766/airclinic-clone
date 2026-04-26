import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { normalizeClinicRole, canAccessClinicSettings } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clinicId = request.nextUrl.searchParams.get('clinicId')
  if (!clinicId) {
    return NextResponse.json({ error: 'clinicId required' }, { status: 400 })
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, clinicId, isActive: true },
    select: { role: true },
  })

  if (!membership || !canAccessClinicSettings(normalizeClinicRole(membership.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { clinicId },
    select: { calendarId: true, createdAt: true },
  })

  if (!connection) {
    return NextResponse.json({ connected: false })
  }

  return NextResponse.json({
    connected: true,
    calendarId: connection.calendarId,
    connectedAt: connection.createdAt.toISOString(),
  })
}
