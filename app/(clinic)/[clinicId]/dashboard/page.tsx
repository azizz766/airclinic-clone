import Link from 'next/link'
import { requireClinicPageAccess } from '@/lib/auth'
import { canViewDashboardMetrics } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'

type DashboardPageProps = {
  params: Promise<{ clinicId: string }>
  searchParams: Promise<{ window?: string | string[] }>
}

type DashboardWindow = 'today' | '7d' | '30d'

type ActivityMetadata = {
  actorUserId?: string
  appointmentId?: string
  patientId?: string
  notificationJobId?: string
  previousScheduledAt?: string
  newScheduledAt?: string
}

const WINDOW_OPTIONS: Array<{ value: DashboardWindow; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

const OPERATOR_ACTIVITY_EVENT_TYPES = [
  'whatsapp_operator_appointment_confirm',
  'whatsapp_operator_appointment_cancel',
  'whatsapp_operator_appointment_reschedule',
  'whatsapp_operator_notification_retry',
  'whatsapp_reschedule_reminders_regenerated',
  'whatsapp_reschedule_confirmation_dispatch',
] as const

function parseWindow(value: string | string[] | undefined): DashboardWindow {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : '7d'
  const valid = new Set(WINDOW_OPTIONS.map((option) => option.value))
  return valid.has(raw as DashboardWindow) ? (raw as DashboardWindow) : '7d'
}

function windowStart(now: Date, window: DashboardWindow) {
  if (window === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return start
  }

  if (window === '30d') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }

  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
}

function asActivityMetadata(value: unknown): ActivityMetadata | null {
  if (!value || typeof value !== 'object') return null
  return value as ActivityMetadata
}

function activityLabel(eventType: string) {
  if (eventType === 'whatsapp_operator_appointment_confirm') return 'Appointment confirmed'
  if (eventType === 'whatsapp_operator_appointment_cancel') return 'Appointment cancelled'
  if (eventType === 'whatsapp_operator_appointment_reschedule') return 'Appointment rescheduled'
  if (eventType === 'whatsapp_operator_notification_retry') return 'Notification retried'
  if (eventType === 'whatsapp_reschedule_reminders_regenerated') return 'Reminders regenerated'
  if (eventType === 'whatsapp_reschedule_confirmation_dispatch') return 'Reschedule confirmation dispatch'
  return eventType
}

function activitySummary(eventType: string, metadata: ActivityMetadata | null) {
  if (eventType === 'whatsapp_operator_notification_retry') {
    return metadata?.notificationJobId
      ? `Retry attempt for notification job ${metadata.notificationJobId}.`
      : 'Retry attempt for a failed WhatsApp notification.'
  }

  if (eventType === 'whatsapp_operator_appointment_reschedule') {
    const previous = metadata?.previousScheduledAt ? formatDateTime(new Date(metadata.previousScheduledAt)) : null
    const next = metadata?.newScheduledAt ? formatDateTime(new Date(metadata.newScheduledAt)) : null
    if (previous && next) return `Rescheduled from ${previous} to ${next}.`
    return 'Appointment schedule was changed by operator.'
  }

  if (eventType === 'whatsapp_reschedule_confirmation_dispatch') {
    return 'Reschedule confirmation send outcome was recorded.'
  }

  if (eventType === 'whatsapp_reschedule_reminders_regenerated') {
    return 'Reminder jobs were regenerated after a reschedule.'
  }

  if (eventType === 'whatsapp_operator_appointment_confirm') {
    return 'Appointment was confirmed by operator action.'
  }

  if (eventType === 'whatsapp_operator_appointment_cancel') {
    return 'Appointment was cancelled by operator action.'
  }

  return 'Operational activity recorded.'
}

function formatDateTime(date: Date) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ')
}

function statusBadgeClasses(status: string) {
  if (status === 'confirmation_pending') return 'bg-amber-100/80 text-amber-900 ring-1 ring-amber-300'
  if (status === 'confirmed') return 'bg-emerald-100 text-emerald-900'
  if (status === 'completed') return 'bg-stone-200 text-stone-700'
  if (status === 'cancelled') return 'bg-red-100 text-red-900'
  if (status === 'no_show') return 'bg-orange-100 text-orange-900'
  if (status === 'rescheduled') return 'bg-sky-100 text-sky-900'
  return 'bg-stone-200 text-stone-700'
}

