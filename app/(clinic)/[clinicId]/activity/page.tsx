import Link from 'next/link'
import { requireClinicPageAccess } from '@/lib/auth'
import { canViewActivityLog } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'

type ActivityFilter = 'all' | 'appointment' | 'notification' | 'system'

type ActivityPageProps = {
  params: Promise<{ clinicId: string }>
  searchParams: Promise<{ type?: string | string[] }>
}

type LogMetadata = {
  actorUserId?: string
  appointmentId?: string
  patientId?: string
  notificationJobId?: string
  phoneNormalized?: string
  destination?: string
  to?: string
  actionResult?: string
  previousScheduledAt?: string
  newScheduledAt?: string
  dispatchOk?: boolean
  dispatchStatus?: string
  regeneratedReminderJobCount?: number
  invalidatedNotificationJobCount?: number
}

type EventConfig = {
  label: string
  category: Exclude<ActivityFilter, 'all'>
}

const EVENT_CONFIG: Record<string, EventConfig> = {
  whatsapp_operator_appointment_confirm: {
    label: 'Appointment confirmed by operator',
    category: 'appointment',
  },
  whatsapp_operator_appointment_cancel: {
    label: 'Appointment cancelled by operator',
    category: 'appointment',
  },
  whatsapp_operator_appointment_reschedule: {
    label: 'Appointment rescheduled by operator',
    category: 'appointment',
  },
  whatsapp_operator_notification_retry: {
    label: 'Notification retry by operator',
    category: 'notification',
  },
  whatsapp_reschedule_reminders_regenerated: {
    label: 'Reminders regenerated after reschedule',
    category: 'system',
  },
  whatsapp_reschedule_confirmation_dispatch: {
    label: 'Reschedule confirmation dispatch result',
    category: 'system',
  },
}

const FILTER_OPTIONS: Array<{ value: ActivityFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'appointment', label: 'Appointment actions' },
  { value: 'notification', label: 'Notification actions' },
  { value: 'system', label: 'System side-effects' },
]

const DISPLAYED_EVENT_TYPES = Object.keys(EVENT_CONFIG)

function parseFilter(value: string | string[] | undefined): ActivityFilter {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : 'all'
  const valid = new Set(FILTER_OPTIONS.map((item) => item.value))
  return valid.has(raw as ActivityFilter) ? (raw as ActivityFilter) : 'all'
}

