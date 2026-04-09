import { validateRequest } from 'twilio'
import { NextRequest } from 'next/server'

function normalizeTwilioUrl(url: string): string {
  return url.replace(/\/$/, '')
}

function buildTwilioUrlCandidates(req: NextRequest): string[] {
  const candidates = new Set<string>()
  const requestUrl = new URL(req.url)
  const normalizedPath = `${requestUrl.pathname.replace(/\/$/, '')}${requestUrl.search}`

  // Candidate 1: direct request URL.
  candidates.add(normalizeTwilioUrl(requestUrl.toString()))

  // Candidate 2: force https on the same origin for setups where internal request scheme is rewritten to http.
  if (requestUrl.protocol !== 'https:') {
    candidates.add(normalizeTwilioUrl(`https://${requestUrl.host}${normalizedPath}`))
  }

  // Candidate 3: optional explicit public callback URL for proxy/domain rewrites.
  const configuredPublicUrl = process.env.PUBLIC_WEBHOOK_URL?.trim()
  if (configuredPublicUrl) {
    const normalizedConfigured = normalizeTwilioUrl(configuredPublicUrl)
    candidates.add(normalizedConfigured)

    // Also tolerate scheme-only mismatch when host/path are identical.
    const configuredUrl = new URL(normalizedConfigured)
    if (configuredUrl.protocol !== 'https:') {
      candidates.add(normalizeTwilioUrl(`https://${configuredUrl.host}${configuredUrl.pathname}${configuredUrl.search}`))
    }
  }

  return Array.from(candidates)
}

export function verifyTwilioSignature(req: NextRequest, rawBody: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? ''

  if (!authToken) {
    console.error('[WEBHOOK] Misconfiguration: TWILIO_AUTH_TOKEN is not set')
    return false
  }

  const signature = req.headers.get('x-twilio-signature') ?? ''
  const params: Record<string, string> = {}
  new URLSearchParams(rawBody).forEach((value, key) => { params[key] = value })

  const candidateUrls = buildTwilioUrlCandidates(req)
  if (candidateUrls.length === 0) {
    console.error('[WEBHOOK] Misconfiguration: could not derive webhook URL candidates for signature validation')
    return false
  }

  return candidateUrls.some((candidateUrl) => validateRequest(authToken, signature, candidateUrl, params))
}
