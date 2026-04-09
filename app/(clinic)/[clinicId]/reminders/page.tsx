import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NotificationJobSendButton } from '@/components/NotificationJobSendButton'

interface RemindersPageProps {
  params: {
    clinicId: string
  }
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

function notificationStatusBadgeClasses(status: string) {
  if (status === 'pending') return 'bg-amber-100 text-amber-800'
  if (status === 'queued') return 'bg-blue-100 text-blue-800'
  if (status === 'sent') return 'bg-green-100 text-green-800'
  if (status === 'failed') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-800'
}

export default async function RemindersPage({ params }: RemindersPageProps) {
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
      clinicId: params.clinicId,
    },
  })

  if (!membership) {
    redirect('/onboarding')
  }

  const reminders = await prisma.reminder.findMany({
    where: {
      clinicId: params.clinicId,
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
      clinicId: params.clinicId,
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
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Reminders - Clinic {params.clinicId}
          </h1>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-xl bg-white shadow">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Upcoming Reminders</h2>
              <p className="mt-1 text-sm text-gray-600">Internal reminder records used to prepare notification jobs</p>
            </div>

            {reminders.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-gray-600">No reminders available.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Reminder Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Patient</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Doctor</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Type</th>
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
                          {reminder.appointment.doctor.firstName} {reminder.appointment.doctor.lastName}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{reminder.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl bg-white shadow">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Notification Logs</h2>
              <p className="mt-1 text-sm text-gray-600">Provider-ready queue records generated from reminders</p>
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
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Provider</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Scheduled For</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Linked Appointment</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Linked Patient</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Action</th>
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
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {job.provider ?? '-'}
                          {job.providerMessageId ? (
                            <p className="mt-1 text-xs text-gray-500">id: {job.providerMessageId}</p>
                          ) : null}
                          {job.errorMessage ? (
                            <p className="mt-1 text-xs text-red-600">{job.errorMessage}</p>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{formatDateTime(job.scheduledFor)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{formatDateTime(job.appointment.scheduledAt)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                          {job.patient.firstName} {job.patient.lastName}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {job.channel === 'whatsapp' && job.status === 'pending' ? (
                            <NotificationJobSendButton jobId={job.id} />
                          ) : (
                            <span className="text-xs text-gray-500">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}