import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { normalizeClinicRole, canAccessClinicSettings } from '@/lib/auth/permissions'
import { getAuthUrl } from '@/lib/google/oauth'

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

  const nonce = crypto.randomUUID()
  const cookieStore = await cookies()
  cookieStore.set('google_oauth_state', JSON.stringify({ clinicId, nonce }), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600, // 10 min
    path: '/',
  })

  return NextResponse.redirect(getAuthUrl(nonce))
}
