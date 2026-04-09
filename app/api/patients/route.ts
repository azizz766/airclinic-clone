import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { canManagePatients, normalizeClinicRole } from '@/lib/auth/permissions'

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
  if (!canManagePatients(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const formData = await request.formData()
  const firstName = formData.get('firstName')
  const lastName = formData.get('lastName')
  const phone = formData.get('phone')
  const email_input = formData.get('email')
  const notes = formData.get('notes')

  if (typeof firstName !== 'string' || !firstName.trim()) {
    return NextResponse.json({ error: 'First name required' }, { status: 400 })
  }

  if (typeof lastName !== 'string' || !lastName.trim()) {
    return NextResponse.json({ error: 'Last name required' }, { status: 400 })
  }

  const patient = await prisma.patient.create({
    data: {
      clinicId: membership.clinicId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: typeof phone === 'string' ? phone.trim() || null : null,
      email: typeof email_input === 'string' ? email_input.trim() || null : null,
      notes: typeof notes === 'string' ? notes.trim() || null : null,
    },
  })

  return NextResponse.json(patient)
}
