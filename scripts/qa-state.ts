import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { PrismaClient } from '../lib/prisma-client/client'
import { PrismaPg } from '@prisma/adapter-pg'
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const CLINIC_ID = 'cmnkmp2h40000dq9kj4vgb2tu'
const PHONES = ['+966099990001', '+966099990002']
async function main() {
  const sessions = await prisma.conversationSession.findMany({
    where: { clinicId: CLINIC_ID, phoneNumber: { in: PHONES } },
    select: {
      id: true, phoneNumber: true, currentState: true, handoffActive: true,
      slotServiceId: true, slotDate: true, slotTimeId: true,
      slotPatientName: true, slotPatientDob: true, slotPhoneConfirmed: true,
      retryCount: true, ambiguousIntents: true, bookingId: true,
      createdAt: true, updatedAt: true,
    }
  })
  console.log('SESSIONS:', JSON.stringify(sessions, null, 2))

  for (const s of sessions) {
    const msgs = await prisma.conversationMessage.findMany({
      where: { sessionId: s.id },
      select: { role: true, content: true, sessionStateAtSend: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    })
    console.log(`\nMESSAGES for ${s.phoneNumber}:`)
    msgs.forEach(m => console.log(`  [${m.role}] [${m.sessionStateAtSend}] ${m.content.substring(0, 80)}`))

    const transitions = await prisma.stateTransitionLog.findMany({
      where: { sessionId: s.id },
      select: { fromState: true, toState: true, triggerType: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    })
    console.log(`\nSTATE TRANSITIONS for ${s.phoneNumber}:`)
    transitions.forEach(t => console.log(`  ${t.fromState} -> ${t.toState} [${t.triggerType}]`))
  }
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
