import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import {
  canManageTeam,
  isClinicRole,
  normalizeClinicRole,
  toMembershipRole,
} from '@/lib/auth/permissions'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const actorUserId = session.user.id
  const actorEmail = session.user.email ?? ''

  await prisma.user.upsert({
    where: { id: actorUserId },
    update: { email: actorEmail },
    create: {
      id: actorUserId,
      email: actorEmail,
      passwordHash: '',
    },
  })

  const actorMembership = await prisma.membership.findFirst({
    where: { userId: actorUserId },
  })

  if (!actorMembership) {
    return NextResponse.json({ error: 'No clinic access' }, { status: 403 })
  }

  const actorRole = normalizeClinicRole(actorMembership.role)
  if (!canManageTeam(actorRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const formData = await request.formData()
  const membershipId = formData.get('membershipId')
  const roleInput = formData.get('role')

  if (typeof roleInput !== 'string' || !isClinicRole(roleInput)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const dbRole = toMembershipRole(roleInput)

  if (typeof membershipId === 'string' && membershipId.trim()) {
    const targetMembership = await prisma.membership.findFirst({
      where: {
        id: membershipId,
        clinicId: actorMembership.clinicId,
      },
    })

    if (!targetMembership) {
      return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
    }

    if (targetMembership.role === 'owner' && dbRole !== 'owner') {
      const ownerCount = await prisma.membership.count({
        where: {
          clinicId: actorMembership.clinicId,
          role: 'owner',
          isActive: true,
        },
      })

      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot remove the last owner from the clinic.' },
          { status: 400 }
        )
      }
    }

    const updatedMembership = await prisma.membership.update({
      where: { id: targetMembership.id },
      data: {
        role: dbRole,
      },
      include: {
        user: true,
      },
    })

    return NextResponse.json(updatedMembership)
  }

  const emailInput = formData.get('email')
  if (typeof emailInput !== 'string' || !emailInput.trim()) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const normalizedEmail = emailInput.trim().toLowerCase()

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {},
    create: {
      email: normalizedEmail,
      passwordHash: '',
    },
  })

  const existingMembership = await prisma.membership.findFirst({
    where: {
      clinicId: actorMembership.clinicId,
      userId: user.id,
    },
  })

  if (existingMembership) {
    return NextResponse.json({ error: 'User is already a member of this clinic.' }, { status: 409 })
  }

  const createdMembership = await prisma.membership.create({
    data: {
      clinicId: actorMembership.clinicId,
      userId: user.id,
      role: dbRole,
      invitedBy: actorUserId,
      invitedAt: new Date(),
    },
    include: {
      user: true,
    },
  })

  return NextResponse.json(createdMembership)
}
