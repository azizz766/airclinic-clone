import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { normalizeClinicRole, canOperateInbox, canViewInbox } from '@/lib/auth/permissions'
import { sendWhatsAppWithOutcomeLogging } from '@/lib/whatsapp/delivery-outcome'
import { ConversationContextSidebar } from '@/components/inbox/ConversationContextSidebar'

type InboxPageProps = {
  params: Promise<{
    clinicId: string
  }>
  searchParams: Promise<{
    conversation?: string | string[]
    filter?: string | string[]
  }>
}

type InboxFilter = 'all' | 'attention' | 'assigned_to_me' | 'unassigned' | 'human_active' | 'closed'

type TimelineKind = 'inbound' | 'outbound' | 'ai' | 'system'

type TimelineEvent = {
  id: string
  at: Date
  kind: TimelineKind
  title: string
  text: string
  eventType: string
  metadata: unknown
}

type ConversationSummary = {
  key: string
  phone: string
  conversationState: 'ai_active' | 'human_active' | 'closed'
  assignedUserId: string | null
  assignedUserName: string | null
  patientName: string | null
  lastUpdatedAt: Date
  lastMessagePreview: string
  aiStatus: 'booking' | 'reschedule' | 'inquiry' | 'unknown'
  deliveryStatus: 'sent' | 'failed' | 'mocked' | 'unknown'
  lastAiIntent: string | null
  lastAiConfidence: 'low' | 'medium' | 'high' | null
  llmFallbackUsed: boolean
  needsAttention: boolean
  attentionReason: 'ai_unknown' | 'low_confidence' | 'delivery_failed' | 'no_user_response' | 'llm_fallback_used' | null
  healthLevel: 'red' | 'yellow' | 'green'
  linkedAppointmentId: string | null
  linkedAppointmentAt: Date | null
  stateEventAt: Date | null
  assignmentEventAt: Date | null
  timeline: TimelineEvent[]
}

function normalizePhoneKey(value: string) {
  return value.trim().toLowerCase().replace('whatsapp:', '').replace(/\s+/g, '')
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

function safeMetadataObject(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return null
  return metadata as Record<string, unknown>
}

function extractPhoneFromLog(log: { entityId: string; metadata: unknown }) {
  const metadata = safeMetadataObject(log.metadata)
  const candidates = [
    typeof metadata?.phoneNormalized === 'string' ? metadata.phoneNormalized : null,
    typeof metadata?.to === 'string' ? metadata.to : null,
    typeof metadata?.destination === 'string' ? metadata.destination : null,
    log.entityId,
  ]

  for (const raw of candidates) {
    if (!raw) continue
    const normalized = normalizePhoneKey(raw)
    if (/^\+?\d{8,}$/.test(normalized)) {
      return normalized
    }
  }

  return null
}

function extractInboundTextFromLog(metadata: Record<string, unknown> | null, fallback: string) {
  if (!metadata) return fallback

  if (typeof metadata.replyRaw === 'string' && metadata.replyRaw.trim()) {
    return metadata.replyRaw.trim()
  }

  if (typeof metadata.messageBody === 'string' && metadata.messageBody.trim()) {
    return metadata.messageBody.trim()
  }

  return fallback
}

function inferAiStatus(events: TimelineEvent[]): ConversationSummary['aiStatus'] {
  const aiEvent = events.find((event) => event.kind === 'ai')
  if (!aiEvent) return 'unknown'

  const type = aiEvent.eventType.toLowerCase()

  if (type.includes('booking')) return 'booking'
  if (type.includes('reschedule')) return 'reschedule'
  if (type.includes('inquiry')) return 'inquiry'
  return 'unknown'
}

function aiBadgeClasses(status: ConversationSummary['aiStatus']) {
  if (status === 'booking') return 'bg-emerald-50 text-emerald-700'
  if (status === 'reschedule') return 'bg-amber-50 text-amber-700'
  if (status === 'inquiry') return 'bg-sky-50 text-sky-700'
  return 'bg-stone-100 text-stone-600'
}

function deliveryBadgeClasses(status: ConversationSummary['deliveryStatus']) {
  if (status === 'sent') return 'bg-emerald-50 text-emerald-700'
  if (status === 'failed') return 'bg-red-50 text-red-700 ring-1 ring-red-200'
  if (status === 'mocked') return 'bg-violet-50 text-violet-700'
  return 'bg-stone-100 text-stone-600'
}

function kindStyles(kind: TimelineKind) {
  if (kind === 'outbound') {
    return 'rounded-2xl bg-emerald-50/80 border-l-[3px] border-l-emerald-500 px-4 py-4 ring-1 ring-emerald-200 shadow-[0_10px_24px_rgba(5,150,105,0.08)]'
  }

  if (kind === 'system') {
    return 'rounded-2xl bg-stone-50 px-3.5 py-3 ring-1 ring-stone-200'
  }

  if (kind === 'inbound') {
    return 'rounded-2xl bg-white px-4 py-4 ring-1 ring-stone-200 border-l-[3px] border-l-sky-400 shadow-[0_10px_24px_rgba(15,23,42,0.05)]'
  }

  return 'rounded-2xl bg-violet-50/70 px-4 py-4 ring-1 ring-violet-200 border-l-[3px] border-l-violet-400 shadow-[0_10px_24px_rgba(109,40,217,0.08)]'
}

function isStaffActionEvent(event: TimelineEvent) {
  return [
    'whatsapp_human_control_state',
    'whatsapp_assignment',
    'whatsapp_human_reply_sent',
  ].includes(event.eventType)
}

function eventRoleLabel(event: TimelineEvent) {
  if (isStaffActionEvent(event)) return 'Staff action'
  if (event.kind === 'outbound') return 'Outbound'
  if (event.kind === 'inbound') return 'Inbound'
  if (event.kind === 'system') return 'System event'
  return 'Assistant event'
}

function eventRoleLabelClasses(event: TimelineEvent) {
  if (isStaffActionEvent(event)) return 'text-violet-700'
  if (event.kind === 'outbound') return 'text-emerald-700'
  if (event.kind === 'inbound') return 'text-sky-700'
  if (event.kind === 'system') return 'text-stone-500'
  return 'text-violet-700'
}

function extractIntentFromMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return null

  // Priority order: final fields first, then rule-level fallbacks
  const candidates = [
    metadata.finalIntent,
    metadata.intent,
    metadata.aiIntent,
    metadata.aiIntentRule,
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim().toLowerCase()
    }
  }

  // Infer from session flow field (whatsapp_session logs store this in DB)
  if (metadata.flow === 'availability_flow') return 'availability_check'
  if (metadata.flow === 'booking_flow') return 'new_booking'
  if (metadata.flow === 'reschedule_flow') return 'reschedule'

  return null
}

function extractConfidenceFromMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return null

  // Priority order: final fields first, then rule-level fallbacks
  const candidates = [
    metadata.finalConfidence,
    metadata.confidence,
    metadata.aiConfidence,
    metadata.aiConfidenceRule,
  ]

  for (const value of candidates) {
    if (value === 'low' || value === 'medium' || value === 'high') {
      return value as 'low' | 'medium' | 'high'
    }
  }

  return null
}

function extractFallbackUsedFromMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return false
  return metadata.llmFallbackUsed === true
}

function inferAttention(conversation: ConversationSummary): {
  needsAttention: boolean
  attentionReason: ConversationSummary['attentionReason']
  healthLevel: ConversationSummary['healthLevel']
} {
  if (conversation.lastAiIntent === 'unknown') {
    return { needsAttention: true, attentionReason: 'ai_unknown', healthLevel: 'red' }
  }

  if (conversation.lastAiConfidence === 'low') {
    return { needsAttention: true, attentionReason: 'low_confidence', healthLevel: 'yellow' }
  }

  if (conversation.deliveryStatus === 'failed') {
    return { needsAttention: true, attentionReason: 'delivery_failed', healthLevel: 'red' }
  }

  const now = Date.now()
  const lastOutbound = conversation.timeline
    .filter((event) => event.kind === 'outbound')
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0]
  const lastInbound = conversation.timeline
    .filter((event) => event.kind === 'inbound')
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0]

  if (
    lastOutbound
    && now - lastOutbound.at.getTime() > 10 * 60 * 1000
    && (!lastInbound || lastInbound.at.getTime() < lastOutbound.at.getTime())
  ) {
    return { needsAttention: true, attentionReason: 'no_user_response', healthLevel: 'yellow' }
  }

  if (conversation.llmFallbackUsed) {
    return { needsAttention: true, attentionReason: 'llm_fallback_used', healthLevel: 'yellow' }
  }

  return { needsAttention: false, attentionReason: null, healthLevel: 'green' }
}

function attentionBadgeClasses(level: ConversationSummary['healthLevel']) {
  if (level === 'red') return 'bg-red-50 text-red-700'
  if (level === 'yellow') return 'bg-amber-50 text-amber-700'
  return 'bg-emerald-50 text-emerald-700'
}

function attentionBadgeText(conversation: ConversationSummary) {
  if (conversation.healthLevel === 'red') return 'Needs Attention'
  if (conversation.healthLevel === 'yellow') return 'Risk'
  return 'Healthy'
}

function statusDotClasses(level: ConversationSummary['healthLevel']) {
  if (level === 'red') return 'bg-red-500'
  if (level === 'yellow') return 'bg-amber-500'
  return 'bg-emerald-500'
}

