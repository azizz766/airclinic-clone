import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ── Rate Limiting Store (Edge-compatible) ─────────────────────────────────────
// Uses a Map in Edge memory — resets on cold start, sufficient for burst protection
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()

const RATE_LIMIT_RULES: Record<string, { maxRequests: number; windowMs: number }> = {
  '/api/whatsapp/webhook': { maxRequests: 20, windowMs: 60_000 },  // 20 msgs/min per IP
  '/api/whatsapp/test':    { maxRequests: 10, windowMs: 60_000 },  // 10 reqs/min per IP
  '/api/cron':             { maxRequests: 5,  windowMs: 60_000 },  // cron only
}

function getRateLimitRule(pathname: string) {
  for (const [route, rule] of Object.entries(RATE_LIMIT_RULES)) {
    if (pathname.startsWith(route)) return rule
  }
  return null
}

function isRateLimited(key: string, rule: { maxRequests: number; windowMs: number }): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now - entry.windowStart > rule.windowMs) {
    rateLimitMap.set(key, { count: 1, windowStart: now })
    return false
  }

  if (entry.count >= rule.maxRequests) {
    return true
  }

  entry.count++
  return false
}

// ─────────────────────────────────────────────────────────────────────────────

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Auth callback — always allow ──────────────────────────────────────────
  if (pathname.startsWith('/auth/callback')) {
    return NextResponse.next()
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const rule = getRateLimitRule(pathname)
  if (rule) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown'
    const key = `${ip}:${pathname}`

    if (isRateLimited(key, rule)) {
      console.warn('[middleware] rate-limit-exceeded', { ip, pathname })
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(rule.windowMs / 1000)),
          'Content-Type': 'text/plain',
        },
      })
    }
  }

  // ── Auth boundary ─────────────────────────────────────────────────────────
  const protectedPrefixes = [
    '/appointments',
    '/dashboard',
    '/doctors',
    '/onboarding',
    '/patients',
    '/services',
    '/team',
  ]

  const protectedClinicPattern = /^\/[^/]+\/(activity|appointments|campaigns|conversations|dashboard|doctors|inbox|notifications|patients|reminders|services|settings)/

  const isProtected =
    protectedPrefixes.some((p) => pathname.startsWith(p)) ||
    protectedClinicPattern.test(pathname)

  if (isProtected) {
    const token = req.cookies.getAll()
      .find(c => c.name.startsWith('sb-wmxkjhjcpqcrlaaqllok-auth-token'))?.value

    if (!token) {
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Supabase session refresh ───────────────────────────────────────────────
  const res = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )
  await supabase.auth.getSession()
  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
