import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
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
    where: {
      userId,
      isActive: true,
    },
    select: {
      clinicId: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  if (membership) {
    redirect(`/${membership.clinicId}/dashboard`)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Clinic Onboarding</h1>
        <p className="mt-2 text-sm text-gray-600">
          Create your first clinic to access the dashboard.
        </p>
        <form action="/api/onboarding" method="post" className="mt-6 space-y-5">
          <label className="block text-sm font-medium text-gray-700">
            Clinic name
            <input
              name="name"
              required
              className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              placeholder="Example Clinic"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Create clinic and continue
          </button>
        </form>
      </div>
    </div>
  )
}
