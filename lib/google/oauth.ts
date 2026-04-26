import { google } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/calendar.events']

export function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/api/integrations/google-calendar/callback`,
  )
}

export function getAuthUrl(state: string): string {
  const client = buildOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state,
  })
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