function reminderBadgeClasses(status: string) {
  if (status === 'pending') return 'bg-amber-100/80 text-amber-900 ring-1 ring-amber-300'
  if (status === 'sent') return 'bg-emerald-100 text-emerald-900'
  if (status === 'failed') return 'bg-red-100 text-red-900'
  if (status === 'cancelled') return 'bg-stone-200 text-stone-700'
  return 'bg-stone-200 text-stone-700'
}

export default async function ClinicDashboardPage({ params, searchParams }: DashboardPageProps) {
  const query = await searchParams
  const { clinicId } = await params
  await requireClinicPageAccess(clinicId, canViewDashboardMetrics)
  const window = parseWindow(query.window)
  const now = new Date()
  const fromDate = windowStart(now, window)

  const [
    clinic,
    patientCount,
    doctorCount,
    serviceCount,
    upcomingAppointmentCount,
    confirmedAppointmentCount,
    cancelledAppointmentCount,
    rescheduledAppointmentCount,
    confirmationPendingAppointmentCount,
    totalNotificationJobCount,
    pendingQueuedJobCount,
    sentJobCount,
    failedJobCount,
    windowWhatsAppSentCount,
    windowWhatsAppFailedCount,
    recentConfirmCount,
    recentCancelCount,
    recentRescheduleCount,
    recentRetryCount,
    pendingReminderCount,
    upcomingAppointments,
    pendingReminders,
    recentActivityLogs,
  ] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } }),
    prisma.patient.count({ where: { clinicId, isActive: true } }),
    prisma.doctor.count({ where: { clinicId, isActive: true } }),
    prisma.service.count({ where: { clinicId, isActive: true } }),
    prisma.appointment.count({
      where: {
        clinicId,
        scheduledAt: { gte: now },
        status: { notIn: ['cancelled', 'completed', 'no_show'] },
      },
    }),
    prisma.appointment.count({ where: { clinicId, status: 'confirmed' } }),
    prisma.appointment.count({ where: { clinicId, status: 'cancelled' } }),
    prisma.appointment.count({ where: { clinicId, status: 'rescheduled' } }),
    prisma.appointment.count({ where: { clinicId, status: 'confirmation_pending' } }),
    prisma.notificationJob.count({ where: { clinicId } }),
    prisma.notificationJob.count({ where: { clinicId, status: { in: ['pending', 'queued'] } } }),
    prisma.notificationJob.count({ where: { clinicId, status: 'sent' } }),
    prisma.notificationJob.count({ where: { clinicId, status: 'failed' } }),
    prisma.notificationJob.count({
      where: {
        clinicId,
        channel: 'whatsapp',
        status: 'sent',
        createdAt: { gte: fromDate },
      },
    }),
    prisma.notificationJob.count({
      where: {
        clinicId,
        channel: 'whatsapp',
        status: 'failed',
        createdAt: { gte: fromDate },
      },
    }),
    prisma.escalationLog.count({
      where: {
        clinicId,
        eventType: 'whatsapp_operator_appointment_confirm',
        createdAt: { gte: fromDate },
      },
    }),
    prisma.escalationLog.count({
      where: {
        clinicId,
        eventType: 'whatsapp_operator_appointment_cancel',
        createdAt: { gte: fromDate },
      },
    }),
    prisma.escalationLog.count({
      where: {
        clinicId,
        eventType: 'whatsapp_operator_appointment_reschedule',
        createdAt: { gte: fromDate },
      },
    }),
    prisma.escalationLog.count({
      where: {
        clinicId,
        eventType: 'whatsapp_operator_notification_retry',
        createdAt: { gte: fromDate },
      },
    }),
    prisma.reminder.count({ where: { clinicId, status: 'pending' } }),
    prisma.appointment.findMany({
      where: {
        clinicId,
        scheduledAt: { gte: now },
        status: { notIn: ['cancelled', 'completed', 'no_show'] },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        doctor: { select: { firstName: true, lastName: true } },
        service: { select: { name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 8,
    }),
    prisma.reminder.findMany({
      where: { clinicId, status: 'pending' },
      include: {
        appointment: {
          select: {
            scheduledAt: true,
            patient: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 6,
    }),
    prisma.escalationLog.findMany({
      where: {
        clinicId,
        eventType: {
          in: [...OPERATOR_ACTIVITY_EVENT_TYPES],
        },
        createdAt: { gte: fromDate },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  const recentActivityMetadata = recentActivityLogs.map((log) => ({
    id: log.id,
    metadata: asActivityMetadata(log.metadata),
  }))

  const recentPatientIds = Array.from(new Set(
    recentActivityMetadata
      .map((item) => item.metadata?.patientId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  ))

  const recentAppointmentIds = Array.from(new Set(
    recentActivityMetadata
      .map((item) => item.metadata?.appointmentId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  ))

  const [recentPatients, recentAppointments] = await Promise.all([
    recentPatientIds.length > 0
      ? prisma.patient.findMany({
          where: {
            clinicId,
            id: { in: recentPatientIds },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        })
      : Promise.resolve([]),
    recentAppointmentIds.length > 0
      ? prisma.appointment.findMany({
          where: {
            clinicId,
            id: { in: recentAppointmentIds },
          },
          select: {
            id: true,
            scheduledAt: true,
          },
        })
      : Promise.resolve([]),
  ])

  const recentPatientById = new Map(recentPatients.map((patient) => [patient.id, patient]))
  const recentAppointmentById = new Map(recentAppointments.map((appointment) => [appointment.id, appointment]))

  const windowTotalWhatsAppOutcomeCount = windowWhatsAppSentCount + windowWhatsAppFailedCount
  const windowWhatsAppSuccessRate = windowTotalWhatsAppOutcomeCount > 0
    ? Math.round((windowWhatsAppSentCount / windowTotalWhatsAppOutcomeCount) * 100)
    : null

  const windowLabel = WINDOW_OPTIONS.find((option) => option.value === window)?.label ?? 'Last 7 days'
  const needsActionCount = confirmationPendingAppointmentCount + failedJobCount + pendingQueuedJobCount

  const foundationalKpis = [
    { label: 'Active Patients', value: patientCount },
    { label: 'Active Doctors', value: doctorCount },
    { label: 'Active Services', value: serviceCount },
    { label: 'Upcoming Appointments', value: upcomingAppointmentCount },
    { label: 'Pending Reminders', value: pendingReminderCount },
    { label: 'Pending Notification Jobs', value: pendingQueuedJobCount },
  ]

  const appointmentKpis = [
    { label: 'Upcoming Appointments', value: upcomingAppointmentCount, testId: 'metric-upcoming-appointments' },
    { label: 'Confirmed Appointments', value: confirmedAppointmentCount, testId: 'metric-confirmed-appointments' },
    { label: 'Cancelled Appointments', value: cancelledAppointmentCount, testId: 'metric-cancelled-appointments' },
    { label: 'Rescheduled Appointments', value: rescheduledAppointmentCount, testId: 'metric-rescheduled-appointments' },
    { label: 'Confirmation Pending', value: confirmationPendingAppointmentCount, testId: 'metric-confirmation-pending-appointments' },
  ]

  const notificationKpis = [
    { label: 'Total Notification Jobs', value: totalNotificationJobCount, testId: 'metric-total-notification-jobs' },
    { label: 'Pending / Queued', value: pendingQueuedJobCount, testId: 'metric-pending-queued-notification-jobs' },
    { label: 'Sent', value: sentJobCount, testId: 'metric-sent-notification-jobs' },
    { label: 'Failed', value: failedJobCount, testId: 'metric-failed-notification-jobs' },
    { label: `Retry Count (${windowLabel})`, value: recentRetryCount, testId: 'metric-recent-retry-count' },
  ]

  return (
    <div className="min-h-full space-y-8 bg-stone-100 p-6 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold text-stone-950">{clinic?.name ?? 'Clinic'}</h1>
        <p className="mt-0.5 text-sm text-stone-600">Dashboard · {now.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.75fr_1fr]">
        <article className="relative overflow-hidden rounded-2xl bg-[linear-gradient(160deg,#fff3df_0%,#fff9ef_52%,#ffffff_100%)] p-7 ring-1 ring-stone-300 shadow-[0_12px_28px_rgba(28,25,23,0.09)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_12%_0%,rgba(245,158,11,0.16),transparent_58%)]" />
          <div className="relative z-10 pt-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] leading-relaxed text-stone-600">Needs attention</p>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-4xl font-bold tracking-tight text-stone-950">{needsActionCount}</p>
                <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">Review confirmation pending, failed notifications, and queued jobs before they affect patient response times.</p>
              </div>
              <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-stone-300 shadow-[0_4px_14px_rgba(28,25,23,0.05)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-stone-600">Window</p>
                <p className="mt-1 text-sm font-semibold text-stone-900">{windowLabel}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link href={`/${clinicId}/appointments`} className="rounded-full bg-white px-3.5 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 shadow-[0_3px_10px_rgba(28,25,23,0.04)] transition-all duration-150 hover:-translate-y-px hover:bg-stone-50">
                Pending confirmation: {confirmationPendingAppointmentCount}
              </Link>
              <Link href={`/${clinicId}/notifications?status=failed`} className="rounded-full bg-white px-3.5 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 shadow-[0_3px_10px_rgba(28,25,23,0.04)] transition-all duration-150 hover:-translate-y-px hover:bg-stone-50">
                Failed notifications: {failedJobCount}
              </Link>
              <Link href={`/${clinicId}/notifications?status=active`} className="rounded-full bg-white px-3.5 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 shadow-[0_3px_10px_rgba(28,25,23,0.04)] transition-all duration-150 hover:-translate-y-px hover:bg-stone-50">
                Pending queue: {pendingQueuedJobCount}
              </Link>
            </div>
          </div>
        </article>

        <article className="rounded-[30px] bg-white p-5 ring-1 ring-stone-300 shadow-[0_12px_30px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.86)] transition-all duration-150 hover:-translate-y-px hover:shadow-[0_16px_36px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.9)]">
          <p className="text-sm font-medium text-stone-600">WhatsApp success rate</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-stone-950" data-testid="metric-whatsapp-success-rate">
            {windowWhatsAppSuccessRate === null ? '—' : `${windowWhatsAppSuccessRate}%`}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600" data-testid="metric-whatsapp-success-rate-basis">
            Sent vs failed WhatsApp jobs in {windowLabel.toLowerCase()}.
          </p>
        </article>
      </section>

      <section className="flex flex-wrap gap-2">
        {WINDOW_OPTIONS.map((option) => {
          const active = option.value === window
          const href = option.value === '7d'
            ? `/${clinicId}/dashboard`
            : `/${clinicId}/dashboard?window=${option.value}`

          return (
            <Link
              key={option.value}
              href={href}
              className={active
                ? 'rounded-full bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(109,40,217,0.32)] transition-all duration-150 hover:-translate-y-px hover:bg-violet-700'
                : 'rounded-full bg-white px-4 py-1.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition-all duration-150 hover:-translate-y-px hover:bg-stone-50'}
            >
              {option.label}
            </Link>
          )
        })}
      </section>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {foundationalKpis.map((kpi) => (
          <div key={kpi.label} className="h-full rounded-xl bg-white px-4 py-4 ring-1 ring-stone-300 shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition-all duration-150 hover:-translate-y-px">
            <p className="text-xs text-stone-400">{kpi.label}</p>
            <p className="mt-2 text-lg font-semibold text-stone-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-300/85">
        <h2 className="mb-2 text-sm font-medium text-stone-500">Appointments</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {appointmentKpis.map((kpi) => (
            <div key={kpi.label} className="h-full rounded-xl bg-white px-4 py-4 ring-1 ring-stone-300 shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition-all duration-150 hover:-translate-y-px">
              <p className="text-xs text-stone-400">{kpi.label}</p>
              <p className="mt-2 text-lg font-semibold text-stone-900" data-testid={kpi.testId}>{kpi.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-300/85">
        <h2 className="mb-2 text-sm font-medium text-stone-500">Notifications</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {notificationKpis.map((kpi) => (
            <div key={kpi.label} className="h-full rounded-xl bg-white px-4 py-4 ring-1 ring-stone-300 shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition-all duration-150 hover:-translate-y-px">
              <p className="text-xs text-stone-400">{kpi.label}</p>
              <p className="mt-2 text-lg font-semibold text-stone-900" data-testid={kpi.testId}>{kpi.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-stone-900">Operator actions · {windowLabel}</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-[24px] bg-white p-5 ring-1 ring-stone-300 shadow-[0_10px_24px_rgba(15,23,42,0.07)] transition-all duration-150 hover:-translate-y-px">
            <p className="text-sm text-stone-600">Confirms</p>
            <p className="mt-2 text-2xl font-semibold text-stone-950" data-testid="metric-recent-confirm-count">{recentConfirmCount}</p>
          </div>
          <div className="rounded-[24px] bg-white p-5 ring-1 ring-stone-300 shadow-[0_10px_24px_rgba(15,23,42,0.07)] transition-all duration-150 hover:-translate-y-px">
            <p className="text-sm text-stone-600">Cancels</p>
            <p className="mt-2 text-2xl font-semibold text-stone-950" data-testid="metric-recent-cancel-count">{recentCancelCount}</p>
          </div>
          <div className="rounded-[24px] bg-white p-5 ring-1 ring-stone-300 shadow-[0_10px_24px_rgba(15,23,42,0.07)] transition-all duration-150 hover:-translate-y-px">
            <p className="text-sm text-stone-600">Reschedules</p>
            <p className="mt-2 text-2xl font-semibold text-stone-950" data-testid="metric-recent-reschedule-count">{recentRescheduleCount}</p>
          </div>
          <div className="rounded-[24px] bg-white p-5 ring-1 ring-stone-300 shadow-[0_10px_24px_rgba(15,23,42,0.07)] transition-all duration-150 hover:-translate-y-px">
            <p className="text-sm text-stone-600">Retries</p>
            <p className="mt-2 text-2xl font-semibold text-stone-950" data-testid="metric-recent-retry-count-ops">{recentRetryCount}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] bg-white ring-1 ring-stone-300 shadow-[0_12px_30px_rgba(15,23,42,0.09),inset_0_1px_0_rgba(255,255,255,0.86)]">
          <div className="border-b border-stone-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-stone-900">Recent activity</h3>
          </div>
          {recentActivityLogs.length === 0 ? (
            <p className="px-5 py-8 text-sm text-stone-500">No recent actions in this window. Try a wider time range.</p>
          ) : (
            <ul className="divide-y divide-stone-100" data-testid="dashboard-recent-activity-feed">
              {recentActivityLogs.map((log) => {
                const metadata = asActivityMetadata(log.metadata)
                const patient = metadata?.patientId ? recentPatientById.get(metadata.patientId) : null
                const appointment = metadata?.appointmentId ? recentAppointmentById.get(metadata.appointmentId) : null

                return (
                  <li key={log.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-stone-900">{activityLabel(log.eventType)}</p>
                        <p className="mt-0.5 text-sm text-stone-700">{activitySummary(log.eventType, metadata)}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-stone-500">
                          {patient && <span>{patient.firstName} {patient.lastName}</span>}
                          {appointment && <span>{formatDateTime(appointment.scheduledAt)}</span>}
                          {(log.userId ?? metadata?.actorUserId) ? <span>by {log.userId ?? metadata?.actorUserId}</span> : null}
                        </div>
                      </div>
                      <p className="shrink-0 text-xs text-stone-500">{formatDateTime(log.createdAt)}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] bg-white ring-1 ring-stone-300 shadow-[0_12px_30px_rgba(15,23,42,0.09),inset_0_1px_0_rgba(255,255,255,0.86)]">
        <div className="border-b border-stone-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-stone-900">Upcoming appointments</h2>
        </div>
        {upcomingAppointments.length === 0 ? (
          <p className="px-5 py-8 text-sm text-stone-500">No upcoming appointments.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-100 text-sm">
              <thead>
                <tr className="bg-stone-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-stone-700">Patient</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-stone-700">Doctor</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-stone-700">Service</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-stone-700">Scheduled</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-stone-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {upcomingAppointments.map((apt) => (
                  <tr key={apt.id} className="hover:bg-stone-50/80">
                    <td className="px-5 py-3 whitespace-nowrap font-semibold text-stone-900">
                      {apt.patient.firstName} {apt.patient.lastName}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-stone-700">
                      {(apt.doctor?.firstName ?? '')} {(apt.doctor?.lastName ?? '')}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-stone-700">{apt.service.name}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-stone-700">{formatDateTime(apt.scheduledAt)}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClasses(apt.status)}`}>
                        {statusLabel(apt.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[28px] bg-white ring-1 ring-stone-300 shadow-[0_12px_30px_rgba(15,23,42,0.09),inset_0_1px_0_rgba(255,255,255,0.86)]">
        <div className="border-b border-stone-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-stone-900">Pending reminders</h2>
        </div>
        {pendingReminders.length === 0 ? (
          <p className="px-5 py-8 text-sm text-stone-500">No pending reminders.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-100 text-sm">
              <thead>
                <tr className="bg-stone-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-stone-700">Patient</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-stone-700">Appointment</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-stone-700">Send at</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-stone-700">Type</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-stone-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {pendingReminders.map((rem) => (
                  <tr key={rem.id} className="hover:bg-stone-50/80">
                    <td className="px-5 py-3 whitespace-nowrap font-semibold text-stone-900">
                      {rem.appointment.patient.firstName} {rem.appointment.patient.lastName}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-stone-700">
                      {formatDateTime(rem.appointment.scheduledAt)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-stone-700">{formatDateTime(rem.scheduledAt)}</td>
                    <td className="px-5 py-3 whitespace-nowrap capitalize text-stone-700">{rem.type}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${reminderBadgeClasses(rem.status)}`}>
                        {rem.status}
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