function asMetadata(value: unknown): LogMetadata | null {
  if (!value || typeof value !== 'object') return null
  return value as LogMetadata
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return '-'
  return value.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatIsoDateTime(value: string | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return formatDateTime(date)
}

function buildSummary(eventType: string, metadata: LogMetadata | null) {
  if (eventType === 'whatsapp_operator_appointment_confirm') {
    if (metadata?.actionResult === 'already_confirmed_noop') return 'No change needed. Appointment was already confirmed.'
    if (metadata?.actionResult === 'already_confirmed_set_timestamp') return 'Appointment already confirmed. Missing confirmation timestamp was restored.'
    return 'Appointment status was updated to confirmed.'
  }

  if (eventType === 'whatsapp_operator_appointment_cancel') {
    if (metadata?.actionResult === 'already_cancelled_noop') return 'No change needed. Appointment was already cancelled.'
    return 'Appointment status was updated to cancelled.'
  }

  if (eventType === 'whatsapp_operator_appointment_reschedule') {
    return 'Appointment schedule was changed from inbox.'
  }

  if (eventType === 'whatsapp_operator_notification_retry') {
    if (metadata?.dispatchOk === true) return 'Retry succeeded and the WhatsApp message was sent.'
    if (metadata?.dispatchOk === false) return 'Retry attempted but dispatch failed.'
    return 'Failed WhatsApp notification retry was attempted.'
  }

  if (eventType === 'whatsapp_reschedule_reminders_regenerated') {
    const count = typeof metadata?.regeneratedReminderJobCount === 'number' ? metadata.regeneratedReminderJobCount : null
    return count === null
      ? 'Reminder jobs were regenerated after reschedule.'
      : `Reminder jobs regenerated: ${count}.`
  }

  if (eventType === 'whatsapp_reschedule_confirmation_dispatch') {
    if (metadata?.dispatchOk === true) return 'Reschedule confirmation dispatch succeeded.'
    if (metadata?.dispatchOk === false) return 'Reschedule confirmation dispatch failed.'
    return 'Reschedule confirmation dispatch was attempted.'
  }

  return 'Operator activity recorded.'
}

function filterHref(clinicId: string, filter: ActivityFilter) {
  if (filter === 'all') return `/${clinicId}/activity`
  return `/${clinicId}/activity?type=${filter}`
}

export default async function ActivityPage({ params, searchParams }: ActivityPageProps) {
  const { clinicId } = await params
  const query = await searchParams
  await requireClinicPageAccess(clinicId, canViewActivityLog)
  const filter = parseFilter(query.type)

  const whereEventTypes = filter === 'all'
    ? DISPLAYED_EVENT_TYPES
    : DISPLAYED_EVENT_TYPES.filter((eventType) => EVENT_CONFIG[eventType]?.category === filter)

  const logs = await prisma.escalationLog.findMany({
    where: {
      clinicId,
      eventType: {
        in: whereEventTypes,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 300,
  })

  const patientIds = Array.from(new Set(
    logs
      .map((log) => asMetadata(log.metadata)?.patientId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  ))

  const appointmentIds = Array.from(new Set(
    logs
      .map((log) => asMetadata(log.metadata)?.appointmentId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  ))

  const [patients, appointments] = await Promise.all([
    patientIds.length > 0
      ? prisma.patient.findMany({
          where: {
            clinicId,
            id: {
              in: patientIds,
            },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        })
      : Promise.resolve([]),
    appointmentIds.length > 0
      ? prisma.appointment.findMany({
          where: {
            clinicId,
            id: {
              in: appointmentIds,
            },
          },
          select: {
            id: true,
            scheduledAt: true,
            patient: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ])

  const patientById = new Map(patients.map((patient) => [patient.id, patient]))
  const appointmentById = new Map(appointments.map((appointment) => [appointment.id, appointment]))

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f7f4ef_0%,#f4f1fb_44%,#f8f6f2_100%)] p-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Activity Log</h1>
        <p className="mt-0.5 text-sm text-stone-500">Recent staff actions and system updates for this clinic.</p>
      </div>

      <section className="flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map((option) => {
          const active = option.value === filter
          return (
            <Link
              key={option.value}
              href={filterHref(clinicId, option.value)}
              className={active
                ? 'rounded-full bg-violet-600 px-4 py-1.5 text-sm font-medium text-white shadow-[0_10px_28px_rgba(109,40,217,0.28)] transition-all duration-150 hover:-translate-y-px'
                : 'rounded-full bg-white/90 px-4 py-1.5 text-sm font-medium text-stone-600 ring-1 ring-black/[0.04] shadow-[0_8px_20px_rgba(15,23,42,0.03)] transition-all duration-150 hover:-translate-y-px hover:bg-white'}
            >
              {option.label}
            </Link>
          )
        })}
      </section>

      <section className="overflow-hidden rounded-[28px] bg-white/92 ring-1 ring-black/[0.04] shadow-sm shadow-[0_8px_24px_rgba(15,23,42,0.05),0_24px_48px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.75)]">
        <div className="border-b border-stone-100 px-5 py-4">
          <p className="text-sm text-stone-500">{logs.length} activity item{logs.length !== 1 ? 's' : ''}</p>
        </div>

        {logs.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-stone-500">No activity for this filter yet.</p>
            <p className="mt-1 text-sm text-stone-400">Confirm, cancel, reschedule, and retry actions will appear here as they happen.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {logs.map((log) => {
              const metadata = asMetadata(log.metadata)
              const config = EVENT_CONFIG[log.eventType]
              const patient = metadata?.patientId ? patientById.get(metadata.patientId) : null
              const appointment = metadata?.appointmentId ? appointmentById.get(metadata.appointmentId) : null
              const previousScheduled = formatIsoDateTime(metadata?.previousScheduledAt)
              const newScheduled = formatIsoDateTime(metadata?.newScheduledAt)

              return (
                <article key={log.id} className="px-5 py-4 transition-all duration-150 hover:bg-white/80">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-stone-900">{config?.label ?? log.eventType}</p>
                      <p className="mt-0.5 text-sm text-stone-600">{buildSummary(log.eventType, metadata)}</p>
                    </div>
                    <p className="shrink-0 text-xs text-stone-400">{formatDateTime(log.createdAt)}</p>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-stone-400">
                    {(log.userId ?? metadata?.actorUserId) && (
                      <span>Staff: {log.userId ?? metadata?.actorUserId}</span>
                    )}
                    {patient && (
                      <span>Patient: {`${patient.firstName} ${patient.lastName}`.trim()}</span>
                    )}
                    {appointment && (
                      <span>Appt: {formatDateTime(appointment.scheduledAt)}</span>
                    )}
                    {metadata?.notificationJobId && (
                      <span>Job: {metadata.notificationJobId}</span>
                    )}
                    {typeof metadata?.dispatchStatus === 'string' && (
                      <span>Delivery: {metadata.dispatchStatus}</span>
                    )}
                  </div>

                  {previousScheduled || newScheduled ? (
                    <div className="mt-3 rounded-2xl bg-stone-50 px-3 py-2 text-xs text-stone-700 ring-1 ring-black/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                      <span className="font-medium text-stone-800">Rescheduled: </span>
                      {previousScheduled ?? '—'} → {newScheduled ?? '—'}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
