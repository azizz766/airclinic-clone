import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

function buildSlug(name: string) {
  const cleaned = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return `${cleaned || 'clinic'}-${Math.floor(Date.now() / 1000)}`
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const formData = await request.formData()
  const name = formData.get('name')

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
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

  const clinic = await prisma.clinic.create({
    data: {
      name: name.trim(),
      slug: buildSlug(name),
      email,
    },
  })

  await prisma.membership.create({
    data: {
      userId,
      clinicId: clinic.id,
      role: 'owner',
      isActive: true,
    },
  })

  return NextResponse.redirect(new URL(`/${clinic.id}/dashboard`, request.url))
}
