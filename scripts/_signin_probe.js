require('dotenv').config()

const { Client } = require('pg')
const { createClient } = require('@supabase/supabase-js')

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  const candidate = await db.query(
    `
      select id, email
      from auth.users
      where email is not null
        and deleted_at is null
        and email not like 'reschedule.sql.%@example.com'
      order by created_at asc
      limit 1
    `
  )

  if (!candidate.rows[0]) {
    throw new Error('No candidate auth user found')
  }

  const { id, email } = candidate.rows[0]
  const password = 'Temp#12345678'

  await db.query(
    `
      update auth.users
      set encrypted_password = crypt($1, gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = $2
    `,
    [password, id]
  )

  await db.end()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const signIn = await supabase.auth.signInWithPassword({ email, password })

  console.log(
    JSON.stringify(
      {
        candidateId: id,
        emailMasked: email.replace(/^[^@]+/, '***'),
        user: Boolean(signIn.data.user),
        session: Boolean(signIn.data.session),
        error: signIn.error ? signIn.error.message : null,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
