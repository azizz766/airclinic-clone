import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const eq = l.indexOf('=')
      let v = l.slice(eq + 1).trim()
      if (v[0] === '"') v = v.slice(1, -1)
      return [l.slice(0, eq).trim(), v]
    })
)

const SUPABASE_URL = 'https://wmxkjhjcpqcrlaaqllok.supabase.co'
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

// Validate the key looks like a proper 3-part JWT
const parts = SERVICE_ROLE_KEY.split('.')
if (parts.length !== 3) {
  console.error(`FAIL: service_role key has ${parts.length} parts, expected 3`)
  console.error('Key prefix:', SERVICE_ROLE_KEY.slice(0, 40))
  process.exit(1)
}
const payload = JSON.parse(Buffer.from(parts[1] + '==', 'base64').toString())
console.log('Key role:', payload.role)
console.log('Key exp:', new Date(payload.exp * 1000).toISOString())
if (payload.role !== 'service_role') {
  console.error('FAIL: key is not service_role')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const USER_ID = '9312c1e9-84a5-47fe-bbda-0177072534c5'
const NEW_PASSWORD = 'Aziz@2026'

console.log('\nAttempting admin password reset for user:', USER_ID)

const { data, error } = await supabase.auth.admin.updateUserById(USER_ID, {
  password: NEW_PASSWORD
})

if (error) {
  console.error('FAIL:', error.message)
  console.error('Status:', error.status)
  process.exit(1)
}

console.log('SUCCESS: Password updated')
console.log('User email:', data.user.email)
console.log('User id:', data.user.id)
