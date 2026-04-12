import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { LogoutButton } from '@/components/LogoutButton'
import { AppointmentForm } from '@/components/AppointmentForm'
import { AppointmentStatusControl } from '@/components/AppointmentStatusControl'
import {
  canAccessClinic,
  canManageAppointments,
  canUpdateAppointmentStatus,
  normalizeClinicRole,
} from '@/lib/auth/permissions'

function formatDateHeading(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

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

function statusBadgeClasses(status: string) {
  if (status === 'scheduled') return 'bg-blue-100 text-blue-800'
  if (status === 'confirmation_pending') return 'bg-amber-100 text-amber-800'
  if (status === 'confirmed') return 'bg-green-100 text-green-800'
  if (status === 'in_progress') return 'bg-yellow-100 text-yellow-800'
  if (status === 'completed') return 'bg-gray-100 text-gray-800'
  if (status === 'cancelled') return 'bg-red-100 text-red-800'
  if (status === 'rescheduled') return 'bg-purple-100 text-purple-800'
  return 'bg-gray-100 text-gray-800'
}

function reminderStatusBadgeClasses(status: string) {
  if (status === 'pending') return 'bg-amber-100 text-amber-800'
  if (status === 'sent') return 'bg-green-100 text-green-800'
  if (status === 'failed') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-800'
}

function notificationStatusBadgeClasses(status: string) {
  if (status === 'pending') return 'bg-amber-100 text-amber-800'
  if (status === 'queued') return 'bg-blue-100 text-blue-800'
  if (status === 'sent') return 'bg-green-100 text-green-800'
  if (status === 'failed') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-800'
}

export const dynamic = 'force-dynamic'

export default async function AppointmentsPage() {
  noStore()
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

  const canManage = canManageAppointments(role)
  const canUpdateStatus = canUpdateAppointmentStatus(role)

  const appointments = await prisma.appointment.findMany({
    where: { clinicId: membership.clinicId },
    include: {
      patient: true,
      doctor: true,
      service: true,
    },
    orderBy: { scheduledAt: 'asc' },
  })

  const groupedByDate = appointments.reduce<Record<string, typeof appointments>>((acc, appointment) => {
    const key = appointment.scheduledAt.toISOString().slice(0, 10)
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(appointment)
    return acc
  }, {})

  const groupedDates = Object.keys(groupedByDate)

  const patients = await prisma.patient.findMany({
    where: { clinicId: membership.clinicId },
    orderBy: { firstName: 'asc' },
  })

  const doctors = await prisma.doctor.findMany({
    where: { clinicId: membership.clinicId, isActive: true },
    orderBy: { firstName: 'asc' },
  })

  const services = await prisma.service.findMany({
    where: { clinicId: membership.clinicId, isActive: true },
    orderBy: { name: 'asc' },
  })

  const reminders = await prisma.reminder.findMany({
    where: {
      clinicId: membership.clinicId,
      scheduledAt: {
        gte: new Date(),
      },
    },
    include: {
      appointment: {
        include: {
          patient: true,
          doctor: true,
          service: true,
        },
      },
    },
    orderBy: {
      scheduledAt: 'asc',
    },
    take: 20,
  })

  const notificationJobs = await prisma.notificationJob.findMany({
    where: {
      clinicId: membership.clinicId,
    },
    include: {
      appointment: {
        include: {
          patient: true,
        },
      },
      patient: true,
    },
    orderBy: {
      scheduledFor: 'asc',
    },
    take: 30,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Appointments</h1>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-1">
            {canManage ? (
              <AppointmentForm patients={patients} doctors={doctors} services={services} />
            ) : (
              <div className="overflow-hidden rounded-xl bg-white p-6 shadow">
                <h2 className="text-lg font-semibold text-gray-900">Appointment Management</h2>
                <p className="mt-3 text-sm text-gray-600">Your role has read-only access on this page.</p>
              </div>
            )}
          </div>

          <div className="md:col-span-2 space-y-6">
            <div className="overflow-hidden rounded-xl bg-white shadow">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">Calendar View</h2>
                <p className="mt-1 text-sm text-gray-600">Grouped by day and time</p>
              </div>

              {groupedDates.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-600">No appointments scheduled.</p>
                </div>
              ) : (
                <div className="space-y-4 p-4">
                  {groupedDates.map((dateKey) => (
                    <section key={dateKey} className="rounded-lg border border-gray-200 bg-white">
                      <div className="border-b border-gray-100 px-4 py-3">
                        <h3 className="text-sm font-semibold text-gray-800">
                          {formatDateHeading(new Date(`${dateKey}T00:00:00`))}
                        </h3>
                      </div>

                      <div className="divide-y divide-gray-100">
                        {groupedByDate[dateKey].map((appointment) => (
                          <div key={appointment.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                {formatTime(appointment.scheduledAt)} - {appointment.patient.firstName} {appointment.patient.lastName}
                              </p>
                                <p className="text-sm text-gray-600">
                                  Dr. {(appointment.doctor?.firstName ?? '')} {(appointment.doctor?.lastName ?? '')} · {appointment.service.name}
                              </p>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClasses(appointment.status)}`}>
                                {appointment.status.replace('_', ' ')}
                              </span>
                              {(appointment.confirmationRequestedAt || appointment.confirmedAt) ? (
                                <p className="text-xs text-gray-600">
                                  {appointment.confirmedAt
                                    ? `Confirmed at ${formatDateTime(appointment.confirmedAt)}`
                                    : appointment.confirmationRequestedAt
                                      ? `Confirmation requested at ${formatDateTime(appointment.confirmationRequestedAt)}`
                                      : ''}
                                </p>
                              ) : null}
                              {canUpdateStatus ? (
                                <div className="w-40">
                                  <AppointmentStatusControl
                                    appointmentId={appointment.id}
                                    initialStatus={appointment.status}
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-xl bg-white shadow">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">List View</h2>
                <p className="mt-1 text-sm text-gray-600">Detailed table for quick scanning</p>
              </div>

              {appointments.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-600">No appointments scheduled.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Patient</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Doctor</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Service</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Date & Time</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Status</th>
                        {canUpdateStatus ? (
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Update Status</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {appointments.map((appointment) => (
                        <tr key={appointment.id}>
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                            {appointment.patient.firstName} {appointment.patient.lastName}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                             {(appointment.doctor?.firstName ?? '')} {(appointment.doctor?.lastName ?? '')}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{appointment.service.name}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{formatDateTime(appointment.scheduledAt)}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClasses(appointment.status)}`}>
                              {appointment.status.replace('_', ' ')}
                            </span>
                          </td>
                          {canUpdateStatus ? (
                            <td className="px-6 py-4 text-sm">
                              <AppointmentStatusControl
                                appointmentId={appointment.id}
                                initialStatus={appointment.status}
                              />
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-xl bg-white shadow">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">Upcoming Reminders</h2>
                <p className="mt-1 text-sm text-gray-600">Internal reminder log (confirmation + 24h and 3h schedule)</p>
              </div>

              {reminders.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-600">No upcoming reminders.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Reminder Time</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Patient</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Doctor</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Service</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {reminders.map((reminder) => (
                        <tr key={reminder.id}>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{formatDateTime(reminder.scheduledAt)}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                            {reminder.appointment.patient.firstName} {reminder.appointment.patient.lastName}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                            {(reminder.appointment.doctor?.firstName ?? '')} {(reminder.appointment.doctor?.lastName ?? '')}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{reminder.appointment.service.name}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{reminder.type}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${reminderStatusBadgeClasses(reminder.status)}`}>
                              {reminder.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-xl bg-white shadow">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">Notification Logs</h2>
                <p className="mt-1 text-sm text-gray-600">Provider-ready jobs generated from reminders</p>
              </div>

              {notificationJobs.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-600">No notification jobs available.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Channel</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Destination</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Scheduled For</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Appointment</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Patient</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {notificationJobs.map((job) => (
                        <tr key={job.id}>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{job.channel}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{job.destination}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${notificationStatusBadgeClasses(job.status)}`}>
                              {job.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{formatDateTime(job.scheduledFor)}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{formatDateTime(job.appointment.scheduledAt)}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                            {job.patient.firstName} {job.patient.lastName}
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
