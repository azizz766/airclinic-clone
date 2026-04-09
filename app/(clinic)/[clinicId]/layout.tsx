import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { ClinicSidebar } from '@/components/layouts/ClinicSidebar'
import { normalizeClinicRole } from '@/lib/auth/permissions'

export default async function ClinicLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clinicId: string }>
}) {
  const { clinicId } = await params

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      clinicId,
      isActive: true,
    },
    select: { id: true, role: true },
  })

  if (!membership) {
    const fallbackMembership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        isActive: true,
      },
      select: { clinicId: true },
      orderBy: { createdAt: 'asc' },
    })

    if (fallbackMembership) {
      redirect(`/${fallbackMembership.clinicId}/dashboard`)
    }

    redirect('/onboarding')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-stone-50">
      <ClinicSidebar clinicId={clinicId} role={normalizeClinicRole(membership.role)} />
      {/* Offset for mobile top bar */}
      <main className="flex-1 overflow-y-auto md:pt-0 pt-14">
        {children}
      </main>
    </div>
  )
}
