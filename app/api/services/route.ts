import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { canManageServices, normalizeClinicRole } from '@/lib/auth/permissions'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const email = session.user.email ?? ''

  await prisma.user.upsert({
    where: { id: userId },
    update: { email },
    create: {
      id: userId,
      email,
      passwordHash: '',
    },
  })

  const membership = await prisma.membership.findFirst({
    where: { userId },
  })

  if (!membership) {
    return NextResponse.json({ error: 'No clinic access' }, { status: 403 })
  }

  const role = normalizeClinicRole(membership.role)
  if (!canManageServices(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const formData = await request.formData()
  const name = formData.get('name')
  const durationMinutes = formData.get('durationMinutes')
  const price = formData.get('price')

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Service name required' }, { status: 400 })
  }

  const duration = typeof durationMinutes === 'string' && durationMinutes.trim()
    ? Number(durationMinutes)
    : 30

  if (typeof durationMinutes === 'string' && durationMinutes.trim() && Number.isNaN(duration)) {
    return NextResponse.json({ error: 'Invalid duration' }, { status: 400 })
  }

  const parsedPrice = typeof price === 'string' && price.trim()
    ? Number(price)
    : null

  if (typeof price === 'string' && price.trim() && Number.isNaN(parsedPrice)) {
    return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
  }

  const service = await prisma.service.create({
    data: {
      clinicId: membership.clinicId,
      name: name.trim(),
      durationMinutes: duration,
      price: parsedPrice,
    },
  })

  return NextResponse.json(service)
}
