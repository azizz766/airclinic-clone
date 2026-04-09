import { prisma } from '@/lib/prisma'

function formatDateTime(date: Date | null) {
  if (!date) return 'N/A'
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type PatientsPageProps = {
  params: Promise<{
    clinicId: string
  }>
  searchParams: Promise<{
    q?: string | string[]
  }>
}

export default async function PatientsPage({ params, searchParams }: PatientsPageProps) {
  const { clinicId } = await params
  const query = await searchParams

  const searchRaw = typeof query.q === 'string' ? query.q : Array.isArray(query.q) ? query.q[0] : ''
  const searchTerm = searchRaw.trim()

  const patients = await prisma.patient.findMany({
    where: {
      clinicId,
      ...(searchTerm
        ? {
            OR: [
              { firstName: { contains: searchTerm, mode: 'insensitive' } },
              { lastName: { contains: searchTerm, mode: 'insensitive' } },
              { phone: { contains: searchTerm, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      isActive: true,
      createdAt: true,
      lastVisitAt: true,
      _count: {
        select: {
          appointments: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 250,
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Patients</h1>
        <p className="mt-1 text-sm text-gray-600">Clinic: {clinicId}</p>
      </header>

      <section className="mb-4 rounded-xl bg-white p-4 shadow-sm border border-gray-200">
        <form method="get" action={`/${clinicId}/patients`} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Search</span>
            <input
              type="text"
              name="q"
              defaultValue={searchTerm}
              placeholder="Name or phone"
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
              href={`/${clinicId}/patients`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Reset
            </a>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl bg-white shadow border border-gray-200">
        <div className="border-b border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-600">Showing {patients.length} patient(s)</p>
        </div>

        {patients.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-600">No patients found for this search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Full Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Activity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Appointments</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {patients.map((patient) => (
                  <tr key={patient.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {patient.firstName} {patient.lastName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{patient.phone || 'N/A'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{patient.email || 'N/A'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {formatDateTime(patient.lastVisitAt ?? patient.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{patient._count.appointments}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          patient.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {patient.isActive ? 'Active' : 'Inactive'}
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