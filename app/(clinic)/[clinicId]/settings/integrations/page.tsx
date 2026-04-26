import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { normalizeClinicRole, canAccessClinicSettings } from '@/lib/auth/permissions'

interface IntegrationsPageProps {
  params: Promise<{ clinicId: string }>
  searchParams?: Promise<{ gcal_connected?: string; gcal_error?: string }>
}

export default async function IntegrationsPage({ params, searchParams }: IntegrationsPageProps) {
  const { clinicId } = await params
  const sp = (await searchParams) ?? {}

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, clinicId, isActive: true },
    select: { role: true },
  })

  if (!membership) redirect('/onboarding')

  if (!canAccessClinicSettings(normalizeClinicRole(membership.role))) {
    redirect(`/${clinicId}/settings`)
  }

  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { clinicId },
    select: { calendarId: true, createdAt: true },
  })

  const isConnected = !!connection

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href={`/${clinicId}/settings`} className="hover:text-gray-700">
              Settings
            </Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">Integrations</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">Integrations</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {sp.gcal_connected === '1' && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <p className="font-semibold">Google Calendar connected.</p>
            <p className="mt-0.5 text-green-700">
              New appointments will be synced to your calendar.
            </p>
          </div>
        )}
        {sp.gcal_error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">Google Calendar connection failed.</p>
            <p className="mt-0.5 text-red-700">
              {sp.gcal_error === 'access_denied'
                ? 'You denied access. Try again and allow the required permissions.'
                : 'An error occurred. Please try again.'}
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-xl bg-white shadow">
          <div className="flex items-start justify-between gap-4 p-6">
            <div className="flex items-center gap-4">
              {/* Google Calendar icon */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm">
                <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M19.5 3h-2.25V1.5h-1.5V3h-7.5V1.5h-1.5V3H4.5A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3zm0 16.5h-15V9h15v10.5zM4.5 7.5V4.5h2.25V6h1.5V4.5h7.5V6h1.5V4.5H19.5V7.5h-15z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Google Calendar</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Sync appointments directly to a Google Calendar.
                </p>
                {isConnected && connection && (
                  <p className="mt-1 text-xs text-gray-400">
                    Calendar:{' '}
                    <span className="font-medium text-gray-600">{connection.calendarId}</span>
                    {' · '}Connected{' '}
                    {connection.createdAt.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0">
              {isConnected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                  Not connected
                </span>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 flex justify-end gap-3">
            {isConnected ? (
              <DisconnectButton clinicId={clinicId} />
            ) : (
              <a
                href={`/api/integrations/google-calendar/connect?clinicId=${clinicId}`}
                className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Connect Google Calendar
              </a>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function DisconnectButton({ clinicId }: { clinicId: string }) {
  async function disconnect() {
    'use server'

    const supabase = await createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) redirect('/login')

    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id, clinicId, isActive: true },
      select: { role: true },
    })

    if (!membership || !canAccessClinicSettings(normalizeClinicRole(membership.role))) {
      redirect(`/${clinicId}/settings`)
    }

    const { revokeToken } = await import('@/lib/google/oauth')

    const connection = await prisma.googleCalendarConnection.findUnique({
      where: { clinicId },
      select: { accessToken: true },
    })

    if (connection) {
      await revokeToken(connection.accessToken).catch((err: Error) => {
        console.warn('[integrations/disconnect] Token revoke failed (continuing):', err?.message)
      })
      await prisma.googleCalendarConnection.delete({ where: { clinicId } })
    }

    redirect(`/${clinicId}/settings/integrations`)
  }

  return (
    <form action={disconnect}>
      <button
        type="submit"
        className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Disconnect
      </button>
    </form>
  )
}
