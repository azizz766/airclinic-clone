import { prisma } from '@/lib/prisma'
import { formatDoctorAvailability } from '@/lib/doctor-availability'

type DoctorsPageProps = {
  params: Promise<{
    clinicId: string
  }>
  searchParams: Promise<{
    q?: string | string[]
  }>
}

export default async function DoctorsPage({ params, searchParams }: DoctorsPageProps) {
  const { clinicId } = await params
  const query = await searchParams

  const searchRaw = typeof query.q === 'string' ? query.q : Array.isArray(query.q) ? query.q[0] : ''
  const searchTerm = searchRaw.trim()

  const doctors = await prisma.doctor.findMany({
    where: {
      clinicId,
      ...(searchTerm
        ? {
            OR: [
              { firstName: { contains: searchTerm, mode: 'insensitive' } },
              { lastName: { contains: searchTerm, mode: 'insensitive' } },
              { specialty: { contains: searchTerm, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      specialty: true,
      phone: true,
      email: true,
      isActive: true,
      availabilitySchedule: true,
    },
    orderBy: [
      { isActive: 'desc' },
      { firstName: 'asc' },
      { lastName: 'asc' },
    ],
    take: 200,
  })

  const now = new Date()
  const upcomingCounts = await prisma.appointment.groupBy({
    by: ['doctorId'],
    where: {
      clinicId,
      scheduledAt: { gte: now },
      status: {
        notIn: ['cancelled', 'completed', 'no_show'],
      },
      doctorId: {
        in: doctors.map((doctor) => doctor.id),
      },
    },
    _count: {
      doctorId: true,
    },
  })

  const upcomingCountByDoctorId = new Map(upcomingCounts.map((item) => [item.doctorId, item._count.doctorId]))

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Doctors</h1>
        <p className="mt-1 text-sm text-gray-600">Clinic: {clinicId}</p>
      </header>

      <section className="mb-4 rounded-xl bg-white p-4 shadow-sm border border-gray-200">
        <form method="get" action={`/${clinicId}/doctors`} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Search</span>
            <input
              type="text"
              name="q"
              defaultValue={searchTerm}
              placeholder="Name or specialty"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Apply
            </button>
            <a
              href={`/${clinicId}/doctors`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Reset
            </a>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl bg-white shadow border border-gray-200">
        <div className="border-b border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-600">Showing {doctors.length} doctor(s)</p>
        </div>

        {doctors.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-600">No doctors found for this search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Full Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Specialty</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Availability</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Upcoming</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {doctors.map((doctor) => (
                  <tr key={doctor.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {doctor.firstName} {doctor.lastName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{doctor.specialty || 'N/A'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{doctor.phone || 'N/A'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{doctor.email || 'N/A'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{formatDoctorAvailability(doctor.availabilitySchedule)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{upcomingCountByDoctorId.get(doctor.id) || 0}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          doctor.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {doctor.isActive ? 'Active' : 'Inactive'}
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