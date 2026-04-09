import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const envBase = Object.fromEntries(
  readFileSync(join(__dirname, '..', '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const eq = l.indexOf('=')
      let v = l.slice(eq + 1).trim()
      if (v[0] === '"') v = v.slice(1, -1)
      return [l.slice(0, eq).trim(), v]
    })
)

const EMAIL = 'azizyt1991@gmail.com'
const PASSWORD = 'Aziz@2026'

const supabase = createClient(envBase.NEXT_PUBLIC_SUPABASE_URL, envBase.NEXT_PUBLIC_SUPABASE_ANON_KEY)

console.log('Testing signInWithPassword for', EMAIL)
const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })

if (error) {
  console.error('FAIL:', error.message)
  process.exit(1)
}

console.log('SUCCESS: Signed in')
console.log('User id:', data.user.id)
console.log('User email:', data.user.email)
console.log('Session expires:', new Date(data.session.expires_at * 1000).toISOString())
