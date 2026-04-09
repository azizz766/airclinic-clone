import Link from 'next/link'
import { requireClinicPageAccess } from '@/lib/auth'
import { canRetryNotificationJob, canViewNotificationCenter } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { NotificationJobRetryButton } from '@/components/NotificationJobRetryButton'
import { NotificationJobStatus } from '@/lib/prisma-client/enums'
import type { Prisma } from '@/lib/prisma-client/client'

type NotificationFilter = 'all' | 'active' | 'sent' | 'failed'

const FILTER_OPTIONS: Array<{ value: NotificationFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Pending / Queued' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
]

type NotificationsPageProps = {
  params: Promise<{
    clinicId: string
  }>
  searchParams: Promise<{
    status?: string | string[]
  }>
}

function parseFilter(value: string | string[] | undefined): NotificationFilter {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : 'all'
  const valid = new Set(FILTER_OPTIONS.map((item) => item.value))
  return valid.has(raw as NotificationFilter) ? (raw as NotificationFilter) : 'all'
}

function formatDateTime(value: Date | null) {
  if (!value) return '-'
  return value.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function channelLabel(channel: string) {
  if (channel === 'whatsapp') return 'WhatsApp'
  if (channel === 'sms') return 'SMS'
  if (channel === 'email') return 'Email'
  return channel
}

function jobCategory(template: string | null, reminderType: string) {
  if (template === 'appointment_confirmation') return 'Appointment confirmation'
  if (template === 'appointment_reminder_24h') return '24-hour reminder'
  if (template === 'appointment_reminder_3h') return '3-hour reminder'
  if (template) return template.replace(/_/g, ' ')

  if (reminderType === 'whatsapp') return 'WhatsApp reminder'
  if (reminderType === 'sms') return 'SMS reminder'
  if (reminderType === 'email') return 'Email reminder'
  return 'Reminder'
}

function isInvalidated(errorMessage: string | null) {
  if (!errorMessage) return false
  return errorMessage.toLowerCase().includes('no longer valid')
}

function statusView(status: string, errorMessage: string | null) {
  if (status === 'failed' && isInvalidated(errorMessage)) {
    return {
      label: 'outdated',
      classes: 'bg-stone-100 text-stone-600',
    }
  }

  if (status === 'pending') return { label: 'pending', classes: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' }
  if (status === 'queued') return { label: 'queued', classes: 'bg-sky-50 text-sky-700' }
  if (status === 'sent') return { label: 'sent', classes: 'bg-emerald-50 text-emerald-700' }
  if (status === 'failed') return { label: 'failed', classes: 'bg-red-50 text-red-700 ring-1 ring-red-200' }

  return { label: status, classes: 'bg-stone-100 text-stone-600' }
}

function shortError(value: string | null) {
  if (!value) return '-'
  return value.length > 100 ? `${value.slice(0, 97)}...` : value
}

function isRetryable(status: string, channel: string, errorMessage: string | null) {
  return status === 'failed' && channel === 'whatsapp' && !isInvalidated(errorMessage)
}

export default async function NotificationsPage({ params, searchParams }: NotificationsPageProps) {
  const { clinicId } = await params
  const query = await searchParams
  const access = await requireClinicPageAccess(clinicId, canViewNotificationCenter)
  const filter = parseFilter(query.status)
  const canRetryJobs = canRetryNotificationJob(access.role)

  const where: Prisma.NotificationJobWhereInput = { clinicId }
  if (filter === 'active') {
    where.status = { in: [NotificationJobStatus.pending, NotificationJobStatus.queued] }
  } else if (filter === 'sent') {
    where.status = NotificationJobStatus.sent
  } else if (filter === 'failed') {
    where.status = NotificationJobStatus.failed
  }

  const [
    totalCount,
    pendingQueuedCount,
    sentCount,
    failedCount,
    jobs,
  ] = await Promise.all([
    prisma.notificationJob.count({ where: { clinicId } }),
    prisma.notificationJob.count({ where: { clinicId, status: { in: [NotificationJobStatus.pending, NotificationJobStatus.queued] } } }),
    prisma.notificationJob.count({ where: { clinicId, status: NotificationJobStatus.sent } }),
    prisma.notificationJob.count({ where: { clinicId, status: NotificationJobStatus.failed } }),
    prisma.notificationJob.findMany({
      where,
      include: {
        reminder: {
          select: {
            type: true,
            template: true,
          },
        },
        patient: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 200,
    }),
  ])

  const filterHref = (value: NotificationFilter) => {
    if (value === 'all') return `/${clinicId}/notifications`
    return `/${clinicId}/notifications?status=${value}`
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f7f4ef_0%,#f4f1fb_44%,#f8f6f2_100%)] p-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Notifications</h1>
        <p className="mt-0.5 text-sm text-stone-500">Track delivery status and retry failed WhatsApp messages.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-white/92 p-5 ring-1 ring-black/5 shadow-sm transition-all duration-150 hover:-translate-y-px">
          <p className="text-sm text-stone-500">Total</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">{totalCount}</p>
        </div>
        <div className="rounded-xl bg-white/92 p-5 ring-1 ring-black/5 shadow-sm transition-all duration-150 hover:-translate-y-px">
          <p className="text-sm text-stone-500">Pending / Queued</p>
          <p className="mt-2 text-2xl font-semibold text-amber-700">{pendingQueuedCount}</p>
        </div>
        <div className="rounded-xl bg-white/92 p-5 ring-1 ring-black/5 shadow-sm transition-all duration-150 hover:-translate-y-px">
          <p className="text-sm text-stone-500">Sent</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700">{sentCount}</p>
        </div>
        <div className="rounded-xl bg-white/92 p-5 ring-1 ring-black/5 shadow-sm transition-all duration-150 hover:-translate-y-px">
          <p className="text-sm text-stone-500">Failed</p>
          <p className="mt-2 text-2xl font-semibold text-red-600">{failedCount}</p>
        </div>
      </section>

      <section className="flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map((option) => {
          const active = option.value === filter
          return (
            <Link
              key={option.value}
              href={filterHref(option.value)}
              className={active
                ? 'rounded-full bg-violet-600 px-4 py-1.5 text-sm font-medium text-white shadow-[0_10px_28px_rgba(109,40,217,0.28)] transition-all duration-150 hover:-translate-y-px'
                : 'rounded-full bg-white/90 px-4 py-1.5 text-sm font-medium text-stone-600 ring-1 ring-black/[0.04] shadow-[0_8px_20px_rgba(15,23,42,0.03)] transition-all duration-150 hover:-translate-y-px hover:bg-white'}
            >
              {option.label}
            </Link>
          )
        })}
      </section>

      <section className="overflow-hidden rounded-2xl bg-white/92 ring-1 ring-black/5 shadow-sm">
        <div className="border-b border-stone-100 px-5 py-4">
          <p className="text-sm text-stone-500">{jobs.length} notification job{jobs.length !== 1 ? 's' : ''}</p>
        </div>

        {jobs.length === 0 ? (
          <div className="px-5 py-10 text-center space-y-1">
            <p className="text-sm text-stone-500">No jobs match this filter.</p>
            <p className="text-xs text-stone-400">Try switching filters or check back after new reminders are generated.</p>
          </div>
        ) : (
          <ul className="space-y-2 p-3">
            {jobs.map((job) => {
              const patientName = `${job.patient.firstName} ${job.patient.lastName}`.trim()
              const status = statusView(job.status, job.errorMessage)

              return (
                <li key={job.id} className="rounded-xl bg-white px-4 py-3.5 ring-1 ring-black/5 shadow-sm transition-all duration-150 hover:-translate-y-px">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-stone-900">{patientName || 'Unknown patient'}</p>
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${status.classes}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-stone-500">
                        {jobCategory(job.reminder.template, job.reminder.type)} · {channelLabel(job.channel)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-400">
                        <span>{job.destination}</span>
                        {job.scheduledFor && <span>Scheduled {formatDateTime(job.scheduledFor)}</span>}
                        {job.sentAt && <span>Sent {formatDateTime(job.sentAt)}</span>}
                        {job.errorMessage && !isInvalidated(job.errorMessage) && (
                          <span className="text-red-600">{shortError(job.errorMessage)}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 self-center text-right">
                      {isRetryable(job.status, job.channel, job.errorMessage) && canRetryJobs ? (
                        <NotificationJobRetryButton clinicId={clinicId} jobId={job.id} />
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
