import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { LogoutButton } from '@/components/LogoutButton'
import { normalizeClinicRole } from '@/lib/auth/permissions'

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateTime(date: Date) {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function appointmentStatusBadgeClasses(status: string) {
  if (status === 'scheduled') return 'bg-blue-100 text-blue-800'
  if (status === 'confirmed') return 'bg-green-100 text-green-800'
  if (status === 'in_progress') return 'bg-yellow-100 text-yellow-800'
  if (status === 'completed') return 'bg-gray-100 text-gray-800'
  if (status === 'cancelled') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-800'
}

function notificationStatusBadgeClasses(status: string) {
  if (status === 'pending') return 'bg-amber-100 text-amber-800'
  if (status === 'queued') return 'bg-blue-100 text-blue-800'
  if (status === 'sent') return 'bg-green-100 text-green-800'
  if (status === 'failed') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-800'
}

export default async function DashboardPage() {
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

  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  const [
    totalPatients,
    totalDoctors,
    totalServices,
    upcomingAppointmentsCount,
    pendingRemindersCount,
    pendingNotificationJobsCount,
    todaysAppointments,
    upcomingReminderJobs,
  ] = await Promise.all([
    prisma.patient.count({
      where: { clinicId: membership.clinicId },
    }),
    prisma.doctor.count({
      where: { clinicId: membership.clinicId },
    }),
    prisma.service.count({
      where: { clinicId: membership.clinicId },
    }),
    prisma.appointment.count({
      where: {
        clinicId: membership.clinicId,
        scheduledAt: { gte: now },
        status: {
          notIn: ['completed', 'cancelled', 'no_show'],
        },
      },
    }),
    prisma.reminder.count({
      where: {
        clinicId: membership.clinicId,
        status: 'pending',
      },
    }),
    prisma.notificationJob.count({
      where: {
        clinicId: membership.clinicId,
        status: 'pending',
      },
    }),
    prisma.appointment.findMany({
      where: {
        clinicId: membership.clinicId,
        scheduledAt: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
      include: {
        patient: true,
        doctor: true,
        service: true,
      },
      orderBy: {
        scheduledAt: 'asc',
      },
      take: 20,
    }),
    prisma.notificationJob.findMany({
      where: {
        clinicId: membership.clinicId,
        scheduledFor: { gte: now },
      },
      include: {
        patient: true,
      },
      orderBy: {
        scheduledFor: 'asc',
      },
      take: 20,
    }),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                Operations Dashboard
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Signed in as {session.user.email}
              </p>
              <p className="mt-1 text-sm text-gray-600">Role: {role}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl bg-white p-5 shadow">
              <p className="text-sm text-gray-600">Total Patients</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{totalPatients}</p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow">
              <p className="text-sm text-gray-600">Total Doctors</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{totalDoctors}</p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow">
              <p className="text-sm text-gray-600">Total Services</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{totalServices}</p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow">
              <p className="text-sm text-gray-600">Upcoming Appointments</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{upcomingAppointmentsCount}</p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow">
              <p className="text-sm text-gray-600">Pending Reminders</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{pendingRemindersCount}</p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow">
              <p className="text-sm text-gray-600">Pending Notification Jobs</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{pendingNotificationJobsCount}</p>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl bg-white shadow">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Today&apos;s Appointments</h2>
            </div>

            {todaysAppointments.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-600">No appointments scheduled for today.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Patient</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Doctor</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Service</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {todaysAppointments.map((appointment) => (
                      <tr key={appointment.id}>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                          {appointment.patient.firstName} {appointment.patient.lastName}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                          {appointment.doctor.firstName} {appointment.doctor.lastName}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{appointment.service.name}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{formatTime(appointment.scheduledAt)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${appointmentStatusBadgeClasses(appointment.status)}`}>
                            {appointment.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl bg-white shadow">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Upcoming Reminders</h2>
            </div>

            {upcomingReminderJobs.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-600">No upcoming reminders.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Patient</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Channel</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Scheduled For</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {upcomingReminderJobs.map((job) => (
                      <tr key={job.id}>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                          {job.patient.firstName} {job.patient.lastName}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{job.channel}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{formatDateTime(job.scheduledFor)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${notificationStatusBadgeClasses(job.status)}`}>
                            {job.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Link
                href="/patients"
                className="block rounded-lg bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Add Patient
              </Link>
              <Link
                href="/doctors"
                className="block rounded-lg bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Add Doctor
              </Link>
              <Link
                href="/services"
                className="block rounded-lg bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Add Service
              </Link>
              <Link
                href="/appointments"
                className="block rounded-lg bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Schedule Appointment
              </Link>
              <Link
                href={`/${membership.clinicId}/reminders`}
                className="block rounded-lg bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                View Reminders
              </Link>
              <Link
                href="/team"
                className="block rounded-lg bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Manage Team
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}