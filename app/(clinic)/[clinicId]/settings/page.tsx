import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { normalizeClinicRole } from '@/lib/auth/permissions'
import FlashCookieConsumer from '@/components/FlashCookieConsumer'

interface SettingsPageProps {
  params: Promise<{
    clinicId: string
  }>
  searchParams?: Promise<{
    saved?: string
    error?: string
  }>
}

const WEEK_DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const

type WeekDay = (typeof WEEK_DAYS)[number]['key']

const SETTINGS_SAVED_COOKIE = 'clinic-settings-saved'

function parseBoolean(value: FormDataEntryValue | null) {
  return value === 'on'
}

function isValidTimeZone(value: string) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value)
}

function timeToMinutes(value: string) {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

export default async function SettingsPage({ params, searchParams }: SettingsPageProps) {
  const { clinicId } = await params
  const resolvedSearchParams = (await searchParams) ?? {}
  const cookieStore = await cookies()
  const hasSavedFlash = cookieStore.get(SETTINGS_SAVED_COOKIE)?.value === '1'

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
      clinicId,
    },
  })

  if (!membership) {
    console.warn('[settings-page] redirecting to onboarding: no membership for clinic', {
      userId: session.user.id,
      clinicId,
    })
    redirect('/onboarding')
  }

  const role = normalizeClinicRole(membership.role)
  const canManageSettings = role === 'owner' || role === 'admin'
  if (!canManageSettings) {
    console.warn('[settings-page] redirecting to dashboard: role not allowed for settings', {
      userId: session.user.id,
      clinicId,
      membershipClinicId: membership.clinicId,
      membershipRole: membership.role,
      normalizedRole: role,
    })
    redirect('/dashboard')
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      timezone: true,
    },
  })

  if (!clinic) {
    redirect('/onboarding')
  }

  const clinicSettings = await prisma.clinicSettings.findUnique({
    where: { clinicId: clinic.id },
  })

  const workingHoursValue =
    clinicSettings?.workingHours && typeof clinicSettings.workingHours === 'object'
      ? (clinicSettings.workingHours as Record<string, unknown>)
      : {}

  const reminderSettingsValue =
    clinicSettings?.reminderSettings && typeof clinicSettings.reminderSettings === 'object'
      ? (clinicSettings.reminderSettings as Record<string, unknown>)
      : {}

  const notificationSettingsValue =
    clinicSettings?.notificationSettings && typeof clinicSettings.notificationSettings === 'object'
      ? (clinicSettings.notificationSettings as Record<string, unknown>)
      : {}

  const selectedWorkingDays = Array.isArray(workingHoursValue.workingDays)
    ? (workingHoursValue.workingDays as unknown[]).filter((day): day is WeekDay =>
        WEEK_DAYS.some((w) => w.key === day)
      )
    : (['mon', 'tue', 'wed', 'thu', 'fri'] as WeekDay[])

  const openingTime =
    typeof workingHoursValue.openingTime === 'string' ? workingHoursValue.openingTime : '09:00'
  const closingTime =
    typeof workingHoursValue.closingTime === 'string' ? workingHoursValue.closingTime : '17:00'

  const appointmentBufferMinutes = clinicSettings?.appointmentBufferMinutes ?? 15
  const defaultAppointmentDurationMinutes =
    typeof notificationSettingsValue.defaultAppointmentDurationMinutes === 'number'
      ? notificationSettingsValue.defaultAppointmentDurationMinutes
      : 30

  const reminder24hEnabled =
    typeof reminderSettingsValue.reminder24hEnabled === 'boolean'
      ? reminderSettingsValue.reminder24hEnabled
      : true
  const reminder2hEnabled =
    typeof reminderSettingsValue.reminder2hEnabled === 'boolean'
      ? reminderSettingsValue.reminder2hEnabled
      : true

  async function clearSavedFlash() {
    'use server'

    const cookieStore = await cookies()
    cookieStore.set(SETTINGS_SAVED_COOKIE, '', {
      path: `/${clinicId}/settings`,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 0,
    })
  }

  async function updateSettings(formData: FormData) {
    'use server'

    const submittedClinicId = String(formData.get('clinicId') ?? '').trim()
    if (!submittedClinicId) {
      redirect('/dashboard')
    }

    const supabaseAction = await createClient()
    const {
      data: { session: actionSession },
    } = await supabaseAction.auth.getSession()

    if (!actionSession) {
      redirect('/login')
    }

    const actionMembership = await prisma.membership.findFirst({
      where: {
        userId: actionSession.user.id,
        clinicId: submittedClinicId,
      },
    })

    if (!actionMembership) {
      redirect('/onboarding')
    }

    const actionRole = normalizeClinicRole(actionMembership.role)
    const canManageSettings = actionRole === 'owner' || actionRole === 'admin'
    if (!canManageSettings) {
      console.warn('[settings-page] server action redirecting to dashboard: role not allowed', {
        userId: actionSession.user.id,
        submittedClinicId,
        membershipClinicId: actionMembership.clinicId,
        membershipRole: actionMembership.role,
        normalizedRole: actionRole,
      })
      redirect('/dashboard')
    }

    const targetSettingsPath = `/${actionMembership.clinicId}/settings`

    const fail = (message: string) => {
      redirect(`${targetSettingsPath}?error=${encodeURIComponent(message)}`)
    }

    const clinicName = String(formData.get('clinicName') ?? '').trim()
    const phone = String(formData.get('phone') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const address = String(formData.get('address') ?? '').trim()
    const timezone = String(formData.get('timezone') ?? '').trim()
    const openingTimeInput = String(formData.get('openingTime') ?? '').trim()
    const closingTimeInput = String(formData.get('closingTime') ?? '').trim()
    const appointmentBufferInput = String(formData.get('appointmentBufferMinutes') ?? '').trim()
    const defaultDurationInput = String(formData.get('defaultAppointmentDurationMinutes') ?? '').trim()

    const rawWorkingDays = formData.getAll('workingDays').map((value) => String(value))
    const workingDays = rawWorkingDays.filter((day): day is WeekDay =>
      WEEK_DAYS.some((w) => w.key === day)
    )

    const reminder24h = parseBoolean(formData.get('reminder24hEnabled'))
    const reminder2h = parseBoolean(formData.get('reminder2hEnabled'))

    if (!clinicName) fail('Clinic name is required.')
    if (clinicName.length > 120) fail('Clinic name is too long.')

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail('Clinic email is invalid.')
    }

    if (phone.length > 30) fail('Clinic phone is too long.')
    if (address.length > 300) fail('Clinic address is too long.')

    if (!timezone || !isValidTimeZone(timezone)) {
      fail('Timezone is invalid.')
    }

    if (!isValidTime(openingTimeInput) || !isValidTime(closingTimeInput)) {
      fail('Opening and closing time must be in HH:MM format.')
    }

    if (timeToMinutes(openingTimeInput) >= timeToMinutes(closingTimeInput)) {
      fail('Opening time must be earlier than closing time.')
    }

    const appointmentBufferMinutesValue = Number(appointmentBufferInput)
    if (
      !Number.isInteger(appointmentBufferMinutesValue) ||
      appointmentBufferMinutesValue < 0 ||
      appointmentBufferMinutesValue > 120
    ) {
      fail('Appointment buffer must be a whole number between 0 and 120.')
    }

    const defaultAppointmentDurationValue = Number(defaultDurationInput)
    if (
      !Number.isInteger(defaultAppointmentDurationValue) ||
      defaultAppointmentDurationValue < 5 ||
      defaultAppointmentDurationValue > 240
    ) {
      fail('Default appointment duration must be between 5 and 240 minutes.')
    }

    if (workingDays.length === 0) {
      fail('Select at least one working day.')
    }

    await prisma.$transaction(async (tx) => {
      await tx.clinic.update({
        where: { id: actionMembership.clinicId },
        data: {
          name: clinicName,
          phone: phone || null,
          email: email || null,
          address: address || null,
          timezone,
        },
      })

      await tx.clinicSettings.upsert({
        where: { clinicId: actionMembership.clinicId },
        create: {
          clinicId: actionMembership.clinicId,
          appointmentBufferMinutes: appointmentBufferMinutesValue,
          timezone,
          workingHours: {
            workingDays,
            openingTime: openingTimeInput,
            closingTime: closingTimeInput,
          },
          reminderSettings: {
            reminder24hEnabled: reminder24h,
            reminder2hEnabled: reminder2h,
          },
          notificationSettings: {
            defaultAppointmentDurationMinutes: defaultAppointmentDurationValue,
          },
        },
        update: {
          appointmentBufferMinutes: appointmentBufferMinutesValue,
          timezone,
          workingHours: {
            workingDays,
            openingTime: openingTimeInput,
            closingTime: closingTimeInput,
          },
          reminderSettings: {
            reminder24hEnabled: reminder24h,
            reminder2hEnabled: reminder2h,
          },
          notificationSettings: {
            defaultAppointmentDurationMinutes: defaultAppointmentDurationValue,
          },
        },
      })
    })

    const actionCookieStore = await cookies()
    actionCookieStore.set(SETTINGS_SAVED_COOKIE, '1', {
      path: targetSettingsPath,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30,
    })

    redirect(targetSettingsPath)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Settings - Clinic {clinic.name}
          </h1>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-xl bg-white p-6 shadow sm:p-8">
          {hasSavedFlash || resolvedSearchParams.saved === '1' ? (
            <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">
              {hasSavedFlash ? <FlashCookieConsumer clearAction={clearSavedFlash} /> : null}
              <p className="text-sm font-semibold">Settings saved successfully.</p>
              <p className="mt-1 text-sm text-green-700">
                Clinic profile and operational settings were updated.
              </p>
            </div>
          ) : null}

          {resolvedSearchParams.error ? (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{resolvedSearchParams.error}</p>
          ) : null}

          <form action={updateSettings} className="grid gap-8 lg:grid-cols-2">
            <input type="hidden" name="clinicId" value={clinicId} />

            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Clinic Profile</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700">Clinic Name</label>
                <input
                  name="clinicName"
                  required
                  defaultValue={clinic.name}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input
                  name="phone"
                  defaultValue={clinic.phone ?? ''}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  name="email"
                  type="email"
                  defaultValue={clinic.email ?? ''}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Address</label>
                <textarea
                  name="address"
                  rows={3}
                  defaultValue={clinic.address ?? ''}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Timezone</label>
                <input
                  name="timezone"
                  required
                  defaultValue={clinicSettings?.timezone ?? clinic.timezone}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Operational Settings</h2>

              <div>
                <p className="text-sm font-medium text-gray-700">Working Days</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {WEEK_DAYS.map((day) => (
                    <label key={day.key} className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        name="workingDays"
                        value={day.key}
                        defaultChecked={selectedWorkingDays.includes(day.key)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Opening Time</label>
                  <input
                    name="openingTime"
                    type="time"
                    required
                    defaultValue={openingTime}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Closing Time</label>
                  <input
                    name="closingTime"
                    type="time"
                    required
                    defaultValue={closingTime}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Appointment Buffer (minutes)</label>
                  <input
                    name="appointmentBufferMinutes"
                    type="number"
                    min={0}
                    max={120}
                    required
                    defaultValue={appointmentBufferMinutes}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Default Appointment Duration (minutes)</label>
                  <input
                    name="defaultAppointmentDurationMinutes"
                    type="number"
                    min={5}
                    max={240}
                    required
                    defaultValue={defaultAppointmentDurationMinutes}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700">Default Reminder Settings</p>
                <div className="mt-2 space-y-2">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      name="reminder24hEnabled"
                      defaultChecked={reminder24hEnabled}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Send 24h reminder
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      name="reminder2hEnabled"
                      defaultChecked={reminder2hEnabled}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Send 2h reminder
                  </label>
                </div>
              </div>
            </section>

            <div className="lg:col-span-2">
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Save Settings
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}