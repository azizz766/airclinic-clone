import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { normalizeClinicRole, canAccessClinicSettings } from '@/lib/auth/permissions'
import { exchangeCode } from '@/lib/google/oauth'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    console.warn('[google-calendar/callback] OAuth error from Google:', error)
    return NextResponse.redirect(
      new URL('/api/integrations/google-calendar/callback?gcal_error=access_denied', request.url)
        .toString()
        .replace('/api/integrations/google-calendar/callback', '') +
        `/${encodeURIComponent('settings/integrations')}?gcal_error=access_denied`,
    )
  }

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const raw = cookieStore.get('google_oauth_state')?.value
  if (!raw) {
    return NextResponse.json({ error: 'OAuth state cookie missing or expired' }, { status: 400 })
  }

  let oauthState: { clinicId: string; nonce: string }
  try {
    oauthState = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid OAuth state cookie' }, { status: 400 })
  }

  if (oauthState.nonce !== state) {
    console.warn('[google-calendar/callback] CSRF nonce mismatch')
    return NextResponse.json({ error: 'State mismatch' }, { status: 400 })
  }

  cookieStore.set('google_oauth_state', '', { maxAge: 0, path: '/' })

  const { clinicId } = oauthState

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, clinicId, isActive: true },
    select: { role: true },
  })

  if (!membership || !canAccessClinicSettings(normalizeClinicRole(membership.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tokens = await exchangeCode(code)

  if (!tokens.access_token || !tokens.refresh_token) {
    console.warn('[google-calendar/callback] Token exchange returned incomplete tokens', {
      hasAccess: !!tokens.access_token,
      hasRefresh: !!tokens.refresh_token,
    })
    return NextResponse.json({ error: 'Incomplete tokens from Google' }, { status: 502 })
  }

  const tokenExpiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 3600 * 1000)

  await prisma.googleCalendarConnection.upsert({
    where: { clinicId },
    create: {
      clinicId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt,
      connectedByUserId: session.user.id,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt,
      connectedByUserId: session.user.id,
    },
  })

  return NextResponse.redirect(
    new URL(`/${clinicId}/settings/integrations?gcal_connected=1`, request.url),
  )
}