function eventLabels(event: TimelineEvent, conversation: ConversationSummary) {
  const metadata = safeMetadataObject(event.metadata)
  const labels: string[] = []
  const latestOutboundAt = conversation.timeline
    .filter((item) => item.kind === 'outbound')
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0]?.at

  if (
    event.eventType === 'whatsapp_delivery_outcome'
    && metadata
    && metadata.success === false
  ) {
    labels.push('Message failed to send')
  }

  if (metadata?.llmFallbackUsed === true || (conversation.attentionReason === 'llm_fallback_used' && event.kind === 'ai')) {
    labels.push('AI fallback used')
  }

  if (event.eventType === 'whatsapp_booking_created') {
    labels.push('Booking created')
  }

  if (event.eventType.includes('reschedule')) {
    labels.push('Reschedule event')
  }

  if (
    conversation.attentionReason === 'no_user_response'
    && event.kind === 'outbound'
    && latestOutboundAt
    && event.at.getTime() === latestOutboundAt.getTime()
  ) {
    labels.push('Waiting for user response')
  }

  return labels
}

function extractConversationStateFromMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return null
  if (metadata.conversationState === 'ai_active') return 'ai_active'
  if (metadata.conversationState === 'human_active') return 'human_active'
  if (metadata.conversationState === 'closed') return 'closed'
  return null
}

function conversationStateBadgeClasses(state: ConversationSummary['conversationState']) {
  if (state === 'human_active') return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
  if (state === 'closed') return 'bg-stone-100 text-stone-600'
  return 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
}

function conversationStateLabel(state: ConversationSummary['conversationState']) {
  if (state === 'human_active') return 'Handled by staff'
  if (state === 'closed') return 'Closed'
  return 'Handled by assistant'
}

function workflowSummary(conversation: ConversationSummary) {
  if (conversation.lastAiIntent === 'reschedule') return 'Patient wants to reschedule'
  if (conversation.lastAiIntent === 'new_booking') return 'Patient wants to book'
  if (conversation.lastAiIntent === 'availability_check') return 'Patient asked about availability'
  return conversationStateLabel(conversation.conversationState)
}

function deliveryLabel(status: ConversationSummary['deliveryStatus']) {
  if (status === 'mocked') return 'Test Mode'
  if (status === 'failed') return 'Delivery failed'
  if (status === 'sent') return 'Delivered'
  return 'Delivery unknown'
}

function extractAssignedUserIdFromMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return null
  if (typeof metadata.assignedUserId === 'string' && metadata.assignedUserId.trim()) {
    return metadata.assignedUserId
  }
  return null
}

function parseInboxFilter(value: string | string[] | undefined): InboxFilter {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : 'all'
  const valid: InboxFilter[] = ['all', 'attention', 'assigned_to_me', 'unassigned', 'human_active', 'closed']
  return valid.includes(raw as InboxFilter) ? (raw as InboxFilter) : 'all'
}

function filterEmptyMessage(filter: InboxFilter) {
  if (filter === 'attention') return 'No urgent conversations right now. New risky threads will appear here automatically.'
  if (filter === 'assigned_to_me') return 'You have no assigned conversations. Try the Unassigned filter to pick one up.'
  if (filter === 'unassigned') return 'No unassigned conversations. All active threads currently have an owner.'
  if (filter === 'human_active') return 'No staff-handled conversations right now. Switch to All to review assistant-handled threads.'
  if (filter === 'closed') return 'No closed conversations in this view yet.'
  return 'No WhatsApp conversations yet. New patient messages will show up here.'
}

function calculateAverageResponseDelayMinutes(conversations: ConversationSummary[]) {
  const delays: number[] = []

  for (const conversation of conversations) {
    const chronological = [...conversation.timeline].sort((a, b) => a.at.getTime() - b.at.getTime())

    for (let i = 0; i < chronological.length; i += 1) {
      const event = chronological[i]
      if (event.kind !== 'outbound') continue

      const nextInbound = chronological.slice(i + 1).find((candidate) => candidate.kind === 'inbound')
      if (!nextInbound) continue

      const diffMinutes = (nextInbound.at.getTime() - event.at.getTime()) / (1000 * 60)
      if (diffMinutes >= 0) {
        delays.push(diffMinutes)
      }
    }
  }

  if (delays.length === 0) return null
  return Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length)
}

