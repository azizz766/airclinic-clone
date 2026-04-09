import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { LogoutButton } from '@/components/LogoutButton'
import { canAccessClinic, canManagePatients, normalizeClinicRole } from '@/lib/auth/permissions'

export default async function PatientsPage() {
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

  const canManage = canManagePatients(role)

  const patients = await prisma.patient.findMany({
    where: { clinicId: membership.clinicId },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Patients
            </h1>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Form */}
          <div className="md:col-span-1">
            {canManage ? (
              <div className="overflow-hidden rounded-xl bg-white p-6 shadow">
                <h2 className="text-lg font-semibold text-gray-900">Add Patient</h2>
                <form action="/api/patients" method="post" className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      First Name
                    </label>
                    <input
                      name="firstName"
                      required
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Last Name
                    </label>
                    <input
                      name="lastName"
                      required
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Email
                    </label>
                    <input
                      name="email"
                      type="email"
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="john@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Phone
                    </label>
                    <input
                      name="phone"
                      type="tel"
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Notes
                    </label>
                    <textarea
                      name="notes"
                      rows={3}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Additional notes..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Add Patient
                  </button>
                </form>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl bg-white p-6 shadow">
                <h2 className="text-lg font-semibold text-gray-900">Patient Management</h2>
                <p className="mt-3 text-sm text-gray-600">Your role has read-only access on this page.</p>
              </div>
            )}
          </div>

          {/* Patient List */}
          <div className="md:col-span-2">
            <div className="overflow-hidden rounded-xl bg-white shadow">
              {patients.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-600">No patients yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                          Phone
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {patients.map((patient) => (
                        <tr key={patient.id}>
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                            {patient.firstName} {patient.lastName}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                            {patient.email || '-'}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                            {patient.phone || '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            <div className="max-w-xs truncate">
                              {patient.notes || '-'}
                            </div>
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
