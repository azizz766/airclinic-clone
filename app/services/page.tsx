import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { LogoutButton } from '@/components/LogoutButton'
import { canAccessClinic, canManageServices, normalizeClinicRole } from '@/lib/auth/permissions'

export default async function ServicesPage() {
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
    where: { userId },
  })

  if (!membership) {
    redirect('/onboarding')
  }

  const role = normalizeClinicRole(membership.role)
  if (!canAccessClinic(role)) {
    redirect('/dashboard')
  }

  const canManage = canManageServices(role)

  const services = await prisma.service.findMany({
    where: { clinicId: membership.clinicId },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Services</h1>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-1">
            {canManage ? (
              <div className="overflow-hidden rounded-xl bg-white p-6 shadow">
                <h2 className="text-lg font-semibold text-gray-900">Add Service</h2>
                <form action="/api/services" method="post" className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Name</label>
                    <input
                      name="name"
                      required
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="General Consultation"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Duration (minutes)</label>
                    <input
                      name="durationMinutes"
                      type="number"
                      min="1"
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Price</label>
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      min="0"
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="0"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Add Service
                  </button>
                </form>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl bg-white p-6 shadow">
                <h2 className="text-lg font-semibold text-gray-900">Service Management</h2>
                <p className="mt-3 text-sm text-gray-600">Your role has read-only access on this page.</p>
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="overflow-hidden rounded-xl bg-white shadow">
              {services.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-600">No services yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Duration</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {services.map((service) => (
                        <tr key={service.id}>
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                            {service.name}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                            {service.durationMinutes} min
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                            {service.price != null ? `$${service.price.toFixed(2)}` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
