import { prisma } from './lib/prisma'

const rows = await prisma.notificationJob.findMany({
  orderBy: { createdAt: 'desc' },
  take: 8,
  select: {
    id: true,
    createdAt: true,
    channel: true,
    status: true,
    messageBody: true,
  },
})

console.log(JSON.stringify(rows, null, 2))
await prisma.$disconnect()
