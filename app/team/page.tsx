import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { LogoutButton } from '@/components/LogoutButton'
import {
  canAccessClinic,
  canManageTeam,
  normalizeClinicRole,
} from '@/lib/auth/permissions'

function formatDate(date: Date | null) {
  if (!date) {
    return '-'
  }

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function TeamPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

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

  const canManage = canManageTeam(role)

  const members = await prisma.membership.findMany({
    where: {
      clinicId: membership.clinicId,
    },
    include: {
      user: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">Team</h1>
              <p className="mt-2 text-sm text-gray-600">Manage clinic users and membership roles</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-1">
            {canManage ? (
              <div className="overflow-hidden rounded-xl bg-white p-6 shadow">
                <h2 className="text-lg font-semibold text-gray-900">Add Team Member</h2>
                <form action="/api/team" method="post" className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                      name="email"
                      type="email"
                      required
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="member@clinic.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Role</label>
                    <select
                      name="role"
                      required
                      defaultValue="receptionist"
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="doctor">doctor</option>
                      <option value="receptionist">receptionist</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Add Member
                  </button>
                </form>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl bg-white p-6 shadow">
                <h2 className="text-lg font-semibold text-gray-900">Team Management</h2>
                <p className="mt-3 text-sm text-gray-600">You can view team members but cannot change roles.</p>
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="overflow-hidden rounded-xl bg-white shadow">
              {members.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-600">No team members found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Joined / Created</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {members.map((member) => {
                        const normalizedRole = normalizeClinicRole(member.role)
                        const joinedDate = member.joinedAt ?? member.invitedAt ?? member.createdAt

                        return (
                          <tr key={member.id}>
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{member.user.email}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{normalizedRole}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{formatDate(joinedDate)}</td>
                            <td className="px-6 py-4 text-sm">
                              {canManage ? (
                                <form action="/api/team" method="post" className="flex items-center gap-2">
                                  <input type="hidden" name="membershipId" value={member.id} />
                                  <select
                                    name="role"
                                    defaultValue={normalizedRole}
                                    className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
                                  >
                                    <option value="owner">owner</option>
                                    <option value="admin">admin</option>
                                    <option value="doctor">doctor</option>
                                    <option value="receptionist">receptionist</option>
                                  </select>
                                  <button
                                    type="submit"
                                    className="rounded-lg bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700"
                                  >
                                    Update
                                  </button>
                                </form>
                              ) : (
                                <span className="text-gray-500">No actions</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
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
