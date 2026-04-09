import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { LogoutButton } from '@/components/LogoutButton'
import { DoctorForm } from '@/components/DoctorForm'
import { canAccessClinic, canManageDoctors, normalizeClinicRole } from '@/lib/auth/permissions'
import { formatDoctorAvailability } from '@/lib/doctor-availability'

export default async function DoctorsPage() {
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

  const canManage = canManageDoctors(role)

  const doctors = await prisma.doctor.findMany({
    where: { clinicId: membership.clinicId },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Doctors</h1>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-1">
            {canManage ? (
              <DoctorForm
                doctors={doctors.map((doctor) => ({
                  id: doctor.id,
                  firstName: doctor.firstName,
                  lastName: doctor.lastName,
                  isActive: doctor.isActive,
                  availabilitySchedule: doctor.availabilitySchedule,
                }))}
              />
            ) : (
              <div className="overflow-hidden rounded-xl bg-white p-6 shadow">
                <h2 className="text-lg font-semibold text-gray-900">Doctor Management</h2>
                <p className="mt-3 text-sm text-gray-600">Your role has read-only access on this page.</p>
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="overflow-hidden rounded-xl bg-white shadow">
              {doctors.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-600">No doctors yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Specialty</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Availability</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {doctors.map((doctor) => (
                        <tr key={doctor.id}>
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                            {doctor.firstName} {doctor.lastName}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {doctor.specialty || '-'}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${doctor.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}
                            >
                              {doctor.isActive ? 'active' : 'inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {formatDoctorAvailability(doctor.availabilitySchedule)}
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