export default async function InboxPage({ params, searchParams }: InboxPageProps) {
  const { clinicId } = await params
  const query = await searchParams

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
      isActive: true,
    },
    select: {
      id: true,
      role: true,
    },
  })

  if (!membership) {
    redirect('/onboarding')
  }

  const role = normalizeClinicRole(membership.role)
  if (!canViewInbox(role)) {
    redirect(`/${clinicId}/appointments`)
  }

  const canOperateInboxActions = canOperateInbox(role)

  async function setConversationStateAction(formData: FormData) {
    'use server'

    const phone = normalizePhoneKey(String(formData.get('phone') ?? ''))
    const stateRaw = String(formData.get('state') ?? '')
    const nextState = stateRaw === 'human_active' || stateRaw === 'closed' || stateRaw === 'ai_active'
      ? stateRaw
      : null

    if (!phone || !nextState) return

    const actionSupabase = await createClient()
    const {
      data: { session: actionSession },
    } = await actionSupabase.auth.getSession()

    if (!actionSession) return

    const actionMembership = await prisma.membership.findFirst({
      where: {
        userId: actionSession.user.id,
        clinicId,
      },
      select: { id: true, role: true },
    })

    if (!actionMembership) return

    const actionRole = normalizeClinicRole(actionMembership.role)
    if (!canOperateInbox(actionRole)) return

    await prisma.escalationLog.create({
      data: {
        clinicId,
        entityType: 'system',
        entityId: phone,
        eventType: 'whatsapp_human_control_state',
        severity: 'info',
        message: `Conversation state set to ${nextState}.`,
        metadata: {
          phoneNormalized: phone,
          conversationState: nextState,
          actorUserId: actionSession.user.id,
        },
      },
    })

    revalidatePath(`/${clinicId}/inbox`)
  }

  async function assignToMeAction(formData: FormData) {
    'use server'

    const phone = normalizePhoneKey(String(formData.get('phone') ?? ''))
    if (!phone) return

    const actionSupabase = await createClient()
    const {
      data: { session: actionSession },
    } = await actionSupabase.auth.getSession()

    if (!actionSession) return

    const actionMembership = await prisma.membership.findFirst({
      where: {
        userId: actionSession.user.id,
        clinicId,
      },
      select: { id: true, role: true },
    })

    if (!actionMembership) return

    const actionRole = normalizeClinicRole(actionMembership.role)
    if (!canOperateInbox(actionRole)) return

    await prisma.escalationLog.create({
      data: {
        clinicId,
        entityType: 'system',
        entityId: phone,
        eventType: 'whatsapp_assignment',
        severity: 'info',
        message: 'Conversation assigned to user.',
        metadata: {
          phoneNormalized: phone,
          assignedUserId: actionSession.user.id,
          actorUserId: actionSession.user.id,
        },
      },
    })

    revalidatePath(`/${clinicId}/inbox`)
  }

  async function sendManualReplyAction(formData: FormData) {
    'use server'

    const phone = normalizePhoneKey(String(formData.get('phone') ?? ''))
    const body = String(formData.get('body') ?? '').trim()

    if (!phone || !body) return

    const actionSupabase = await createClient()
    const {
      data: { session: actionSession },
    } = await actionSupabase.auth.getSession()

    if (!actionSession) return

    const actionMembership = await prisma.membership.findFirst({
      where: {
        userId: actionSession.user.id,
        clinicId,
      },
      select: { id: true, role: true },
    })

    if (!actionMembership) return

    const actionRole = normalizeClinicRole(actionMembership.role)
    if (!canOperateInbox(actionRole)) return

    const latestState = await prisma.escalationLog.findFirst({
      where: {
        clinicId,
        eventType: 'whatsapp_human_control_state',
        entityId: phone,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        metadata: true,
      },
    })

    const state = extractConversationStateFromMetadata(safeMetadataObject(latestState?.metadata ?? null)) ?? 'ai_active'
    if (state !== 'human_active') return

    const latestAssignment = await prisma.escalationLog.findFirst({
      where: {
        clinicId,
        eventType: 'whatsapp_assignment',
        entityId: phone,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        metadata: true,
      },
    })

    const assignedUserId = extractAssignedUserIdFromMetadata(safeMetadataObject(latestAssignment?.metadata ?? null))
    if (assignedUserId && assignedUserId !== actionSession.user.id) return

    const last8 = phone.replace(/\D/g, '').slice(-8)
    const patientForOutbound = last8
      ? await prisma.patient.findFirst({
          where: { clinicId, phone: { endsWith: last8 } },
          select: { id: true },
        })
      : null

    await sendWhatsAppWithOutcomeLogging({
      to: phone,
      body,
      meta: {
        action: 'human_manual_reply',
        clinicId,
        entityType: 'conversation',
        entityId: phone,
      },
      patientContext: patientForOutbound
        ? { clinicId, patientId: patientForOutbound.id, patientPhone: phone }
        : undefined,
    })

    await prisma.escalationLog.create({
      data: {
        clinicId,
        entityType: 'system',
        entityId: phone,
        eventType: 'whatsapp_human_reply_sent',
        severity: 'info',
        message: 'Manual human WhatsApp reply sent from inbox.',
        metadata: {
          phoneNormalized: phone,
          conversationState: 'human_active',
          actorUserId: actionSession.user.id,
          messageBody: body,
        },
      },
    })

    revalidatePath(`/${clinicId}/inbox`)
  }

  const [logs, outboundJobs] = await Promise.all([
    prisma.escalationLog.findMany({
      where: {
        clinicId,
        eventType: {
          startsWith: 'whatsapp_',
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 600,
    }),
    prisma.notificationJob.findMany({
      where: {
        clinicId,
        channel: 'whatsapp',
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        appointment: {
          select: {
            id: true,
            scheduledAt: true,
            doctor: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 400,
    }),
  ])

  const conversations = new Map<string, ConversationSummary>()

  for (const job of outboundJobs) {
    const phone = normalizePhoneKey(job.destination)

    if (!conversations.has(phone)) {
      conversations.set(phone, {
        key: phone,
        phone,
        conversationState: 'ai_active',
        assignedUserId: null,
        assignedUserName: null,
        patientName: job.patient ? `${job.patient.firstName} ${job.patient.lastName}`.trim() : null,
        lastUpdatedAt: job.sentAt ?? job.createdAt,
        lastMessagePreview: job.messageBody.slice(0, 120),
        aiStatus: 'unknown',
        deliveryStatus: job.status === 'failed' ? 'failed' : job.status === 'sent' ? 'sent' : 'unknown',
        lastAiIntent: null,
        lastAiConfidence: null,
        llmFallbackUsed: false,
        needsAttention: false,
        attentionReason: null,
        healthLevel: 'green',
        linkedAppointmentId: job.appointmentId,
        linkedAppointmentAt: job.appointment?.scheduledAt ?? null,
        stateEventAt: null,
        assignmentEventAt: null,
        timeline: [],
      })
    }

    const item = conversations.get(phone)
    if (!item) continue

    item.timeline.push({
      id: `job-${job.id}`,
      at: job.sentAt ?? job.createdAt,
      kind: 'outbound',
      title: 'Outbound WhatsApp',
      text: job.messageBody,
      eventType: `notification_job_${job.status}`,
      metadata: {
        notificationJobId: job.id,
        providerMessageId: job.providerMessageId,
        status: job.status,
        destination: job.destination,
      },
    })

    const eventAt = job.sentAt ?? job.createdAt
    if (eventAt > item.lastUpdatedAt) {
      item.lastUpdatedAt = eventAt
      item.lastMessagePreview = job.messageBody.slice(0, 120)
    }
  }

  for (const log of logs) {
    const metadata = safeMetadataObject(log.metadata)
    const phone = extractPhoneFromLog(log)
    if (!phone) continue

    if (!conversations.has(phone)) {
      conversations.set(phone, {
        key: phone,
        phone,
        conversationState: 'ai_active',
        assignedUserId: null,
        assignedUserName: null,
        patientName: null,
        lastUpdatedAt: log.createdAt,
        lastMessagePreview: log.message.slice(0, 120),
        aiStatus: 'unknown',
        deliveryStatus: 'unknown',
        lastAiIntent: null,
        lastAiConfidence: null,
        llmFallbackUsed: false,
        needsAttention: false,
        attentionReason: null,
        healthLevel: 'green',
        linkedAppointmentId: log.entityType === 'appointment' ? log.entityId : null,
        linkedAppointmentAt: null,
        stateEventAt: null,
        assignmentEventAt: null,
        timeline: [],
      })
    }

    const item = conversations.get(phone)
    if (!item) continue

    const isInbound = typeof metadata?.replyRaw === 'string' && metadata.replyRaw.trim().length > 0
    const isOutboundDelivery = log.eventType === 'whatsapp_delivery_outcome' && typeof metadata?.messageBody === 'string'
    const isAi = /reply_|reschedule|booking|session|context/i.test(log.eventType)

    let kind: TimelineKind = 'system'
    if (isInbound) kind = 'inbound'
    else if (isOutboundDelivery) kind = 'outbound'
    else if (isAi) kind = 'ai'

    item.timeline.push({
      id: `log-${log.id}`,
      at: log.createdAt,
      kind,
      title: `Event: ${log.eventType}`,
      text: extractInboundTextFromLog(metadata, log.message),
      eventType: log.eventType,
      metadata: log.metadata,
    })

    if (log.createdAt > item.lastUpdatedAt) {
      item.lastUpdatedAt = log.createdAt
      item.lastMessagePreview = extractInboundTextFromLog(metadata, log.message).slice(0, 120)
    }

    if (!item.linkedAppointmentId && log.entityType === 'appointment') {
      item.linkedAppointmentId = log.entityId
    }

    if (log.eventType === 'whatsapp_delivery_outcome') {
      const mocked = Boolean(metadata?.mocked)
      const success = Boolean(metadata?.success)
      item.deliveryStatus = mocked ? 'mocked' : success ? 'sent' : 'failed'
    }

    const extractedIntent = extractIntentFromMetadata(metadata)
    if (extractedIntent) {
      item.lastAiIntent = extractedIntent
    }

    const extractedConfidence = extractConfidenceFromMetadata(metadata)
    if (extractedConfidence) {
      item.lastAiConfidence = extractedConfidence
    }

    if (extractFallbackUsedFromMetadata(metadata)) {
      item.llmFallbackUsed = true
    }

    const extractedState = extractConversationStateFromMetadata(metadata)
    if (extractedState && (!item.stateEventAt || log.createdAt > item.stateEventAt)) {
      item.conversationState = extractedState
      item.stateEventAt = log.createdAt
    }

    if (log.eventType === 'whatsapp_assignment') {
      const extractedAssignedUserId = extractAssignedUserIdFromMetadata(metadata)
      if (extractedAssignedUserId && (!item.assignmentEventAt || log.createdAt > item.assignmentEventAt)) {
        item.assignedUserId = extractedAssignedUserId
        item.assignmentEventAt = log.createdAt
      }
    }
  }

  const assignedUserIds = Array.from(new Set(
    Array.from(conversations.values())
      .map((c) => c.assignedUserId)
      .filter((v): v is string => Boolean(v))
  ))

  if (assignedUserIds.length > 0) {
    const assignedUsers = await prisma.user.findMany({
      where: {
        id: {
          in: assignedUserIds,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    })

    const namesById = new Map(assignedUsers.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email]))
    for (const conversation of conversations.values()) {
      if (conversation.assignedUserId) {
        conversation.assignedUserName = namesById.get(conversation.assignedUserId) ?? null
      }
    }
  }

  const orderedConversations = Array.from(conversations.values())
    .map((conversation) => {
      conversation.timeline.sort((a, b) => b.at.getTime() - a.at.getTime())
      conversation.aiStatus = inferAiStatus(conversation.timeline)
      if (conversation.conversationState === 'closed') {
        conversation.needsAttention = false
        conversation.attentionReason = null
        conversation.healthLevel = 'green'
      } else {
      const attention = inferAttention(conversation)
      conversation.needsAttention = attention.needsAttention
      conversation.attentionReason = attention.attentionReason
      conversation.healthLevel = attention.healthLevel
      }

      console.log('[INBOX ANALYSIS]', {
        phone: conversation.phone,
        needsAttention: conversation.needsAttention,
        attentionReason: conversation.attentionReason,
      })

      return conversation
    })
    .sort((a, b) => b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime())

  const currentFilter = parseInboxFilter(query.filter)
  const filteredConversations = orderedConversations.filter((conversation) => {
    if (currentFilter === 'attention') return conversation.needsAttention
    if (currentFilter === 'assigned_to_me') return conversation.assignedUserId === session.user.id
    if (currentFilter === 'unassigned') return !conversation.assignedUserId
    if (currentFilter === 'human_active') return conversation.conversationState === 'human_active'
    if (currentFilter === 'closed') return conversation.conversationState === 'closed'
    return true
  })

  const deliveryFailureCount = logs.filter((log) => {
    if (log.eventType !== 'whatsapp_delivery_outcome') return false
    const metadata = safeMetadataObject(log.metadata)
    return metadata?.success === false
  }).length

  const avgResponseDelayMinutes = calculateAverageResponseDelayMinutes(orderedConversations)

  const analyticsCards = [
    { label: 'Total Conversations', value: String(orderedConversations.length) },
    { label: 'Needs Attention', value: String(orderedConversations.filter((c) => c.needsAttention).length) },
    { label: 'Human Active', value: String(orderedConversations.filter((c) => c.conversationState === 'human_active').length) },
    { label: 'Closed Conversations', value: String(orderedConversations.filter((c) => c.conversationState === 'closed').length) },
    { label: 'Avg Response Delay (min)', value: avgResponseDelayMinutes === null ? '-' : String(avgResponseDelayMinutes) },
    { label: 'Delivery Failures', value: String(deliveryFailureCount) },
  ]

  const selectedConversationKey = typeof query.conversation === 'string'
    ? normalizePhoneKey(query.conversation)
    : Array.isArray(query.conversation) && query.conversation.length > 0
      ? normalizePhoneKey(query.conversation[0])
      : orderedConversations[0]?.key ?? null

  const selectedConversation = selectedConversationKey
    ? orderedConversations.find((item) => item.key === selectedConversationKey) ?? null
    : null

  const selectedConversationLast8 = selectedConversation
    ? selectedConversation.phone.replace(/\D/g, '').slice(-8)
    : ''

  const sidebarPatientRaw = selectedConversationLast8
    ? await prisma.patient.findFirst({
        where: {
          clinicId,
          phone: {
            endsWith: selectedConversationLast8,
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          _count: {
            select: {
              appointments: true,
            },
          },
        },
      })
    : null

  const sidebarAppointmentRaw = sidebarPatientRaw
    ? await prisma.appointment.findFirst({
        where: {
          clinicId,
          patientId: sidebarPatientRaw.id,
          status: {
            in: ['scheduled', 'confirmation_pending', 'confirmed'],
          },
        },
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          doctor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          service: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          scheduledAt: 'asc',
        },
      })
    : null

  const sidebarPatient = sidebarPatientRaw
    ? {
        id: sidebarPatientRaw.id,
        name: `${sidebarPatientRaw.firstName} ${sidebarPatientRaw.lastName}`.trim() || 'Unknown patient',
        phone: sidebarPatientRaw.phone,
        totalAppointments: sidebarPatientRaw._count.appointments,
      }
    : null

  const sidebarAppointment = sidebarAppointmentRaw
    ? {
        id: sidebarAppointmentRaw.id,
        scheduledAtIso: sidebarAppointmentRaw.scheduledAt.toISOString(),
        doctorId: sidebarAppointmentRaw.doctor.id,
        doctorName: `${sidebarAppointmentRaw.doctor.firstName} ${sidebarAppointmentRaw.doctor.lastName}`.trim() || 'Unknown doctor',
        serviceId: sidebarAppointmentRaw.service.id,
        serviceName: sidebarAppointmentRaw.service.name,
        status: sidebarAppointmentRaw.status,
      }
    : null

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f4ef_0%,#f4f1fb_44%,#f8f6f2_100%)]">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-stone-900">WhatsApp Inbox</h1>
          <p className="mt-0.5 text-sm text-stone-500">Track patient conversations, ownership, and next actions.</p>
        </div>

        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {analyticsCards.map((card) => (
            <article key={card.label} className="rounded-xl bg-white/92 px-4 py-4 ring-1 ring-black/5 shadow-sm transition-all duration-150 hover:-translate-y-px">
              <p className="text-sm text-stone-500">{card.label}</p>
              <p className="mt-1.5 text-2xl font-semibold text-stone-900">{card.value}</p>
            </article>
          ))}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Conversation list */}
          <section className="overflow-hidden rounded-2xl bg-white/95 ring-1 ring-stone-200 shadow-[0_10px_24px_rgba(15,23,42,0.05)] lg:col-span-1">
            <div className="border-b border-stone-100 px-4 py-4">
              <h2 className="text-sm font-semibold text-stone-900">Conversations</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {([
                  ['all', 'All'],
                  ['attention', 'Attention'],
                  ['assigned_to_me', 'Mine'],
                  ['unassigned', 'Unassigned'],
                  ['human_active', 'Staff'],
                  ['closed', 'Closed'],
                ] as Array<[InboxFilter, string]>).map(([filterValue, label]) => {
                  const isActiveFilter = currentFilter === filterValue
                  return (
                    <Link
                      key={filterValue}
                      href={`/${clinicId}/inbox?filter=${encodeURIComponent(filterValue)}`}
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${isActiveFilter ? 'bg-violet-600 text-white shadow-[0_10px_28px_rgba(109,40,217,0.28)] hover:-translate-y-px' : 'bg-white/90 text-stone-600 ring-1 ring-black/[0.04] hover:-translate-y-px hover:bg-white'}`}
                    >
                      {label}
                    </Link>
                  )
                })}
              </div>
            </div>

            {filteredConversations.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-stone-400">{filterEmptyMessage(currentFilter)}</div>
            ) : (
              <ul className="divide-y divide-stone-100">
                {filteredConversations.map((conversation) => {
                  const isActive = selectedConversationKey === conversation.key
                  return (
                    <li key={conversation.key}>
                      <Link
                        href={`/${clinicId}/inbox?filter=${encodeURIComponent(currentFilter)}&conversation=${encodeURIComponent(conversation.key)}`}
                        className={`relative block px-4 py-[18px] transition-all duration-150 ${isActive ? 'bg-violet-50/80' : 'hover:-translate-y-px hover:bg-stone-50/80'}`}
                      >
                            {isActive ? <span className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-violet-500" aria-hidden="true" /> : null}
                          <div className="flex items-start justify-between gap-3.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-stone-900">
                                {conversation.patientName || conversation.phone}
                              </p>
                                <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotClasses(conversation.healthLevel)}`} aria-hidden="true" />
                            </div>
                              <p className="mt-1.5 truncate text-sm text-stone-600">{conversation.lastMessagePreview}</p>
                              <p className="mt-1.5 text-xs text-stone-400">{conversation.assignedUserName || 'Unassigned'}</p>
                          </div>
                            <p className="min-w-[92px] shrink-0 text-right text-xs text-stone-400">{formatDateTime(conversation.lastUpdatedAt)}</p>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Timeline */}
          <section className="overflow-hidden rounded-2xl bg-white/95 ring-1 ring-stone-200 shadow-[0_10px_24px_rgba(15,23,42,0.05)] lg:col-span-2">
            <div className="border-b border-stone-100 px-4 py-4">
              <h2 className="text-sm font-semibold text-stone-900">Conversation Timeline</h2>
              {selectedConversation ? (
                <p className="mt-0.5 text-xs text-stone-400">
                  {selectedConversation.patientName || selectedConversation.phone} · {selectedConversation.phone}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-stone-400">Select a conversation to review timeline and take action.</p>
              )}
            </div>

            {!selectedConversation ? (
              <div className="px-4 py-10 text-center text-sm text-stone-400">No conversation selected. Pick one from the list.</div>
            ) : (
              <div className="space-y-4 px-4 py-4">
                {/* Control panel */}
                <div className="rounded-2xl bg-stone-50/85 p-4 ring-1 ring-stone-200 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${conversationStateBadgeClasses(selectedConversation.conversationState)}`}>
                      {conversationStateLabel(selectedConversation.conversationState)}
                    </span>
                    {selectedConversation.conversationState !== 'human_active' ? (
                      <form action={setConversationStateAction}>
                        <input type="hidden" name="phone" value={selectedConversation.phone} />
                        <input type="hidden" name="state" value="human_active" />
                        <button type="submit" className="rounded-full bg-amber-50 px-3.5 py-1.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition-all duration-150 hover:-translate-y-px hover:bg-amber-100">
                          Take manual control
                        </button>
                      </form>
                    ) : null}
                    {!selectedConversation.assignedUserId ? (
                      <form action={assignToMeAction}>
                        <input type="hidden" name="phone" value={selectedConversation.phone} />
                        <button type="submit" className="rounded-full bg-stone-100 px-3.5 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-black/[0.04] transition-all duration-150 hover:-translate-y-px hover:bg-stone-200">
                          Assign to me
                        </button>
                      </form>
                    ) : null}
                    {selectedConversation.conversationState !== 'closed' ? (
                      <form action={setConversationStateAction}>
                        <input type="hidden" name="phone" value={selectedConversation.phone} />
                        <input type="hidden" name="state" value="closed" />
                        <button type="submit" className="rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-black/[0.04] transition-all duration-150 hover:-translate-y-px hover:bg-stone-50">
                          Close
                        </button>
                      </form>
                    ) : (
                      <form action={setConversationStateAction}>
                        <input type="hidden" name="phone" value={selectedConversation.phone} />
                        <input type="hidden" name="state" value="ai_active" />
                        <button type="submit" className="rounded-full bg-sky-50 px-3.5 py-1.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200 transition-all duration-150 hover:-translate-y-px hover:bg-sky-100">
                          Return to assistant
                        </button>
                      </form>
                    )}
                  </div>

                  {selectedConversation.assignedUserName && (
                    <p className="mt-2 text-xs text-stone-500">
                      Assigned to {selectedConversation.assignedUserName}
                    </p>
                  )}

                  {selectedConversation.conversationState === 'human_active' ? (
                    selectedConversation.assignedUserId && selectedConversation.assignedUserId !== session.user.id ? (
                      <p className="mt-3 text-xs text-stone-500">Reply disabled — conversation is assigned to another staff member.</p>
                    ) : (
                      <form action={sendManualReplyAction} className="mt-3 space-y-2">
                        <input type="hidden" name="phone" value={selectedConversation.phone} />
                        <textarea
                          name="body"
                          required
                          rows={3}
                          maxLength={1000}
                          className="w-full rounded-2xl border-0 bg-white px-3 py-2.5 text-sm text-stone-900 ring-1 ring-stone-200 placeholder:text-stone-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] focus:outline-none focus:ring-2 focus:ring-violet-300"
                          placeholder="Type your reply to the patient..."
                        />
                        <button type="submit" className="rounded-full bg-violet-600 px-4 py-1.5 text-xs font-medium text-white shadow-[0_12px_28px_rgba(109,40,217,0.28)] transition-all duration-150 hover:-translate-y-px hover:bg-violet-700 active:translate-y-0">
                          Send reply
                        </button>
                      </form>
                    )
                  ) : null}
                </div>

                {selectedConversation.timeline.length === 0 ? (
                  <p className="py-6 text-center text-sm text-stone-400">No events yet. Messages will appear here.</p>
                ) : (
                  selectedConversation.timeline.map((event) => (
                    <article key={event.id} className={kindStyles(isStaffActionEvent(event) ? 'ai' : event.kind)}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${eventRoleLabelClasses(event)}`}>{eventRoleLabel(event)}</p>
                          <p className={`mt-1 ${event.kind === 'system' && !isStaffActionEvent(event) ? 'text-xs font-medium text-stone-700' : 'text-sm font-medium text-stone-900'}`}>{event.title}</p>
                        </div>
                        <p className="ml-auto text-right text-[11px] text-stone-400">{formatDateTime(event.at)}</p>
                      </div>

                      <p className={`mt-2.5 whitespace-pre-wrap ${event.kind === 'system' && !isStaffActionEvent(event) ? 'text-xs leading-5 text-stone-600' : 'text-sm leading-6 text-stone-700'}`}>{event.text}</p>

                      {eventLabels(event, selectedConversation).length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {eventLabels(event, selectedConversation).map((label) => (
                            <span key={`${event.id}-${label}`} className="inline-flex rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-stone-700 ring-1 ring-stone-200">
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <details className="mt-2.5">
                        <summary className="cursor-pointer text-xs text-stone-400 hover:text-stone-600">Show details</summary>
                        <pre className="mt-2 overflow-x-auto rounded-xl bg-white/80 p-2.5 text-[11px] leading-relaxed text-stone-700 ring-1 ring-stone-200/80">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      </details>
                    </article>
                  ))
                )}
              </div>
            )}
          </section>

          {/* Patient context */}
          <section className="lg:col-span-1">
            <ConversationContextSidebar
              clinicId={clinicId}
              patient={sidebarPatient}
              appointment={sidebarAppointment}
              canManageAppointmentActions={canOperateInboxActions}
            />
          </section>
        </div>
      </main>
    </div>
  )
}
