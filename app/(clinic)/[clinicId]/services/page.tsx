import { prisma } from '@/lib/prisma'

type ServicesPageProps = {
  params: Promise<{
    clinicId: string
  }>
  searchParams: Promise<{
    q?: string | string[]
  }>
}

function formatPrice(value: number | null) {
  if (value === null || Number.isNaN(value)) return 'N/A'
  return `$${value.toFixed(2)}`
}

export default async function ServicesPage({ params, searchParams }: ServicesPageProps) {
  const { clinicId } = await params
  const query = await searchParams

  const searchRaw = typeof query.q === 'string' ? query.q : Array.isArray(query.q) ? query.q[0] : ''
  const searchTerm = searchRaw.trim()

  const services = await prisma.service.findMany({
    where: {
      clinicId,
      ...(searchTerm
        ? {
            OR: [
              { name: { contains: searchTerm, mode: 'insensitive' } },
              { category: { contains: searchTerm, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      category: true,
      durationMinutes: true,
      price: true,
      isActive: true,
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    take: 200,
  })

  const appointmentCounts = await prisma.appointment.groupBy({
    by: ['serviceId'],
    where: {
      clinicId,
      serviceId: {
        in: services.map((service) => service.id),
      },
    },
    _count: {
      serviceId: true,
    },
  })

  const countByServiceId = new Map(appointmentCounts.map((item) => [item.serviceId, item._count.serviceId]))

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Services</h1>
        <p className="mt-1 text-sm text-gray-600">Clinic: {clinicId}</p>
      </header>

      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <form method="get" action={`/${clinicId}/services`} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Search</span>
            <input
              type="text"
              name="q"
              defaultValue={searchTerm}
              placeholder="Service name or category"
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
              href={`/${clinicId}/services`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Reset
            </a>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow">
        <div className="border-b border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-600">Showing {services.length} service(s)</p>
        </div>

        {services.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-600">No services found for this search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Service</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Appointments</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {services.map((service) => (
                  <tr key={service.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{service.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{service.category || 'N/A'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{service.durationMinutes} min</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{formatPrice(service.price)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{countByServiceId.get(service.id) || 0}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          service.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {service.isActive ? 'Active' : 'Inactive'}
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
