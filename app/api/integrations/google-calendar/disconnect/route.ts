import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { normalizeClinicRole, canAccessClinicSettings } from '@/lib/auth/permissions'
import { revokeToken } from '@/lib/google/oauth'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as { clinicId?: string }
  const clinicId = body.clinicId
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
    select: { accessToken: true },
  })

  if (!connection) {
    return NextResponse.json({ error: 'Not connected' }, { status: 404 })
  }

  // Best-effort revoke — if Google rejects it the local record is still deleted
  await revokeToken(connection.accessToken).catch((err) => {
    console.warn('[google-calendar/disconnect] Token revoke failed (continuing):', err?.message)
  })

  await prisma.googleCalendarConnection.delete({ where: { clinicId } })

  return NextResponse.json({ ok: true })
}
