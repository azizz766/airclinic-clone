import { prisma } from '@/lib/prisma'

type AppointmentStatusFilter =
  | 'all'
  | 'confirmation_pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled'

const STATUS_OPTIONS: Array<{ value: AppointmentStatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'confirmation_pending', label: 'Confirmation Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No Show' },
  { value: 'rescheduled', label: 'Rescheduled' },
]

function parseStatusFilter(value: string | string[] | undefined): AppointmentStatusFilter {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : 'all'
  const valid = new Set(STATUS_OPTIONS.map((option) => option.value))
  return valid.has(raw as AppointmentStatusFilter) ? (raw as AppointmentStatusFilter) : 'all'
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
  if (status === 'confirmation_pending') return 'bg-amber-100 text-amber-800'
  if (status === 'confirmed') return 'bg-emerald-100 text-emerald-800'
  if (status === 'completed') return 'bg-gray-100 text-gray-800'
  if (status === 'cancelled') return 'bg-red-100 text-red-800'
  if (status === 'no_show') return 'bg-orange-100 text-orange-800'
  if (status === 'rescheduled') return 'bg-blue-100 text-blue-800'
  return 'bg-slate-100 text-slate-800'
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ')
}

type AppointmentsPageProps = {
  params: Promise<{
    clinicId: string
  }>
  searchParams: Promise<{
    q?: string | string[]
    status?: string | string[]
  }>
}

export default async function AppointmentsPage({ params, searchParams }: AppointmentsPageProps) {
  const { clinicId } = await params
  const query = await searchParams

  const searchRaw = typeof query.q === 'string' ? query.q : Array.isArray(query.q) ? query.q[0] : ''
  const searchTerm = searchRaw.trim()
  const statusFilter = parseStatusFilter(query.status)

  const appointmentsRaw = await prisma.appointment.findMany({
    where: {
      clinicId,
      ...(statusFilter === 'all' ? {} : { status: statusFilter }),
      ...(searchTerm
        ? {
            patient: {
              OR: [
                { firstName: { contains: searchTerm, mode: 'insensitive' } },
                { lastName: { contains: searchTerm, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    },
    include: {
      patient: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      doctor: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      service: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      scheduledAt: 'asc',
    },
    take: 200,
  })

  const now = new Date()
  const upcoming = appointmentsRaw.filter((item) => item.scheduledAt >= now)
  const past = appointmentsRaw
    .filter((item) => item.scheduledAt < now)
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
  const appointments = [...upcoming, ...past]

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Appointments</h1>
        <p className="mt-1 text-sm text-gray-600">Clinic: {clinicId}</p>
      </header>

      <section className="mb-4 rounded-xl bg-white p-4 shadow-sm border border-gray-200">
        <form method="get" action={`/${clinicId}/appointments`} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Search patient</span>
            <input
              type="text"
              name="q"
              defaultValue={searchTerm}
              placeholder="First or last name"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Status</span>
            <select
              name="status"
              defaultValue={statusFilter}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Apply
            </button>
            <a
              href={`/${clinicId}/appointments`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Reset
            </a>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl bg-white shadow border border-gray-200">
        <div className="border-b border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-600">Showing {appointments.length} appointment(s)</p>
        </div>

        {appointments.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-600">No appointments found for this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Doctor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Service</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Scheduled Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {appointments.map((appointment) => (
                  <tr key={appointment.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {appointment.patient.firstName} {appointment.patient.lastName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {(appointment.doctor?.firstName ?? '')} {(appointment.doctor?.lastName ?? '')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{appointment.service.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{formatDateTime(appointment.scheduledAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClasses(appointment.status)}`}>
                        {statusLabel(appointment.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}