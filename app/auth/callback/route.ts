import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Supabase auth redirect handler.
 *
 * Supabase emails (email confirmation, password reset) redirect here with:
 *   ?code=<PKCE auth code>&type=<recovery|signup|...>
 *
 * This handler:
 *   1. Exchanges the code for a session (sets auth cookies on the response).
 *   2. For type=recovery → redirects to /reset-password so the user can set a new password.
 *   3. For all other types (email confirm, magic link, etc.) → redirects to /dashboard.
 *   4. On any error → redirects to /login?error=auth_callback_failed.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type') // 'recovery' | 'signup' | 'magiclink' | etc.
  const next = searchParams.get('next') // optional downstream redirect hint

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  }

  const redirectTo =
    type === 'recovery'
      ? `${origin}/reset-password`
      : next ?? `${origin}/dashboard`

  const response = NextResponse.redirect(redirectTo)

  // Build a server client that writes cookies onto the redirect response.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  }

  return response
}
