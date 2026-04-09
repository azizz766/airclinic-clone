require('dotenv').config()

const { Client } = require('pg')
const { createClient } = require('@supabase/supabase-js')
const { randomUUID } = require('crypto')

async function main() {
  const email = `reschedule.sql.${Date.now()}@example.com`
  const password = 'Temp#12345678'
  const id = randomUUID()

  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  await db.query(
    `
      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        $1,
        'authenticated',
        'authenticated',
        $2,
        crypt($3, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        now(),
        now()
      )
    `,
    [id, email, password]
  )

  await db.query(
    `
      insert into auth.identities (
        provider_id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      )
      values (
        $1::text,
        $2::uuid,
        jsonb_build_object('sub', $3::text, 'email', $1::text, 'email_verified', true),
        'email',
        now(),
        now(),
        now()
      )
    `,
    [email, id, id]
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
        email,
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
