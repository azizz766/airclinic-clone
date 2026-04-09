import { resolveSession } from '@/lib/whatsapp/session'

async function main() {
  const result = await resolveSession('+966599994144', 'cmnkmp2h40000dq9kj4vgb2tu')
  console.log('Session created:', result.id, result.currentState)
}

main().catch(e => { console.error('Error:', e.message, e.code); process.exit(1) })
