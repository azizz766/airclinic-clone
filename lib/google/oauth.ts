import { google } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/calendar.events']

const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
const REDIRECT_URI = `${appUrl}/api/integrations/google-calendar/callback`

export function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI,
  )
}

export function getAuthUrl(state: string): string {
  const client = buildOAuthClient()
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state,
  })

  if (process.env.NODE_ENV === 'development') {
    const parsed = new URL(url)
    console.log('[google-oauth] redirect_uri:', REDIRECT_URI)
    console.log('[google-oauth] scope:', parsed.searchParams.get('scope'))
    console.log('[google-oauth] client_id:', parsed.searchParams.get('client_id')?.slice(0, 12) + '...')
    console.log('[google-oauth] auth url:', url)
  }

  return url
}

export async function exchangeCode(code: string) {
  const client = buildOAuthClient()
  const { tokens } = await client.getToken(code)
  return tokens
}

export async function revokeToken(accessToken: string) {
  const client = buildOAuthClient()
  await client.revokeToken(accessToken)
}
