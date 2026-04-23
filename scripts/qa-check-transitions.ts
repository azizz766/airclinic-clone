import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { PrismaClient } from '../lib/prisma-client/client'
import { PrismaPg } from '@prisma/adapter-pg'
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

async function main() {
  const logs = await prisma.stateTransitionLog.findMany({
    where: { triggerType: { contains: 'ESCALATION' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { fromState: true, toState: true, triggerType: true, createdAt: true },
  })
  console.log('Recent escalation transition logs:')
  logs.forEach(l => console.log(`  ${l.fromState} → ${l.toState} [${l.triggerType}] at ${l.createdAt.toISOString()}`))
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
