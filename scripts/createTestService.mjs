import { prisma } from '../lib/prisma.ts'

async function main() {
  const clinic = await prisma.clinic.findFirst()

  if (!clinic) {
    throw new Error('No clinic found')
  }

  const service = await prisma.service.create({
    data: {
      clinicId: clinic.id,
      name: 'Test Service',
      durationMinutes: 30,
      isActive: true
    }
  })

  console.log('✅ Service created:', service.id)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
