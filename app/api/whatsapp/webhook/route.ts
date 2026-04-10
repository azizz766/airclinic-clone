import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyTwilioSignature } from '@/lib/whatsapp/verify-twilio-signature'
import { Prisma } from '@/lib/prisma-client/client'
import {
  findLatestActiveAppointmentByPhone as resolveLatestActiveAppointmentByPhone,
  findSafeRecentNotificationJobFallback as resolveSafeRecentNotificationJobFallback,
  findSingleClinicContextFromPhone as resolveSingleClinicContextFromPhone,
} from '@/lib/whatsapp/context-resolution'
import { ensureConversation, persistInboundMessage } from '@/lib/whatsapp/persist-message'
import { resolveSession, persistMessage, transitionSession, getMessageHistory } from '@/lib/whatsapp/session'
import { runAiInterpretationPipeline } from '@/lib/whatsapp/ai-interpretation-pipeline'
import { sendWhatsAppWithOutcomeLogging } from '@/lib/whatsapp/delivery-outcome'
import { routeMessageWithContext } from '@/lib/whatsapp/context-router'
import { resolvePatientContext } from '@/lib/whatsapp/patient-context'
import { parseNumericInput } from '@/lib/whatsapp/numeric-parser'
import {
  buildDoctorAvailableSlots,
  isDateWithinDoctorAvailability,
} from '@/lib/doctor-availability'



const ACTIVE_FLOW_STATES = [
  'SLOT_COLLECTION_SERVICE',
  'SLOT_COLLECTION_DATE',
  'SLOT_COLLECTION_TIME',
  'SLOT_COLLECTION_PATIENT_NAME',
  'SLOT_COLLECTION_PATIENT_DOB',
  'SLOT_COLLECTION_PHONE_CONFIRM',
  'CONFIRMATION_PENDING',
  'CANCELLATION_PENDING',
]

function twilioXmlResponse() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
    },
  })
}

function twilioXmlMessageResponse(message: string) {
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
    },
  })
}

function parseReminderRef(body: string) {
  const match = body.match(/R-([a-zA-Z0-9]+)/i)
  return match?.[1] ?? null
}

function normalizePhone(value: string) {
  const trimmed = value.trim().toLowerCase().replace('whatsapp:', '')
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  return hasPlus ? `+${digits}` : digits
}

function normalizeReplyValue(rawBody: string) {
  const normalizedDigits = rawBody.replace(/[١۱]/g, '1').replace(/[٢۲]/g, '2')
  const compact = normalizedDigits.replace(/\s+/g, ' ').trim()

  if (/(^|\s)1(\s|$)/.test(compact)) {
    return 1
  }

  if (/(^|\s)2(\s|$)/.test(compact)) {
    return 2
  }

  const directNumberMatch = compact.match(/^([1-9])$/)
  if (directNumberMatch) {
    return Number(directNumberMatch[1])
  }

  return null
}

type RescheduleOption = {
  index: number
  scheduledAtIso: string
  label: string
}

type RescheduleContext = {
  logId: string
  clinicId: string
  appointmentId: string
  notificationJobId: string | null
  phoneNormalized: string
  providerMessageId: string | null
  options: RescheduleOption[]
  status: 'pending' | 'completed'
  expiresAtIso: string
}

type ConversationFlowType = 'booking_flow' | 'reschedule_flow' | 'availability_flow' | 'service_selection_flow'

type ConversationSessionOption = {
  index: number
  scheduledAtIso: string
  label: string
  doctorName: string
  doctorId: string
  serviceId: string
}

type ConversationSession = {
  logId: string
  flow: ConversationFlowType
  clinicId: string
  appointmentId: string | null
  notificationJobId: string | null
  phoneNormalized: string
  providerMessageId: string | null
  options: ConversationSessionOption[]
  pendingServiceId: string | null
  expiresAtIso: string
  status: 'active' | 'completed'
}

function formatOptionLabel(date: Date) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ── Conversation Session helpers ──────────────────────────────────────────────

function parseConversationSessionOption(item: unknown): ConversationSessionOption | null {
  if (!item || typeof item !== 'object') return null
  const v = item as Record<string, unknown>
  if (
    typeof v.index !== 'number' ||
    typeof v.scheduledAtIso !== 'string' ||
    typeof v.label !== 'string' ||
    typeof v.doctorName !== 'string' ||
    typeof v.doctorId !== 'string' ||
    typeof v.serviceId !== 'string'
  ) return null
  return {
    index: v.index,
    scheduledAtIso: v.scheduledAtIso,
    label: v.label,
    doctorName: v.doctorName,
    doctorId: v.doctorId,
    serviceId: v.serviceId,
  }
}

function parseConversationSession(log: {
  id: string
  clinicId: string
  entityId: string
  metadata: unknown
}): ConversationSession | null {
  if (!log.metadata || typeof log.metadata !== 'object') return null
  const m = log.metadata as Record<string, unknown>
  const validFlows: ConversationFlowType[] = ['booking_flow', 'reschedule_flow', 'availability_flow', 'service_selection_flow']
  const flow = validFlows.includes(m.flow as ConversationFlowType) ? (m.flow as ConversationFlowType) : null
  const phoneNormalized = typeof m.phoneNormalized === 'string' ? m.phoneNormalized : null
  const expiresAtIso = typeof m.expiresAtIso === 'string' ? m.expiresAtIso : null
  const status = m.status === 'active' ? 'active' : m.status === 'completed' ? 'completed' : null
  const providerMessageId = typeof m.providerMessageId === 'string' ? m.providerMessageId : null
  const appointmentId = typeof m.appointmentId === 'string' ? m.appointmentId : null
  const notificationJobId = typeof m.notificationJobId === 'string' ? m.notificationJobId : null
  const pendingServiceId = typeof m.pendingServiceId === 'string' ? m.pendingServiceId : null
  const options = Array.isArray(m.options)
    ? m.options.map(parseConversationSessionOption).filter((o): o is ConversationSessionOption => o !== null)
    : []
  if (!flow || !phoneNormalized || !expiresAtIso || !status) return null
  return {
    logId: log.id,
    flow,
    clinicId: log.clinicId,
    appointmentId,
    notificationJobId,
    phoneNormalized,
    providerMessageId,
    options,
    pendingServiceId,
    expiresAtIso,
    status,
  }
}

async function readActiveConversationSession(params: { fromRaw: string; repliedSid: string }) {
  const phoneNormalized = normalizePhone(params.fromRaw)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const logs = await prisma.escalationLog.findMany({
    where: {
      eventType: 'whatsapp_session',
      createdAt: { gte: since },
    },
    select: { id: true, clinicId: true, entityId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const now = new Date()
  const sessions = logs
    .map(parseConversationSession)
    .filter((s): s is ConversationSession => s !== null && s.status === 'active' && new Date(s.expiresAtIso) > now)

  if (params.repliedSid) {
    const sidMatch = sessions.find((s) => s.providerMessageId === params.repliedSid)
    if (sidMatch) return { session: sidMatch, source: 'session_sid_match' as const }
  }

  const phoneMatches = sessions.filter((s) => s.phoneNormalized === phoneNormalized)
  if (phoneMatches.length === 1) {
    return { session: phoneMatches[0], source: 'session_phone_match' as const }
  }

  return { session: null, source: 'none' as const }
}

async function saveConversationSession(params: {
  flow: ConversationFlowType
  clinicId: string
  appointmentId: string | null
  notificationJobId: string | null
  phoneNormalized: string
  providerMessageId: string | null | undefined
  options: ConversationSessionOption[]
  pendingServiceId?: string | null
}) {
  const expiresAtIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  await prisma.escalationLog.create({
    data: {
      clinicId: params.clinicId,
      entityType: 'system',
      entityId: params.phoneNormalized,
      eventType: 'whatsapp_session',
      severity: 'info',
      message: `WhatsApp conversation session: ${params.flow}`,
      metadata: {
        flow: params.flow,
        clinicId: params.clinicId,
        appointmentId: params.appointmentId,
        notificationJobId: params.notificationJobId,
        phoneNormalized: params.phoneNormalized,
        providerMessageId: params.providerMessageId ?? null,
        options: params.options,
        pendingServiceId: params.pendingServiceId ?? null,
        expiresAtIso,
        status: 'active',
      },
    },
  })
}

async function expireConversationSession(logId: string) {
  const log = await prisma.escalationLog.findUnique({
    where: { id: logId },
    select: { metadata: true },
  })
  if (!log?.metadata || typeof log.metadata !== 'object') return
  await prisma.escalationLog.update({
    where: { id: logId },
    data: {
      metadata: {
        ...(log.metadata as Record<string, unknown>),
        status: 'completed',
        completedAtIso: new Date().toISOString(),
      },
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────

type AiIntent =
  | 'confirm'
  | 'cancel'
  | 'reschedule'
  | 'new_booking'
  | 'availability_check'
  | 'inquiry_price'
  | 'inquiry_doctor'
  | 'unknown'
type PreferredPeriod = 'morning' | 'afternoon' | 'evening' | 'after_isha'

type AiInterpretation = {
  intent: AiIntent
  confidence: 'low' | 'medium' | 'high'
  preferredDateOffsetDays: number | null
  preferredWeekOffsetDays: number
  preferredDayOfWeek: number | null
  preferredPeriod: PreferredPeriod | null
  doctorHint: string | null
  canonicalText: string
}

type LlmIntentResponse = {
  intent: AiIntent
  preferredPeriod: PreferredPeriod | null
  preferredDateOffsetDays: number | null
  notes: string
}

function normalizeForNlu(text: string) {
  return text
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/[؟!,.،;:()\[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function applySynonymNormalization(text: string) {
  const replacements: Array<[RegExp, string]> = [
    [/(^|\s)(بكره|بكرا|بكرة|باكر|غدا|tomorrow)(\s|[\u061f\u060c!?,.]|$)/g, ' $1tomorrow$3 '],
    [/(^|\s)(بعد\s*بكره|بعد\s*بكرة|day\s+after\s+tomorrow)(\s|[\u061f\u060c!?,.]|$)/g, ' $1day_after_tomorrow$3 '],
    [/(^|\s)(بعد\s*(صلاه\s*)?العشا|بعد\s*صلاة\s*العشاء|after\s*isha|isha)(\s|[\u061f\u060c!?,.]|$)/g, ' $1after_isha$3 '],
    [/(^|\s)(بالليل|ليل|مساء|evening|night)(\s|[\u061f\u060c!?,.]|$)/g, ' $1evening$3 '],
    [/(^|\s)(العصر|بعد\s*الظهر|afternoon|noon)(\s|[\u061f\u060c!?,.]|$)/g, ' $1afternoon$3 '],
    [/(^|\s)(الصباح|صباح|morning)(\s|[\u061f\u060c!?,.]|$)/g, ' $1morning$3 '],
    [/(^|\s)(ابي\s*اغير\s*الموعد|ابي\s*ابدله|ابي\s*موعد\s*ثاني|ابغى\s*اغير\s*الموعد|غير\s*الموعد|تغيير\s*الموعد|reschedule|change\s+appointment)(\s|[\u061f\u060c!?,.]|$)/g, ' $1reschedule$3 '],
    [/(^|\s)(كم\s*سعر|السعر|بكم|price|cost)(\s|[\u061f\u060c!?,.]|$)/g, ' $1price_inquiry$3 '],
    [/(^|\s)(دكتور|دكتوره|doctor|dr\.?)(\s|[\u061f\u060c!?,.]|$)/g, ' $1doctor$3 '],
    [/(^|\s)(متاح|عندكم|فيه|available|availability)(\s|[\u061f\u060c!?,.]|$)/g, ' $1availability$3 '],
    [/(^|\s)(احجز|حجز|ابغى\s*موعد|ابي\s*موعد|موعد\s*جديد|book|booking)(\s|[\u061f\u060c!?,.]|$)/g, ' $1booking$3 '],
    [/(^|\s)(اكد|تاكيد|confirm|confirmed|ok|اوكي)(\s|[\u061f\u060c!?,.]|$)/g, ' $1confirm$3 '],
    [/(^|\s)(الاسبوع\s*الجاي|next\s*week)(\s|[\u061f\u060c!?,.]|$)/g, ' $1next_week$3 '],
    [/(^|\s)(الخميس\s*الجاي|thursday\s*next)(\s|[\u061f\u060c!?,.]|$)/g, ' $1weekday_thursday next_week$3 '],
    [/(^|\s)(السبت|saturday)(\s|[\u061f\u060c!?,.]|$)/g, ' $1weekday_saturday$3 '],
    [/(^|\s)(الاحد|الأحد|sunday)(\s|[\u061f\u060c!?,.]|$)/g, ' $1weekday_sunday$3 '],
    [/(^|\s)(الاثنين|الإثنين|monday)(\s|[\u061f\u060c!?,.]|$)/g, ' $1weekday_monday$3 '],
    [/(^|\s)(الثلاثاء|tuesday)(\s|[\u061f\u060c!?,.]|$)/g, ' $1weekday_tuesday$3 '],
    [/(^|\s)(الاربعاء|الأربعاء|wednesday)(\s|[\u061f\u060c!?,.]|$)/g, ' $1weekday_wednesday$3 '],
    [/(^|\s)(الخميس|thursday)(\s|[\u061f\u060c!?,.]|$)/g, ' $1weekday_thursday$3 '],
    [/(^|\s)(الجمعه|الجمعة|friday)(\s|[\u061f\u060c!?,.]|$)/g, ' $1weekday_friday$3 '],
  ]

  return replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text)
}

function tokenExists(text: string, token: string) {
  return new RegExp(`(^|\\s)${token}(\\s|$)`).test(text)
}

function countPatternMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((score, pattern) => (pattern.test(text) ? score + 1 : score), 0)
}

function extractPreferredDateOffsetDays(canonicalText: string) {
  if (tokenExists(canonicalText, 'day_after_tomorrow')) {
    return 2
  }

  if (tokenExists(canonicalText, 'tomorrow')) {
    return 1
  }

  if (/(^|\s)(today|اليوم|now)(\s|$)/.test(canonicalText)) {
    return 0
  }

  return null
}

function extractPreferredPeriod(canonicalText: string): PreferredPeriod | null {
  if (tokenExists(canonicalText, 'after_isha')) {
    return 'after_isha'
  }

  if (tokenExists(canonicalText, 'evening')) {
    return 'evening'
  }

  if (tokenExists(canonicalText, 'afternoon')) {
    return 'afternoon'
  }

  if (tokenExists(canonicalText, 'morning')) {
    return 'morning'
  }

  return null
}

function extractPreferredDayOfWeek(canonicalText: string): number | null {
  if (tokenExists(canonicalText, 'weekday_sunday')) return 0
  if (tokenExists(canonicalText, 'weekday_monday')) return 1
  if (tokenExists(canonicalText, 'weekday_tuesday')) return 2
  if (tokenExists(canonicalText, 'weekday_wednesday')) return 3
  if (tokenExists(canonicalText, 'weekday_thursday')) return 4
  if (tokenExists(canonicalText, 'weekday_friday')) return 5
  if (tokenExists(canonicalText, 'weekday_saturday')) return 6
  return null
}

function extractPreferredWeekOffsetDays(canonicalText: string) {
  if (tokenExists(canonicalText, 'next_week')) {
    return 7
  }

  return 0
}

function extractDoctorHint(text: string) {
  const doctorMatch = text.match(/(?:دكتور|دكتوره|doctor|dr\.?)[\s:]+([\p{L}]+(?:\s+[\p{L}]+)?)/iu)
  if (!doctorMatch) {
    return null
  }

  const value = doctorMatch[1]?.trim()
  return value || null
}

function interpretIncomingMessage(bodyRaw: string): AiInterpretation {
  const normalized = normalizeForNlu(bodyRaw)
  const canonicalText = applySynonymNormalization(` ${normalized} `).replace(/\s+/g, ' ').trim()

  const dateOffset = extractPreferredDateOffsetDays(canonicalText)
  const weekOffsetDays = extractPreferredWeekOffsetDays(canonicalText)
  const dayOfWeek = extractPreferredDayOfWeek(canonicalText)
  const period = extractPreferredPeriod(canonicalText)
  const doctorHint = extractDoctorHint(normalized)

  const intentScores: Record<AiIntent, number> = {
    confirm: countPatternMatches(canonicalText, [/\bconfirm\b/, /\bتاكيد\b/, /\bاكد\b/]),
    cancel: 0,
    reschedule: countPatternMatches(canonicalText, [/\breschedule\b/, /\bتغيير\b/, /\bغير\b/, /\bموعد ثاني\b/]),
    new_booking: countPatternMatches(canonicalText, [/\bbooking\b/, /\bحجز\b/, /\bموعد جديد\b/]),
    availability_check: countPatternMatches(canonicalText, [/\bavailability\b/, /\bمتاح\b/, /\bعندكم\b/, /\btomorrow\b/, /\bday_after_tomorrow\b/]),
    inquiry_price: countPatternMatches(canonicalText, [/\bprice_inquiry\b/, /\bسعر\b/, /\bبكم\b/]),
    inquiry_doctor: countPatternMatches(canonicalText, [/\bdoctor\b/, /\bمين الدكتور\b/]),
    unknown: 0,
  }

  if (dateOffset !== null || dayOfWeek !== null || period !== null) {
    intentScores.availability_check += 2
  }

  if (doctorHint) {
    intentScores.inquiry_doctor += 1
    intentScores.new_booking += 1
  }

  if (tokenExists(canonicalText, 'reschedule')) {
    intentScores.reschedule += 3
  }

  const ranked = Object.entries(intentScores)
    .sort((a, b) => b[1] - a[1])
    .map(([intent, score]) => ({ intent: intent as AiIntent, score }))

  const top = ranked[0]
  const second = ranked[1]
  const isUnknown = !top || top.score <= 0 || (second && top.score - second.score <= 0)

  if (isUnknown) {
    return {
      intent: 'unknown',
      confidence: 'low',
      preferredDateOffsetDays: dateOffset,
      preferredWeekOffsetDays: weekOffsetDays,
      preferredDayOfWeek: dayOfWeek,
      preferredPeriod: period,
      doctorHint,
      canonicalText,
    }
  }

  return {
    intent: top.intent,
    confidence: top.score >= 3 ? 'high' : 'medium',
    preferredDateOffsetDays: dateOffset,
    preferredWeekOffsetDays: weekOffsetDays,
    preferredDayOfWeek: dayOfWeek,
    preferredPeriod: period,
    doctorHint,
    canonicalText,
  }
}

function extractJsonObject(raw: string) {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return raw.slice(start, end + 1)
}

function parseLlmIntentResponse(raw: string): LlmIntentResponse | null {
  const jsonCandidate = extractJsonObject(raw)
  if (!jsonCandidate) return null

  try {
    const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>
    const validIntent: AiIntent[] = [
      'new_booking',
      'availability_check',
      'reschedule',
      'confirm',
      'inquiry_price',
      'inquiry_doctor',
      'unknown',
    ]
    const validPeriods: Array<PreferredPeriod | null> = ['morning', 'afternoon', 'evening', 'after_isha', null]

    const intent = validIntent.includes(parsed.intent as AiIntent) ? (parsed.intent as AiIntent) : null
    const preferredPeriod = validPeriods.includes((parsed.preferredPeriod as PreferredPeriod | null) ?? null)
      ? ((parsed.preferredPeriod as PreferredPeriod | null) ?? null)
      : null
    const preferredDateOffsetDays = typeof parsed.preferredDateOffsetDays === 'number'
      ? Math.max(0, Math.floor(parsed.preferredDateOffsetDays))
      : null
    const notes = typeof parsed.notes === 'string' ? parsed.notes : ''

    if (!intent) return null

    return {
      intent,
      preferredPeriod,
      preferredDateOffsetDays,
      notes,
    }
  } catch {
    return null
  }
}

async function interpretWithLlmFallback(params: { rawMessage: string; normalizedText: string }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const model = process.env.WHATSAPP_INTENT_MODEL || 'claude-haiku-4-5'

  console.log('[LLM MODEL]', {
    model,
    modelSource: process.env.WHATSAPP_INTENT_MODEL ? 'env' : 'default',
  })

  const systemPrompt = [
    'You classify WhatsApp clinic scheduling messages.',
    'Return JSON only (no markdown, no explanation).',
    'Use schema exactly:',
    '{"intent":"new_booking | availability_check | reschedule | confirm | inquiry_price | inquiry_doctor | unknown","preferredPeriod":"morning | afternoon | evening | after_isha | null","preferredDateOffsetDays":number | null,"notes":"short explanation"}',
    'Keep preferredDateOffsetDays null unless clearly implied.',
  ].join(' ')

  const userPrompt = [
    `raw_message: ${params.rawMessage}`,
    `normalized_text: ${params.normalizedText}`,
  ].join('\n')

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        temperature: 0,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.error('[LLM ERROR]', {
        stage: 'anthropic_response_not_ok',
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        model,
      })
      return null
    }

    const data = await response.json() as {
      content?: Array<{ type?: string; text?: string }>
    }

    const content = data.content
      ?.filter((item) => item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text as string)
      .join('\n')

    if (!content) {
      console.error('[LLM ERROR]', {
        stage: 'anthropic_empty_content',
        model,
        responsePayload: data,
      })
      return null
    }

    const parsed = parseLlmIntentResponse(content)
    if (!parsed) {
      console.error('[LLM ERROR]', {
        stage: 'llm_json_parse_failed',
        model,
        rawContent: content,
      })
    }

    return parsed
  } catch (error) {
    console.error('[LLM ERROR]', {
      stage: 'anthropic_request_exception',
      model,
      error,
    })
    return null
  }
}

function mergeInterpretationWithLlm(base: AiInterpretation, llm: LlmIntentResponse): AiInterpretation {
  const mergedIntent = llm.intent !== 'unknown' ? llm.intent : base.intent

  return {
    ...base,
    intent: mergedIntent,
    confidence: mergedIntent !== base.intent ? 'medium' : base.confidence,
    preferredPeriod: base.preferredPeriod ?? llm.preferredPeriod,
    preferredDateOffsetDays: base.preferredDateOffsetDays ?? llm.preferredDateOffsetDays,
  }
}

function matchesPreferredPeriod(date: Date, period: PreferredPeriod | null) {
  if (!period) return true

  const hour = date.getHours()

  if (period === 'morning') return hour >= 7 && hour < 12
  if (period === 'afternoon') return hour >= 12 && hour < 16
  if (period === 'evening') return hour >= 16 && hour < 22
  if (period === 'after_isha') return hour >= 19 && hour < 23

  return true
}

async function findSingleClinicContextFromPhone(fromRaw: string) {
  const phone = normalizePhone(fromRaw)
  const last8 = phone.replace(/\D/g, '').slice(-8)

  if (!last8) {
    return {
      clinicId: null as string | null,
      reason: 'no_phone_match',
      candidateClinicCount: 0,
    }
  }

  const patients = await prisma.patient.findMany({
    where: {
      phone: {
        endsWith: last8,
      },
      isActive: true,
    },
    select: {
      clinicId: true,
    },
    take: 20,
  })

  const clinicIds = Array.from(new Set(patients.map((item) => item.clinicId)))

  if (clinicIds.length === 1) {
    return {
      clinicId: clinicIds[0],
      reason: 'single_patient_clinic',
      candidateClinicCount: clinicIds.length,
    }
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentJobs = await prisma.notificationJob.findMany({
    where: {
      channel: 'whatsapp',
      sentAt: {
        gte: since,
      },
      destination: {
        endsWith: last8,
      },
    },
    select: {
      clinicId: true,
    },
    take: 20,
  })

  const jobClinicIds = Array.from(new Set(recentJobs.map((item) => item.clinicId)))
  if (jobClinicIds.length === 1) {
    return {
      clinicId: jobClinicIds[0],
      reason: 'single_recent_job_clinic',
      candidateClinicCount: jobClinicIds.length,
    }
  }

  return {
    clinicId: null as string | null,
    reason: clinicIds.length > 1 || jobClinicIds.length > 1 ? 'ambiguous_clinic' : 'no_clinic_match',
    candidateClinicCount: Math.max(clinicIds.length, jobClinicIds.length),
  }
}

type BookingOption = {
  index: number
  scheduledAtIso: string
  label: string
  doctorName: string
  doctorId: string
  serviceId: string
}

async function buildNewBookingOptions(params: {
  clinicId: string
  serviceId?: string | null
  preferredDateOffsetDays: number | null
  preferredWeekOffsetDays: number
  preferredDayOfWeek: number | null
  preferredPeriod: PreferredPeriod | null
  doctorHint: string | null
}) {
  const service = params.serviceId
    ? await prisma.service.findFirst({
        where: { id: params.serviceId, clinicId: params.clinicId, isActive: true },
        select: { durationMinutes: true, id: true, name: true },
      })
    : await prisma.service.findFirst({
        where: { clinicId: params.clinicId, isActive: true },
        select: { durationMinutes: true, id: true, name: true },
        orderBy: { createdAt: 'asc' },
      })

  if (!service) {
    return {
      options: [] as BookingOption[],
      serviceName: null as string | null,
    }
  }

  const allDoctors = await prisma.doctor.findMany({
    where: {
      clinicId: params.clinicId,
      isActive: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      availabilitySchedule: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  const doctorHint = params.doctorHint ? normalizeForNlu(params.doctorHint) : null
  const doctors = doctorHint
    ? allDoctors.filter((doctor) => {
        const full = normalizeForNlu(`${doctor.firstName} ${doctor.lastName}`)
        return full.includes(doctorHint)
      })
    : allDoctors

  const options: BookingOption[] = []
  const now = new Date()
  const startOffset = Math.max(0, (params.preferredDateOffsetDays ?? 0) + params.preferredWeekOffsetDays)

  for (let dayOffset = startOffset; dayOffset < startOffset + 10 && options.length < 3; dayOffset += 1) {
    const day = new Date(now)
    day.setDate(now.getDate() + dayOffset)
    const dateKey = day.toISOString().slice(0, 10)

    const dayStart = new Date(`${dateKey}T00:00:00`)
    const dayEnd = new Date(`${dateKey}T23:59:59.999`)

    for (const doctor of doctors) {
      if (options.length >= 3) {
        break
      }

      const existingAppointments = await prisma.appointment.findMany({
        where: {
          clinicId: params.clinicId,
          doctorId: doctor.id,
          status: {
            not: 'cancelled',
          },
          scheduledAt: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
        select: {
          scheduledAt: true,
          durationMinutes: true,
        },
        orderBy: {
          scheduledAt: 'asc',
        },
      })

      const slots = buildDoctorAvailableSlots({
        date: dateKey,
        durationMinutes: service.durationMinutes,
        scheduleInput: doctor.availabilitySchedule,
        existingAppointments,
        intervalMinutes: 15,
      })

      for (const slot of slots) {
        if (options.length >= 3) {
          break
        }

        const candidate = new Date(`${dateKey}T${slot}:00`)

        if (candidate <= now) {
          continue
        }

        if (params.preferredDayOfWeek !== null && candidate.getDay() !== params.preferredDayOfWeek) {
          continue
        }

        if (!matchesPreferredPeriod(candidate, params.preferredPeriod)) {
          continue
        }

        options.push({
          index: options.length + 1,
          scheduledAtIso: candidate.toISOString(),
          label: formatOptionLabel(candidate),
          doctorName: `${doctor.firstName} ${doctor.lastName}`,
          doctorId: doctor.id,
          serviceId: service.id,
        })
      }
    }
  }

  return {
    options,
    serviceName: service.name,
  }
}

function extractRescheduleContext(log: {
  id: string
  clinicId: string
  entityId: string
  metadata: unknown
}) {
  if (!log.metadata || typeof log.metadata !== 'object') {
    return null
  }

  const metadata = log.metadata as Record<string, unknown>
  const phoneNormalized = typeof metadata.phoneNormalized === 'string' ? metadata.phoneNormalized : null
  const notificationJobId = typeof metadata.notificationJobId === 'string' ? metadata.notificationJobId : null
  const status = metadata.status === 'completed' ? 'completed' : metadata.status === 'pending' ? 'pending' : null
  const expiresAtIso = typeof metadata.expiresAtIso === 'string' ? metadata.expiresAtIso : null
  const providerMessageId = typeof metadata.providerMessageId === 'string' ? metadata.providerMessageId : null

  const rawOptions = Array.isArray(metadata.options) ? metadata.options : []
  const options = rawOptions
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const value = item as Record<string, unknown>
      const index = typeof value.index === 'number' ? value.index : null
      const scheduledAtIso = typeof value.scheduledAtIso === 'string' ? value.scheduledAtIso : null
      const label = typeof value.label === 'string' ? value.label : null

      if (!index || !scheduledAtIso || !label) {
        return null
      }

      return { index, scheduledAtIso, label }
    })
    .filter((item): item is RescheduleOption => item !== null)

  if (!phoneNormalized || !status || !expiresAtIso) {
    return null
  }

  return {
    logId: log.id,
    clinicId: log.clinicId,
    appointmentId: log.entityId,
    notificationJobId,
    phoneNormalized,
    providerMessageId,
    options,
    status,
    expiresAtIso,
  } as RescheduleContext
}

async function findActiveRescheduleContext(params: { fromRaw: string; originalRepliedSid: string }) {
  const phoneNormalized = normalizePhone(params.fromRaw)
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const logs = await prisma.escalationLog.findMany({
    where: {
      eventType: 'whatsapp_reschedule_options_sent',
      createdAt: {
        gte: since,
      },
    },
    select: {
      id: true,
      clinicId: true,
      entityId: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  })

  const contexts = logs.map(extractRescheduleContext).filter((item): item is RescheduleContext => item !== null)
  const now = new Date()

  if (params.originalRepliedSid) {
    const sidMatch = contexts.find((ctx) => {
      if (!ctx.providerMessageId) return false
      if (ctx.status !== 'pending') return false
      return ctx.providerMessageId === params.originalRepliedSid && new Date(ctx.expiresAtIso) > now
    })

    if (sidMatch) {
      return {
        context: sidMatch,
        source: 'reschedule_reply_sid' as const,
        reason: 'sid_match',
        candidateCount: 1,
      }
    }
  }

  const phoneMatches = contexts.filter((ctx) => {
    if (ctx.status !== 'pending') return false
    if (new Date(ctx.expiresAtIso) <= now) return false
    return ctx.phoneNormalized === phoneNormalized
  })

  if (phoneMatches.length === 1) {
    return {
      context: phoneMatches[0],
      source: 'reschedule_recent_phone' as const,
      reason: 'single_recent_context',
      candidateCount: 1,
    }
  }

  return {
    context: null,
    source: 'none' as const,
    reason: phoneMatches.length === 0 ? 'no_recent_context' : 'ambiguous_recent_context',
    candidateCount: phoneMatches.length,
  }
}

async function updateRescheduleContextStatus(logId: string, nextStatus: 'pending' | 'completed', selectedOption: number | null) {
  const log = await prisma.escalationLog.findUnique({
    where: { id: logId },
    select: { metadata: true },
  })

  if (!log || !log.metadata || typeof log.metadata !== 'object') {
    return
  }

  const metadata = log.metadata as Record<string, unknown>
  metadata.status = nextStatus
  metadata.selectedOption = selectedOption
  metadata.completedAtIso = new Date().toISOString()

  await prisma.escalationLog.update({
    where: { id: logId },
    data: {
      metadata: metadata as Prisma.InputJsonValue,
    },
  })
}

async function buildNextRescheduleOptions(appointment: {
  id: string
  clinicId: string
  doctorId: string
  durationMinutes: number
  scheduledAt: Date
  doctor: { availabilitySchedule: unknown }
}) {
  const options: RescheduleOption[] = []
  const now = new Date()

  for (let dayOffset = 0; dayOffset < 14 && options.length < 3; dayOffset += 1) {
    const day = new Date(now)
    day.setDate(now.getDate() + dayOffset)
    const dateKey = day.toISOString().slice(0, 10)

    const dayStart = new Date(`${dateKey}T00:00:00`)
    const dayEnd = new Date(`${dateKey}T23:59:59.999`)

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        clinicId: appointment.clinicId,
        doctorId: appointment.doctorId,
        NOT: {
          id: appointment.id,
        },
        status: {
          not: 'cancelled',
        },
        scheduledAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      select: {
        scheduledAt: true,
        durationMinutes: true,
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    })

    const slots = buildDoctorAvailableSlots({
      date: dateKey,
      durationMinutes: appointment.durationMinutes,
      scheduleInput: appointment.doctor.availabilitySchedule,
      existingAppointments,
      intervalMinutes: 15,
    })

    for (const slot of slots) {
      if (options.length >= 3) {
        break
      }

      const candidate = new Date(`${dateKey}T${slot}:00`)

      if (candidate <= now) {
        continue
      }

      if (candidate.getTime() === appointment.scheduledAt.getTime()) {
        continue
      }

      options.push({
        index: options.length + 1,
        scheduledAtIso: candidate.toISOString(),
        label: formatOptionLabel(candidate),
      })
    }
  }

  return options
}

async function findSafeRecentNotificationJobFallback(fromRaw: string) {
  const phone = normalizePhone(fromRaw)
  const last8 = phone.replace(/\D/g, '').slice(-8)

  if (!last8) {
    return {
      job: null as Awaited<ReturnType<typeof prisma.notificationJob.findFirst>>,
      reason: 'no_phone_match',
      candidateJobs: 0,
      candidateAppointments: 0,
    }
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const recentJobs = await prisma.notificationJob.findMany({
    where: {
      channel: 'whatsapp',
      status: 'sent',
      sentAt: {
        gte: since,
      },
      destination: {
        endsWith: last8,
      },
    },
    include: {
      appointment: true,
    },
    orderBy: {
      sentAt: 'desc',
    },
    take: 10,
  })

  const uniqueAppointmentIds = new Set(recentJobs.map((job) => job.appointmentId))

  if (recentJobs.length !== 1 || uniqueAppointmentIds.size !== 1) {
    return {
      job: null as Awaited<ReturnType<typeof prisma.notificationJob.findFirst>>,
      reason: recentJobs.length === 0 ? 'no_recent_jobs' : 'ambiguous_recent_jobs',
      candidateJobs: recentJobs.length,
      candidateAppointments: uniqueAppointmentIds.size,
    }
  }

  return {
    job: recentJobs[0],
    reason: 'safe_recent_job_match',
    candidateJobs: recentJobs.length,
    candidateAppointments: uniqueAppointmentIds.size,
  }
}

async function findLatestActiveAppointmentByPhone(fromRaw: string, clinicId?: string) {
  const phone = normalizePhone(fromRaw)
  const last8 = phone.replace(/\D/g, '').slice(-8)

  if (!last8) {
    return {
      appointment: null as Awaited<ReturnType<typeof prisma.appointment.findFirst>>,
      reason: 'no_phone_match',
      candidateCount: 0,
    }
  }

  const candidates = await prisma.appointment.findMany({
    where: {
      status: {
        in: ['scheduled', 'confirmation_pending', 'confirmed'],
      },
      ...(clinicId ? { clinicId } : {}),
      patient: {
        phone: {
          endsWith: last8,
        },
      },
    },
    include: {
      patient: true,
    },
    orderBy: {
      scheduledAt: 'desc',
    },
    take: 2,
  })

  if (candidates.length === 0) {
    return {
      appointment: null as Awaited<ReturnType<typeof prisma.appointment.findFirst>>,
      reason: 'no_active_appointments',
      candidateCount: 0,
    }
  }

  if (candidates.length > 1) {
    return {
      appointment: null as Awaited<ReturnType<typeof prisma.appointment.findFirst>>,
      reason: 'multiple_active_appointments',
      candidateCount: candidates.length,
    }
  }

  return {
    appointment: candidates[0],
    reason: 'single_latest_appointment',
    candidateCount: 1,
  }
}

type ConversationControlState = 'ai_active' | 'human_active' | 'closed'

async function readConversationControlState(fromRaw: string) {
  const phoneNormalized = normalizePhone(fromRaw)
  const clinicContext = await resolveSingleClinicContextFromPhone(fromRaw)

  if (!clinicContext.clinicId) {
    return {
      state: 'ai_active' as ConversationControlState,
      phoneNormalized,
      clinicId: null as string | null,
    }
  }

  const latestStateLog = await prisma.escalationLog.findFirst({
    where: {
      clinicId: clinicContext.clinicId,
      eventType: 'whatsapp_human_control_state',
      entityId: phoneNormalized,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      metadata: true,
    },
  })

  if (!latestStateLog?.metadata || typeof latestStateLog.metadata !== 'object') {
    return {
      state: 'ai_active' as ConversationControlState,
      phoneNormalized,
      clinicId: clinicContext.clinicId,
    }
  }

  const conversationState = (latestStateLog.metadata as Record<string, unknown>).conversationState
  const state = conversationState === 'human_active' || conversationState === 'closed' || conversationState === 'ai_active'
    ? conversationState
    : 'ai_active'

  return {
    state: state as ConversationControlState,
    phoneNormalized,
    clinicId: clinicContext.clinicId,
  }
}

async function resolveInboundClinicPatientContext(params: {
  fromRaw: string
  originalRepliedSid: string
  reminderRef: string | null
}) {
  const phoneNormalized = normalizePhone(params.fromRaw)
  const last8 = phoneNormalized.replace(/\D/g, '').slice(-8)

  if (last8) {
    const matchingPatients = await prisma.patient.findMany({
      where: {
        phone: {
          endsWith: last8,
        },
        isActive: true,
      },
      select: {
        id: true,
        clinicId: true,
      },
      take: 5,
    })

    if (matchingPatients.length === 1) {
      return {
        clinicId: matchingPatients[0].clinicId,
        patientId: matchingPatients[0].id,
        phoneNormalized,
        source: 'single_patient_phone_match' as const,
      }
    }
  }

  const clinicContext = await resolveSingleClinicContextFromPhone(params.fromRaw)
  if (clinicContext.clinicId && last8) {
    const clinicPatient = await prisma.patient.findFirst({
      where: {
        clinicId: clinicContext.clinicId,
        phone: {
          endsWith: last8,
        },
        isActive: true,
      },
      select: {
        id: true,
        clinicId: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    if (clinicPatient) {
      return {
        clinicId: clinicPatient.clinicId,
        patientId: clinicPatient.id,
        phoneNormalized,
        source: 'clinic_context_patient_match' as const,
      }
    }
  }

  if (params.originalRepliedSid) {
    const replyMappedJob = await prisma.notificationJob.findFirst({
      where: {
        channel: 'whatsapp',
        providerMessageId: params.originalRepliedSid,
      },
      select: {
        clinicId: true,
        patientId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (replyMappedJob) {
      return {
        clinicId: replyMappedJob.clinicId,
        patientId: replyMappedJob.patientId,
        phoneNormalized,
        source: 'reply_sid_notification_job' as const,
      }
    }
  }

  if (params.reminderRef) {
    const reminderMappedJob = await prisma.notificationJob.findFirst({
      where: {
        channel: 'whatsapp',
        reminderId: params.reminderRef,
      },
      select: {
        clinicId: true,
        patientId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (reminderMappedJob) {
      return {
        clinicId: reminderMappedJob.clinicId,
        patientId: reminderMappedJob.patientId,
        phoneNormalized,
        source: 'reminder_ref_notification_job' as const,
      }
    }
  }

  const safeFallback = await resolveSafeRecentNotificationJobFallback(params.fromRaw)
  if (safeFallback.job) {
    return {
      clinicId: safeFallback.job.clinicId,
      patientId: safeFallback.job.patientId,
      phoneNormalized,
      source: 'safe_recent_job_fallback' as const,
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let messageSid = ''
  let senderPhone = ''
  let clinicId = ''

  const slowProcessingTimer = setTimeout(() => {
    console.warn('[whatsapp-webhook] slow-processing-warning', {
      elapsedMs: Date.now() - startedAt,
      threshold: 25_000,
      messageSid: messageSid || '(not-yet-parsed)',
    })
  }, 25_000)

  try {
  const isDevMode = process.env.WHATSAPP_DEV_MODE === 'true'

  // Read raw body once — required for signature verification and param parsing
  const rawBody = await request.text()

  // Validate Twilio signature in production (skip in dev mode for test endpoint support)
  if (!isDevMode) {
    if (!verifyTwilioSignature(request, rawBody)) {
      console.error('Webhook rejected: invalid signature')
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  const contentType = request.headers.get('content-type') ?? ''

  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return twilioXmlResponse()
  }

  const params = new URLSearchParams(rawBody)

  const bodyRaw = String(params.get('Body') ?? '')
  const from = String(params.get('From') ?? '').trim()
  senderPhone = from
  const originalRepliedSid = String(params.get('OriginalRepliedMessageSid') ?? '').trim()
  messageSid = String(params.get('MessageSid') ?? '').trim()
  const reminderRef = parseReminderRef(bodyRaw)

  if (messageSid) {
    const alreadyProcessed = await prisma.conversationMessage.findFirst({
      where: { twilioMessageSid: messageSid },
      select: { id: true },
    })
    if (alreadyProcessed) {
      console.log('[whatsapp-webhook] duplicate-message-suppressed', { messageSid })
      return twilioXmlResponse()
    }
  }

  if (!from) {
    console.log('[whatsapp-webhook] ignored: missing sender')
    return twilioXmlResponse()
  }

  const inboundContext = await resolveInboundClinicPatientContext({
    fromRaw: from,
    originalRepliedSid,
    reminderRef,
  })

  if (inboundContext) {
    try {
      const conversation = await ensureConversation({
        clinicId: inboundContext.clinicId,
        patientId: inboundContext.patientId,
        channel: 'whatsapp',
        externalId: inboundContext.phoneNormalized,
      })

      const persistedMessage = await persistInboundMessage({
        conversationId: conversation.id,
        content: bodyRaw.trim() || '(empty message)',
        externalId: messageSid || null,
        senderType: 'patient',
      })

      console.log('[whatsapp-webhook] inbound-persisted', {
        source: inboundContext.source,
        clinicId: inboundContext.clinicId,
        patientId: inboundContext.patientId,
        conversationId: conversation.id,
        messageId: persistedMessage.id,
        messageSid: messageSid || null,
      })
    } catch (error) {
      console.error('[whatsapp-webhook] inbound-persistence-failed', {
        from: inboundContext.phoneNormalized,
        messageSid: messageSid || null,
        error,
      })
    }
  } else {
    console.warn('[whatsapp-webhook] inbound-persistence-skipped', {
      from: normalizePhone(from),
      messageSid: messageSid || null,
      reason: 'no_resolved_clinic_patient_context',
    })
  }

  const outboundPatientContext = inboundContext
    ? { clinicId: inboundContext.clinicId, patientId: inboundContext.patientId, patientPhone: inboundContext.phoneNormalized }
    : undefined

  // ── FSM Session Resolution ────────────────────────────────────────────────────
  let fsmSession: Awaited<ReturnType<typeof resolveSession>> | null = null
  if (from && inboundContext?.clinicId) {
    try {
      const fsmPhone = normalizePhone(from)
      fsmSession = await resolveSession(fsmPhone, inboundContext.clinicId)
      await persistMessage({
        sessionId: fsmSession.id,
        clinicId: inboundContext.clinicId,
        role: 'patient',
        channel: 'whatsapp',
        content: bodyRaw,
        currentState: fsmSession.currentState,
        twilioMessageSid: messageSid || undefined,
      })
    } catch (fsmErr) {
      console.error('[whatsapp-webhook] fsm-session-resolve-failed', { error: String(fsmErr) })
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Numeric Selection Parser ──────────────────────────────────────────────
  let numericSelection: number | null = null
  if (fsmSession) {
    numericSelection = parseNumericInput(bodyRaw)
    if (numericSelection !== null) {
      console.log('[numeric-selection]', {
        input: bodyRaw,
        parsedIndex: numericSelection,
        fsmState: fsmSession.currentState,
      })
    }
  }

  // Handle numeric service selection
  if (
    fsmSession?.currentState === 'SLOT_COLLECTION_SERVICE' &&
    numericSelection !== null &&
    inboundContext?.clinicId
  ) {
    const services = await prisma.service.findMany({
      where: { clinicId: inboundContext.clinicId, isActive: true },
      orderBy: { name: 'asc' },
      take: 10,
    })
    const index = numericSelection === -1 ? services.length - 1 : numericSelection - 1
    const selected = services[index]
    if (selected) {
      console.log('[numeric-selection-service]', { serviceName: selected.name, serviceId: selected.id })
      await prisma.conversationSession.update({
        where: { id: fsmSession.id },
        data: { slotServiceId: selected.id },
      })
      await transitionSession(fsmSession.id, inboundContext.clinicId, 'SLOT_COLLECTION_DATE', 'SLOT_VALID')
      await persistMessage({
        sessionId: fsmSession.id,
        clinicId: inboundContext.clinicId,
        role: 'assistant',
        channel: 'whatsapp',
        content: 'وش الوقت المناسب لك؟ (صباح / مساء / يوم معين)',
        currentState: 'SLOT_COLLECTION_DATE',
      })
      clearTimeout(slowProcessingTimer)
      return twilioXmlMessageResponse('وش الوقت المناسب لك؟ (صباح / مساء / يوم معين)')
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const aiDecision = await runAiInterpretationPipeline({
    bodyRaw,
    from,
    messageSid,
    originalRepliedSid,
  })
  const normalizedReply = aiDecision.normalizedReply
  const ruleInterpretation = aiDecision.ruleInterpretation
  const aiInterpretation = aiDecision.finalInterpretation
  const llmFallbackUsed = aiDecision.llmFallbackUsed
  const llmFallbackNotes = aiDecision.llmFallbackNotes
  const finalIntent = aiInterpretation.intent

  // ── Rule-based Booking Intent Fallback ───────────────────────────────────
  const BOOKING_KEYWORDS = [
    'حجز', 'احجز', 'ابي احجز', 'ابغى موعد', 'ابي موعد', 'موعد جديد',
    'ابغى احجز', 'ابغى اسوي موعد', 'ابي اسوي موعد', 'بغيت موعد',
    'ودي احجز', 'ودي موعد', 'اريد موعد', 'اريد احجز',
  ]
  const isBookingKeyword = BOOKING_KEYWORDS.some(k => bodyRaw.includes(k))
  if (isBookingKeyword && aiInterpretation.intent === 'unknown') {
    aiInterpretation.intent = 'new_booking'
    aiInterpretation.confidence = 'high'
    console.log('[force-booking-intent]', { input: bodyRaw, reason: 'keyword_match' })
  }

  // ── Direct booking flow entry (no FSM session) ────────────────────────────
  if (
    aiInterpretation.intent === 'new_booking' &&
    (!fsmSession || ['IDLE', 'EXPIRED', 'CORRUPTED', 'BOOKING_CONFIRMED', 'CANCELLATION_CONFIRMED', 'BOOKING_FAILED'].includes(fsmSession.currentState)) &&
    inboundContext?.clinicId
  ) {
    const activeServices = await prisma.service.findMany({
      where: { clinicId: inboundContext.clinicId, isActive: true },
      orderBy: { name: 'asc' },
      take: 10,
      select: { id: true, name: true },
    })

    if (activeServices.length > 0) {
      const serviceListMsg = [
        'اختَر الخدمة المطلوبة:',
        ...activeServices.map((svc, idx) => `${idx + 1}) ${svc.name}`),
      ].join('\n')

      if (fsmSession) {
        await transitionSession(fsmSession.id, inboundContext.clinicId, 'SLOT_COLLECTION_SERVICE', 'INTENT_BOOKING')
        await persistMessage({
          sessionId: fsmSession.id,
          clinicId: inboundContext.clinicId,
          role: 'assistant',
          channel: 'whatsapp',
          content: serviceListMsg,
          currentState: 'SLOT_COLLECTION_SERVICE',
        })
      }

      await saveConversationSession({
        flow: 'service_selection_flow',
        clinicId: inboundContext.clinicId,
        appointmentId: null,
        notificationJobId: null,
        phoneNormalized: normalizePhone(from),
        providerMessageId: null,
        options: activeServices.map((svc, idx) => ({
          index: idx + 1,
          label: svc.name,
          serviceId: svc.id,
          scheduledAtIso: '',
          doctorName: '',
          doctorId: '',
        })),
      })

      console.log('[direct-booking-entry]', { clinicId: inboundContext.clinicId, serviceCount: activeServices.length })
      clearTimeout(slowProcessingTimer)
      return twilioXmlMessageResponse(serviceListMsg)
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const logFlowDecision = (actionTaken: string) => {
    console.log('[FLOW DECISION]', { finalIntent, actionTaken })
  }

  console.log('[whatsapp-webhook] inbound', {
    bodyRaw,
    normalizedReply,
    aiIntentRule: ruleInterpretation.intent,
    aiConfidenceRule: ruleInterpretation.confidence,
    aiIntent: aiInterpretation.intent,
    aiConfidence: aiInterpretation.confidence,
    aiPreferredDateOffsetDays: aiInterpretation.preferredDateOffsetDays,
    aiPreferredWeekOffsetDays: aiInterpretation.preferredWeekOffsetDays,
    aiPreferredDayOfWeek: aiInterpretation.preferredDayOfWeek,
    aiPreferredPeriod: aiInterpretation.preferredPeriod,
    aiDoctorHint: aiInterpretation.doctorHint,
    aiCanonicalText: aiInterpretation.canonicalText,
    llmFallbackUsed,
    llmFallbackNotes,
    from,
    originalRepliedSid,
    messageSid,
    extractedReminderRef: reminderRef,
  })

  const controlState = await readConversationControlState(from)
  if (controlState.state === 'human_active') {
    console.log('[whatsapp-webhook] human-control', {
      state: controlState.state,
      action: 'suppress_ai_auto_reply',
      from: controlState.phoneNormalized,
      clinicId: controlState.clinicId,
    })
    // ── FSM: mirror human_active into HUMAN_ESCALATION_ACTIVE ────────────────
    if (fsmSession && fsmSession.currentState !== 'HUMAN_ESCALATION_ACTIVE') {
      try {
        await transitionSession(
          fsmSession.id,
          controlState.clinicId ?? inboundContext?.clinicId ?? '',
          'HUMAN_ESCALATION_ACTIVE',
          'STAFF_CLAIMED'
        )
      } catch (fsmErr) {
        console.error('[whatsapp-webhook] fsm-human-active-failed', { error: fsmErr })
      }
    }
    // ─────────────────────────────────────────────────────────────────────────
    return twilioXmlResponse()
  }

  // ── Context-Aware AI Routing ──────────────────────────────────────────────
  if (fsmSession && !['IDLE', 'EXPIRED', 'CORRUPTED', 'BOOKING_CONFIRMED', 'CANCELLATION_CONFIRMED', 'BOOKING_FAILED'].includes(fsmSession.currentState)) {
    try {
      const messageHistory = await getMessageHistory(fsmSession.id)
      const collectedSlots: Record<string, string | null> = {
        'الخدمة': fsmSession.slotServiceId ?? null,
        'التاريخ': fsmSession.slotDate?.toISOString().split('T')[0] ?? null,
        'اسم المريض': fsmSession.slotPatientName ?? null,
      }

      const contextDecision = await routeMessageWithContext(
        bodyRaw,
        messageHistory.map(m => ({ role: m.role, content: m.content })),
        fsmSession.currentState,
        collectedSlots
      )

      console.log('[whatsapp-webhook] context-router', {
        fsmState: fsmSession.currentState,
        intent: contextDecision.intent,
        confidence: contextDecision.confidence,
        shouldContinueFlow: contextDecision.shouldContinueFlow,
        reasoning: contextDecision.reasoning,
      })

      if (contextDecision.shouldContinueFlow && contextDecision.intent !== 'new_booking' && contextDecision.intent !== 'cancel_booking') {
        aiInterpretation.intent = 'unknown'
        aiInterpretation.confidence = 'high'
      }
    } catch (contextErr) {
      console.error('[whatsapp-webhook] context-router-failed', { error: contextErr })
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (fsmSession && ACTIVE_FLOW_STATES.includes(fsmSession.currentState)) {
    const OVERRIDE_INTENTS = ['cancel', 'cancel_booking', 'new_booking', 'reschedule']
    if (!OVERRIDE_INTENTS.includes(aiInterpretation.intent)) {
      const suppressedIntent = aiInterpretation.intent
      aiInterpretation.intent = 'unknown'
      aiInterpretation.confidence = 'high'
      console.log('[whatsapp-webhook] flow-priority-guard', {
        fsmState: fsmSession.currentState,
        suppressedIntent,
        action: 'flow_continues',
      })
    } else {
      console.log('[whatsapp-webhook] flow-override-intent-allowed', {
        fsmState: fsmSession.currentState,
        intent: aiInterpretation.intent,
      })
    }
  }

  if (
    normalizedReply === null &&
    aiInterpretation.intent === 'unknown' &&
    (!fsmSession || !ACTIVE_FLOW_STATES.includes(fsmSession.currentState))
  ) {
    // ── Smart clarification based on patient context ───────────────────────
    if (inboundContext?.clinicId && inboundContext?.patientId) {
      try {
        const patientCtx = await resolvePatientContext(
          normalizePhone(from),
          inboundContext.clinicId
        )

        if (patientCtx.hasUpcomingAppointment && patientCtx.upcomingAppointment) {
          const appt = patientCtx.upcomingAppointment
          const apptDate = appt.scheduledAt.toLocaleDateString('ar-SA', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'Asia/Riyadh',
          })
          const apptTime = appt.scheduledAt.toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Riyadh',
          })
          const doctorPart = appt.doctorName ? ` مع ${appt.doctorName}` : ''

          logFlowDecision('smart_clarify_with_appointment_context')
          return twilioXmlMessageResponse(
            `عندك موعد قائم ${apptDate} الساعة ${apptTime}${doctorPart}.\n\nتقصد تعدّله، أو تبغى حجز موعد إضافي؟`
          )
        }
      } catch (ctxErr) {
        console.error('[whatsapp-webhook] patient-context-failed', { error: ctxErr })
      }
    }

    logFlowDecision('clarify_vague_intent')
    return twilioXmlMessageResponse('أكيد، أبشرك 🙏\nوش تفضّل؟\n- حجز موعد جديد\n- معرفة الأوقات المتاحة\n- تغيير موعد موجود')
  }

  // ── FSM Date/Time Collection Handler ─────────────────────────────────────
  if (
    fsmSession &&
    fsmSession.currentState === 'SLOT_COLLECTION_DATE' &&
    fsmSession.slotServiceId &&
    inboundContext?.clinicId
  ) {
    console.log('[fsm-slot-date]', { input: bodyRaw, sessionId: fsmSession.id })

    // Pass bodyRaw directly into the existing booking options builder
    // by injecting it as the AI interpretation fields
    aiInterpretation.intent = 'new_booking'
    aiInterpretation.confidence = 'high'

    // Keep pendingServiceId available for the downstream booking flow
    // by saving it in the old session format so existing logic picks it up
    await saveConversationSession({
      flow: 'booking_flow',
      clinicId: inboundContext.clinicId,
      appointmentId: null,
      notificationJobId: null,
      phoneNormalized: normalizePhone(from),
      providerMessageId: null,
      options: [],
      pendingServiceId: fsmSession.slotServiceId,
    })

    console.log('[fsm-slot-date-bridged]', {
      serviceId: fsmSession.slotServiceId,
      input: bodyRaw,
    })
  }
  // ─────────────────────────────────────────────────────────────────────────

  const conversationSession = await readActiveConversationSession({
    fromRaw: from,
    repliedSid: originalRepliedSid,
  })

  console.log('[whatsapp-webhook] session-check', {
    sessionFound: Boolean(conversationSession.session),
    sessionFlow: conversationSession.session?.flow ?? null,
    sessionSource: conversationSession.source,
  })

  // ── service_selection_flow: patient chose a service, now ask for time ─────
  if (
    conversationSession.session
    && normalizedReply !== null
    && normalizedReply >= 1
    && conversationSession.session.flow === 'service_selection_flow'
  ) {
    const session = conversationSession.session
    const selectedServiceOption = session.options.find((o) => o.index === normalizedReply)

    if (!selectedServiceOption) {
      return twilioXmlMessageResponse(`اختَر رقم من 1 إلى ${session.options.length}.`)
    }

    await expireConversationSession(session.logId)
    // ── FSM: transition to SLOT_COLLECTION_DATE ───────────────────────────────
    if (fsmSession) {
      try {
        await transitionSession(
          fsmSession.id,
          session.clinicId,
          'SLOT_COLLECTION_DATE',
          'SLOT_VALID'
        )
        await prisma.conversationSession.update({
          where: { id: fsmSession.id },
          data: { slotServiceId: selectedServiceOption.serviceId },
        })
      } catch (fsmErr) {
        console.error('[whatsapp-webhook] fsm-slot-date-failed', { error: fsmErr })
      }
    }
    // ─────────────────────────────────────────────────────────────────────────
    const sentMsg = await sendWhatsAppWithOutcomeLogging({
      to: normalizePhone(from),
      body: 'وش الوقت المناسب لك؟ (صباح / مساء / يوم معين)',
      meta: {
        action: 'booking_ask_time_after_service',
        clinicId: session.clinicId,
        entityType: 'system',
        entityId: normalizePhone(from),
      },
      patientContext: outboundPatientContext,
    })

    await saveConversationSession({
      flow: 'booking_flow',
      clinicId: session.clinicId,
      appointmentId: null,
      notificationJobId: null,
      phoneNormalized: normalizePhone(from),
      providerMessageId: sentMsg.sid,
      options: [],
      pendingServiceId: selectedServiceOption.serviceId,
    })

    return twilioXmlResponse()
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (
    conversationSession.session
    && normalizedReply !== null
    && normalizedReply >= 1
    && (conversationSession.session.flow === 'booking_flow' || conversationSession.session.flow === 'availability_flow')
    && conversationSession.session.options.length > 0
  ) {
    const session = conversationSession.session
    const selectedOption = session.options.find((o) => o.index === normalizedReply)

    console.log('[whatsapp-webhook] session-slot-selection', {
      sessionFlow: session.flow,
      sessionLogId: session.logId,
      selectedIndex: normalizedReply,
      optionMatched: Boolean(selectedOption),
    })

    if (!selectedOption) {
      return twilioXmlMessageResponse(`هذا الرقم مو واضح عندي، اختر رقم من 1 إلى ${session.options.length}.`)
    }

    // ── Real appointment creation ─────────────────────────────────────────

    const [bookingDoctor, bookingService] = await Promise.all([
      prisma.doctor.findFirst({
        where: { id: selectedOption.doctorId, clinicId: session.clinicId, isActive: true },
        select: { id: true, availabilitySchedule: true, firstName: true, lastName: true },
      }),
      prisma.service.findFirst({
        where: { id: selectedOption.serviceId, clinicId: session.clinicId, isActive: true },
        select: { id: true, durationMinutes: true, name: true },
      }),
    ])

    if (!bookingDoctor || !bookingService) {
      return twilioXmlMessageResponse('حدث خطأ في تحديد الطبيب أو الخدمة. حاول مرة أخرى أو تواصل مع العيادة.')
    }

    const slotStart = new Date(selectedOption.scheduledAtIso)
    if (Number.isNaN(slotStart.getTime())) {
      return twilioXmlMessageResponse('الموعد المختار غير صالح. حاول مرة أخرى.')
    }

    const slotEnd = new Date(slotStart.getTime() + bookingService.durationMinutes * 60000)

    const slotAvailableInSchedule = isDateWithinDoctorAvailability(
      slotStart,
      bookingService.durationMinutes,
      bookingDoctor.availabilitySchedule
    )

    if (!slotAvailableInSchedule) {
      return twilioXmlMessageResponse('هذا الوقت لم يعد متاحاً. أرسل لي وقت آخر وأطلع لك خيارات جديدة.')
    }

    const overlappingBooking = await prisma.appointment.findFirst({
      where: {
        clinicId: session.clinicId,
        doctorId: bookingDoctor.id,
        status: { not: 'cancelled' },
        scheduledAt: { lt: slotEnd },
      },
      select: { id: true, scheduledAt: true, durationMinutes: true },
    })

    const hasOverlap = overlappingBooking
      ? slotStart < new Date(overlappingBooking.scheduledAt.getTime() + overlappingBooking.durationMinutes * 60000)
      : false

    if (hasOverlap) {
      return twilioXmlMessageResponse('هذا الوقت محجوز للتو. أرسل لي وقت آخر وأطلع لك خيارات جديدة.')
    }

    // Find or create patient by phone within the clinic
    const phoneNorm = session.phoneNormalized
    const last8 = phoneNorm.replace(/\D/g, '').slice(-8)

    let bookingPatient = last8
      ? await prisma.patient.findFirst({
          where: { clinicId: session.clinicId, phone: { endsWith: last8 } },
          select: { id: true, firstName: true, lastName: true },
        })
      : null

    if (!bookingPatient) {
      bookingPatient = await prisma.patient.create({
        data: {
          clinicId: session.clinicId,
          firstName: 'WhatsApp',
          lastName: 'Patient',
          phone: phoneNorm,
        },
        select: { id: true, firstName: true, lastName: true },
      })
    }

    // Use the clinic's first owner/admin as the system createdBy user
    const clinicMembership = await prisma.membership.findFirst({
      where: { clinicId: session.clinicId, isActive: true, role: { in: ['owner', 'admin'] } },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    })

    if (!clinicMembership) {
      return twilioXmlMessageResponse('تعذر إتمام الحجز تلقائياً. تواصل مع العيادة مباشرة.')
    }

    const newAppointment = await prisma.appointment.create({
      data: {
        clinicId: session.clinicId,
        patientId: bookingPatient.id,
        doctorId: bookingDoctor.id,
        serviceId: bookingService.id,
        scheduledAt: slotStart,
        durationMinutes: bookingService.durationMinutes,
        status: 'scheduled',
        notes: `[WhatsApp Booking] ${phoneNorm}`,
        createdBy: clinicMembership.userId,
      },
    })

    await expireConversationSession(session.logId)

    // ── FSM: transition to BOOKING_CONFIRMED ─────────────────────────────────────────────
    if (fsmSession) {
      try {
        await transitionSession(
          fsmSession.id,
          inboundContext!.clinicId,
          'BOOKING_CONFIRMED',
          'BOOKING_SUCCESS'
        )
      } catch (fsmErr) {
        console.error('[whatsapp-webhook] fsm-booking-confirmed-failed', { error: fsmErr })
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────

    await prisma.escalationLog.create({
      data: {
        clinicId: session.clinicId,
        entityType: 'appointment',
        entityId: newAppointment.id,
        eventType: 'whatsapp_booking_created',
        severity: 'info',
        message: `Appointment created via WhatsApp for ${phoneNorm}`,
        metadata: {
          sessionLogId: session.logId,
          selectedSlot: selectedOption,
          patientId: bookingPatient.id,
          appointmentId: newAppointment.id,
        },
      },
    })

    const bookingConfirmation = [
      'تمام 👍 حجزت لك الموعد',
      '',
      `📅 ${selectedOption.label}`,
      `👨‍⚕️ ${selectedOption.doctorName}`,
      '',
      'إذا حاب:',
      '- غير الموعد',
      '- أو ألغِ الموعد',
      'اكتب لي 👍',
    ].join('\n')

    await sendWhatsAppWithOutcomeLogging({
      to: normalizePhone(from),
      body: bookingConfirmation,
      meta: {
        action: 'booking_confirmation',
        clinicId: session.clinicId,
        entityType: 'appointment',
        entityId: newAppointment.id,
      },
      patientContext: outboundPatientContext,
    })
    return twilioXmlResponse()
  }

  const activeRescheduleContextResult = await findActiveRescheduleContext({
    fromRaw: from,
    originalRepliedSid,
  })

  if (activeRescheduleContextResult.context && normalizedReply !== null && normalizedReply >= 1) {
    const context = activeRescheduleContextResult.context
    const selectedOption = context.options.find((item) => item.index === normalizedReply)

    console.log('[whatsapp-webhook] reschedule-context', {
      contextSource: activeRescheduleContextResult.source,
      contextReason: activeRescheduleContextResult.reason,
      contextCandidateCount: activeRescheduleContextResult.candidateCount,
      contextLogId: context.logId,
      appointmentId: context.appointmentId,
      selectedOption: normalizedReply,
      optionMatched: Boolean(selectedOption),
    })

    if (!selectedOption) {
      return twilioXmlMessageResponse('اختَر رقم من الخيارات اللي فوق 🙏')
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: context.appointmentId,
        clinicId: context.clinicId,
      },
      include: {
        doctor: {
          select: {
            firstName: true,
            lastName: true,
            availabilitySchedule: true,
          },
        },
        service: {
          select: {
            name: true,
            durationMinutes: true,
          },
        },
        patient: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    if (!appointment) {
      return twilioXmlMessageResponse('ما قدرت أوصل للموعد هذا الآن. جرّب مرة ثانية.')
    }

    const newScheduledAt = new Date(selectedOption.scheduledAtIso)
    if (Number.isNaN(newScheduledAt.getTime())) {
      return twilioXmlMessageResponse('الوقت المختار مو واضح. خلنا نعيد المحاولة.')
    }

    const available = isDateWithinDoctorAvailability(
      newScheduledAt,
      appointment.durationMinutes,
      appointment.doctor.availabilitySchedule
    )

    if (!available) {
      return twilioXmlMessageResponse('الوقت هذا ما عاد متاح. اكتب: غير الموعد ونرسل لك خيارات جديدة.')
    }

    const newEnd = new Date(newScheduledAt.getTime() + appointment.durationMinutes * 60000)
    const existingAppointments = await prisma.appointment.findMany({
      where: {
        clinicId: appointment.clinicId,
        doctorId: appointment.doctorId,
        NOT: {
          id: appointment.id,
        },
        status: {
          not: 'cancelled',
        },
        scheduledAt: {
          lt: newEnd,
        },
      },
      select: {
        scheduledAt: true,
        durationMinutes: true,
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    })

    const overlapping = existingAppointments.some((existing) => {
      const existingEnd = new Date(existing.scheduledAt.getTime() + existing.durationMinutes * 60000)
      return newScheduledAt < existingEnd && newEnd > existing.scheduledAt
    })

    if (overlapping) {
      return twilioXmlMessageResponse('واضح الوقت انحجز قبل لحظات. اكتب: غير الموعد ونطلع لك بدائل.')
    }

    const previousSchedule = appointment.scheduledAt
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        scheduledAt: newScheduledAt,
        status: 'scheduled',
        notes: appointment.notes
          ? `${appointment.notes}\n[WhatsApp Reschedule] ${previousSchedule.toISOString()} -> ${newScheduledAt.toISOString()}`
          : `[WhatsApp Reschedule] ${previousSchedule.toISOString()} -> ${newScheduledAt.toISOString()}`,
      },
    })

    await updateRescheduleContextStatus(context.logId, 'completed', selectedOption.index)

    await prisma.escalationLog.create({
      data: {
        clinicId: appointment.clinicId,
        entityType: 'appointment',
        entityId: appointment.id,
        eventType: 'whatsapp_reply_rescheduled',
        severity: 'info',
        message: `Patient selected WhatsApp reschedule option ${selectedOption.index}.`,
        metadata: {
          notificationJobId: context.notificationJobId,
          selectedOption: selectedOption.index,
          oldScheduledAt: previousSchedule.toISOString(),
          newScheduledAt: newScheduledAt.toISOString(),
        },
      },
    })

    const confirmation = [
      'تمام 👍 تغيّر موعدك',
      '',
      `📅 ${formatOptionLabel(newScheduledAt)}`,
      `👨‍⚕️ ${appointment.doctor.firstName} ${appointment.doctor.lastName}`,
      '',
      'إذا مناسبك تمام، وإذا تبغى نغيّره مرة ثانية اكتب: غير الموعد',
    ].join('\n')

    await sendWhatsAppWithOutcomeLogging({
      to: normalizePhone(from),
      body: confirmation,
      meta: {
        action: 'reschedule_confirmation',
        clinicId: appointment.clinicId,
        entityType: 'appointment',
        entityId: appointment.id,
      },
      patientContext: outboundPatientContext,
    })
    return twilioXmlResponse()
  }

  if (normalizedReply === null && (
    aiInterpretation.intent === 'new_booking'
    || aiInterpretation.intent === 'availability_check'
    || aiInterpretation.intent === 'inquiry_price'
    || aiInterpretation.intent === 'inquiry_doctor'
    || aiInterpretation.preferredPeriod !== null
    || aiInterpretation.preferredDateOffsetDays !== null
    || aiInterpretation.preferredDayOfWeek !== null
  )) {
    const clinicContext = await resolveSingleClinicContextFromPhone(from)

    if (!clinicContext.clinicId) {
      return twilioXmlMessageResponse('ممتاز، بس احتاج أحدد العيادة أول. اكتب اسم العيادة أو رقمها.')
    }

    if (aiInterpretation.intent === 'inquiry_price') {
      const services = await prisma.service.findMany({
        where: {
          clinicId: clinicContext.clinicId,
          isActive: true,
        },
        select: {
          name: true,
          price: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 3,
      })

      if (services.length === 0) {
        return twilioXmlMessageResponse('حالياً ما عندي قائمة أسعار جاهزة هنا. اكتب نوع الخدمة اللي تبغاها وأرسل لك التفاصيل.')
      }

      const message = [
        'أكيد 👍 هذي أسعار تقريبية:',
        ...services.map((service) => `- ${service.name}: ${service.price ?? 0}`),
      ].join('\n')

      return twilioXmlMessageResponse(message)
    }

    if (aiInterpretation.intent === 'inquiry_doctor') {
      const doctors = await prisma.doctor.findMany({
        where: {
          clinicId: clinicContext.clinicId,
          isActive: true,
        },
        select: {
          firstName: true,
          lastName: true,
          specialty: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 5,
      })

      if (doctors.length === 0) {
        return twilioXmlMessageResponse('حالياً ما عندي قائمة الأطباء هنا. تواصل مع الاستقبال ونرتب لك بسرعة.')
      }

      const message = [
        'أكيد، الأطباء المتاحين:',
        ...doctors.map((doctor) => {
          const fullName = `${doctor.firstName} ${doctor.lastName}`
          return doctor.specialty ? `- د. ${fullName} (${doctor.specialty})` : `- د. ${fullName}`
        }),
      ].join('\n')

      return twilioXmlMessageResponse(message)
    }

    // For new_booking: pick up pre-selected service from an active booking_flow
    // session that has no slot options yet (service was selected, waiting for time)
    const pendingServiceId = (
      conversationSession.session?.flow === 'booking_flow'
      && conversationSession.session.options.length === 0
      && conversationSession.session.pendingServiceId
    ) ? conversationSession.session.pendingServiceId : null

    if (
      aiInterpretation.intent === 'new_booking'
      && !pendingServiceId
      && aiInterpretation.preferredDateOffsetDays === null
      && aiInterpretation.preferredDayOfWeek === null
      && aiInterpretation.preferredPeriod === null
    ) {
      // Ask for service if clinic has multiple, else ask for time directly
      const activeServices = await prisma.service.findMany({
        where: { clinicId: clinicContext.clinicId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 10,
      })

      if (activeServices.length > 1) {
        const serviceOptions: ConversationSessionOption[] = activeServices.map((svc, idx) => ({
          index: idx + 1,
          label: svc.name,
          serviceId: svc.id,
          scheduledAtIso: '',
          doctorName: '',
          doctorId: '',
        }))
        const serviceListMsg = [
          'اختَر الخدمة المطلوبة:',
          ...activeServices.map((svc, idx) => `${idx + 1}) ${svc.name}`),
        ].join('\n')
        const sentServiceMsg = await sendWhatsAppWithOutcomeLogging({
          to: normalizePhone(from),
          body: serviceListMsg,
          meta: {
            action: 'service_selection_sent',
            clinicId: clinicContext.clinicId,
            entityType: 'system',
            entityId: normalizePhone(from),
          },
          patientContext: outboundPatientContext,
        })
        // ── FSM: transition to SLOT_COLLECTION_SERVICE ────────────────────────
        if (fsmSession) {
          try {
            await transitionSession(
              fsmSession.id,
              clinicContext.clinicId,
              'SLOT_COLLECTION_SERVICE',
              'INTENT_BOOKING'
            )
            await persistMessage({
              sessionId: fsmSession.id,
              clinicId: clinicContext.clinicId,
              role: 'assistant',
              channel: 'whatsapp',
              content: serviceListMsg,
              currentState: 'SLOT_COLLECTION_SERVICE',
            })
          } catch (fsmErr) {
            console.error('[whatsapp-webhook] fsm-service-selection-failed', { error: fsmErr })
          }
        }
        // ─────────────────────────────────────────────────────────────────────
        await saveConversationSession({
          flow: 'service_selection_flow',
          clinicId: clinicContext.clinicId,
          appointmentId: null,
          notificationJobId: null,
          phoneNormalized: normalizePhone(from),
          providerMessageId: sentServiceMsg.sid,
          options: serviceOptions,
        })
        return twilioXmlResponse()
      }

      logFlowDecision('ask_booking_time_preference')
      return twilioXmlMessageResponse('وش الوقت المناسب لك؟ (صباح / مساء / يوم معين)')
    }

    if (
      aiInterpretation.intent === 'new_booking'
      && !pendingServiceId
      && aiInterpretation.preferredDateOffsetDays === null
      && aiInterpretation.preferredDayOfWeek === null
      && aiInterpretation.preferredPeriod === null
    ) {
      logFlowDecision('ask_booking_time_preference')
      return twilioXmlMessageResponse('وش الوقت المناسب لك؟ (صباح / مساء / يوم معين)')
    }

    // Expire any pending booking_flow (service selected, awaiting time) before building fresh slots
    if (pendingServiceId && conversationSession.session) {
      await expireConversationSession(conversationSession.session.logId)
    }

    const booking = await buildNewBookingOptions({
      clinicId: clinicContext.clinicId,
      serviceId: pendingServiceId,
      preferredDateOffsetDays: aiInterpretation.preferredDateOffsetDays,
      preferredWeekOffsetDays: aiInterpretation.preferredWeekOffsetDays,
      preferredDayOfWeek: aiInterpretation.preferredDayOfWeek,
      preferredPeriod: aiInterpretation.preferredPeriod,
      doctorHint: aiInterpretation.doctorHint,
    })

    if (booking.options.length === 0) {
      logFlowDecision('no_slots_found_for_preferences')
      return twilioXmlMessageResponse('حالياً ما لقيت وقت مناسب بنفس التفضيلات. ارسل يوم أو فترة ثانية ونطلع لك خيارات.')
    }

    const flowOptions = aiInterpretation.intent === 'availability_check'
      ? booking.options.slice(0, 3)
      : booking.options

    const listHeader = aiInterpretation.intent === 'availability_check'
      ? 'هذه أقرب 3 أوقات متاحة:'
      : 'أكيد 👍 هذه أقرب المواعيد:'

    const message = [
      listHeader,
      ...flowOptions.map((option) => `${option.index}) ${option.label} - ${option.doctorName}`),
      '',
      'اختَر رقم الوقت المناسب 👇',
    ].join('\n')

    logFlowDecision(aiInterpretation.intent === 'availability_check' ? 'send_top3_availability_slots' : 'continue_booking_with_options')

    const sentBookingMessage = await sendWhatsAppWithOutcomeLogging({
      to: normalizePhone(from),
      body: message,
      meta: {
        action: 'booking_options_sent',
        clinicId: clinicContext.clinicId,
        entityType: 'system',
        entityId: normalizePhone(from),
      },
      patientContext: outboundPatientContext,
    })

    // ── FSM: transition to SLOT_COLLECTION_TIME ───────────────────────────────
    if (fsmSession) {
      try {
        await transitionSession(
          fsmSession.id,
          clinicContext.clinicId,
          'SLOT_COLLECTION_TIME',
          'SLOT_VALID'
        )
        await persistMessage({
          sessionId: fsmSession.id,
          clinicId: clinicContext.clinicId,
          role: 'assistant',
          channel: 'whatsapp',
          content: message,
          currentState: 'SLOT_COLLECTION_TIME',
        })
      } catch (fsmErr) {
        console.error('[whatsapp-webhook] fsm-slot-time-failed', { error: fsmErr })
      }
    }
    // ─────────────────────────────────────────────────────────────────────────
    await saveConversationSession({
      flow: aiInterpretation.intent === 'availability_check' ? 'availability_flow' : 'booking_flow',
      clinicId: clinicContext.clinicId,
      appointmentId: null,
      notificationJobId: null,
      phoneNormalized: normalizePhone(from),
      providerMessageId: sentBookingMessage.sid,
      options: flowOptions,
    })

    return twilioXmlResponse()
  }

  const isConfirmIntent = normalizedReply === 1 || (normalizedReply === null && aiInterpretation.intent === 'confirm')
  const isCancelIntent = !isConfirmIntent && normalizedReply === null && aiInterpretation.intent === 'cancel'
  const isRescheduleIntent = !isConfirmIntent && !isCancelIntent && (
    normalizedReply !== null || (normalizedReply === null && aiInterpretation.intent === 'reschedule')
  )

  let notificationJob: Awaited<ReturnType<typeof prisma.notificationJob.findFirst>> & {
    appointment?: Awaited<ReturnType<typeof prisma.appointment.findFirst>>
  } | null = null
  let mappingSource: 'reply_sid' | 'ref_token' | 'safe_recent_fallback' | 'latest_appointment_fallback' | 'none' = 'none'
  let fallbackReason: string | null = null
  let fallbackCandidateJobs = 0
  let fallbackCandidateAppointments = 0
  let latestAppointmentFallbackReason: string | null = null
  let latestAppointmentFallbackCandidates = 0
  let latestAppointmentFallback = null as Awaited<ReturnType<typeof prisma.appointment.findFirst>>

  if (originalRepliedSid) {
    notificationJob = await prisma.notificationJob.findFirst({
      where: {
        channel: 'whatsapp',
        providerMessageId: originalRepliedSid,
      },
      include: {
        appointment: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (notificationJob) {
      mappingSource = 'reply_sid'
    }
  }

  if (!notificationJob && reminderRef) {
    notificationJob = await prisma.notificationJob.findFirst({
      where: {
        channel: 'whatsapp',
        reminderId: reminderRef,
      },
      include: {
        appointment: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (notificationJob) {
      mappingSource = 'ref_token'
    }
  }

  if (!notificationJob) {
    const fallback = await resolveSafeRecentNotificationJobFallback(from)
    fallbackReason = fallback.reason
    fallbackCandidateJobs = fallback.candidateJobs
    fallbackCandidateAppointments = fallback.candidateAppointments

    if (fallback.job) {
      notificationJob = fallback.job
      mappingSource = 'safe_recent_fallback'
    }
  }

  if (!notificationJob && (isConfirmIntent || isCancelIntent || isRescheduleIntent)) {
    const appointmentFallback = await resolveLatestActiveAppointmentByPhone(from, inboundContext?.clinicId)
    latestAppointmentFallbackReason = appointmentFallback.reason
    latestAppointmentFallbackCandidates = appointmentFallback.candidateCount

    if (appointmentFallback.appointment) {
      latestAppointmentFallback = appointmentFallback.appointment
      mappingSource = 'latest_appointment_fallback'
    }
  }

  console.log('[whatsapp-webhook] match-result', {
    originalRepliedSid: originalRepliedSid || null,
    extractedReminderRef: reminderRef,
    mappingSource,
    fallbackReason,
    fallbackCandidateJobs,
    fallbackCandidateAppointments,
    latestAppointmentFallbackReason,
    latestAppointmentFallbackCandidates,
    matchedNotificationJobId: notificationJob?.id ?? null,
    matchedAppointmentId: notificationJob?.appointmentId ?? latestAppointmentFallback?.id ?? null,
    matchedAppointmentScheduledAt:
      notificationJob?.appointment?.scheduledAt?.toISOString?.()
      ?? latestAppointmentFallback?.scheduledAt?.toISOString?.()
      ?? null,
  })

  if (!notificationJob && !latestAppointmentFallback) {
    if (isConfirmIntent || isCancelIntent || isRescheduleIntent) {
      if (latestAppointmentFallbackReason === 'no_active_appointments') {
        return twilioXmlMessageResponse('لا يوجد لديك مواعيد حالياً')
      }

      if (latestAppointmentFallbackReason === 'multiple_active_appointments') {
        return twilioXmlMessageResponse('عندك أكثر من موعد. رد على رسالة الموعد المطلوب عشان أحدد الطلب بدقة.')
      }
    }

    console.warn('[whatsapp-webhook] ambiguous-reply', {
      from,
      normalizedReply,
      originalRepliedSid: originalRepliedSid || null,
      extractedReminderRef: reminderRef,
      fallbackReason,
      fallbackCandidateJobs,
      fallbackCandidateAppointments,
      latestAppointmentFallbackReason,
      latestAppointmentFallbackCandidates,
    })

    return twilioXmlMessageResponse(
      'ما قدرت أحدد أي موعد تقصد. رد على نفس رسالة الموعد، أو اكتب لي التاريخ والوقت.'
    )
  }

  if (isConfirmIntent) {
    const confirmClinicId = notificationJob?.clinicId ?? latestAppointmentFallback?.clinicId
    const confirmAppointmentId = notificationJob?.appointmentId ?? latestAppointmentFallback?.id

    if (!confirmClinicId || !confirmAppointmentId) {
      return twilioXmlMessageResponse('تعذر تحديد الموعد للتأكيد. حاول الرد على رسالة الموعد مباشرة.')
    }

    const updated = await prisma.appointment.updateMany({
      where: {
        id: confirmAppointmentId,
        clinicId: confirmClinicId,
        status: {
          in: ['scheduled', 'confirmation_pending'],
        },
      },
      data: {
        status: 'confirmed',
        confirmedAt: new Date(),
      },
    })

    if (updated.count === 0) {
      const current = await prisma.appointment.findFirst({
        where: {
          id: confirmAppointmentId,
          clinicId: confirmClinicId,
        },
        select: {
          status: true,
        },
      })

      if (current?.status === 'confirmed') {
        console.log('[whatsapp-webhook] action', {
          action: 'confirm_appointment_noop_already_confirmed',
          appointmentId: confirmAppointmentId,
        })
        return twilioXmlResponse()
      }

      return twilioXmlMessageResponse('هذا الموعد لا يمكن تأكيده الآن. تواصل مع الاستقبال للمساعدة.')
    }

    await prisma.escalationLog.create({
      data: {
        clinicId: confirmClinicId,
        entityType: 'appointment',
        entityId: confirmAppointmentId,
        eventType: 'whatsapp_reply_confirmed',
        severity: 'info',
        message: `Patient confirmed appointment via WhatsApp reply (${from}).`,
        metadata: {
          notificationJobId: notificationJob?.id ?? null,
          inboundMessageSid: messageSid || null,
          replyRaw: bodyRaw,
          replyNormalized: normalizedReply,
          originalRepliedSid: originalRepliedSid || null,
          reminderRef: reminderRef || null,
          mappingSource,
        },
      },
    })

    console.log('[whatsapp-webhook] action', {
      action: 'confirm_appointment',
      appointmentId: confirmAppointmentId,
      appointmentScheduledAt:
        notificationJob?.appointment?.scheduledAt?.toISOString?.()
        ?? latestAppointmentFallback?.scheduledAt?.toISOString?.()
        ?? null,
      updatedCount: updated.count,
    })

    return twilioXmlResponse()
  }

  // ── Cancel intent ───────────────────────────────────────────────────────────
  if (isCancelIntent) {
    const cancelClinicId = notificationJob?.clinicId ?? latestAppointmentFallback?.clinicId
    const cancelAppointmentId = notificationJob?.appointmentId ?? latestAppointmentFallback?.id

    if (!cancelClinicId || !cancelAppointmentId) {
      return twilioXmlMessageResponse('ما قدرت أحدد الموعد للإلغاء. رد على رسالة الموعد أو تواصل مع الاستقبال مباشرة.')
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: cancelAppointmentId,
        clinicId: cancelClinicId,
      },
      select: {
        status: true,
        scheduledAt: true,
      },
    })

    if (!appointment) {
      return twilioXmlMessageResponse('ما لقيت الموعد. جرّب مرة ثانية أو تواصل مع الاستقبال.')
    }

    if (appointment.status === 'cancelled') {
      console.log('[whatsapp-webhook] action', {
        action: 'cancel_appointment_noop_already_cancelled',
        appointmentId: cancelAppointmentId,
      })
      return twilioXmlResponse()
    }

    if (!['scheduled', 'confirmation_pending', 'confirmed'].includes(appointment.status)) {
      return twilioXmlMessageResponse('هذا الموعد لا يمكن إلغاؤه الآن. تواصل مع الاستقبال للمساعدة.')
    }

    await prisma.appointment.update({
      where: { id: cancelAppointmentId },
      data: {
        status: 'cancelled',
        cancellationReason: 'Patient cancelled via WhatsApp',
      },
    })

    await prisma.escalationLog.create({
      data: {
        clinicId: cancelClinicId,
        entityType: 'appointment',
        entityId: cancelAppointmentId,
        eventType: 'whatsapp_reply_cancelled',
        severity: 'info',
        message: `Patient cancelled appointment via WhatsApp (${from}).`,
        metadata: {
          notificationJobId: notificationJob?.id ?? null,
          inboundMessageSid: messageSid || null,
          replyRaw: bodyRaw,
          originalRepliedSid: originalRepliedSid || null,
          mappingSource,
          cancelledAt: new Date().toISOString(),
          previousScheduledAt: appointment.scheduledAt.toISOString(),
        },
      },
    })

    // ── FSM: transition to CANCELLATION_CONFIRMED ────────────────────────────────
    if (fsmSession) {
      try {
        await transitionSession(
          fsmSession.id,
          cancelClinicId,
          'CANCELLATION_CONFIRMED',
          'AFFIRM'
        )
      } catch (fsmErr) {
        console.error('[whatsapp-webhook] fsm-cancellation-confirmed-failed', { error: fsmErr })
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────

    console.log('[whatsapp-webhook] action', {
      action: 'cancel_appointment',
      appointmentId: cancelAppointmentId,
      previousScheduledAt: appointment.scheduledAt.toISOString(),
    })

    const cancelMsg = [
      'تم إلغاء موعدك ✅',
      '',
      'إذا بغيت تحجز موعد جديد، اكتب: أبغى موعد',
    ].join('\n')

    await sendWhatsAppWithOutcomeLogging({
      to: normalizePhone(from),
      body: cancelMsg,
      meta: {
        action: 'cancel_confirmation',
        clinicId: cancelClinicId,
        entityType: 'appointment',
        entityId: cancelAppointmentId,
      },
      patientContext: outboundPatientContext,
    })

    return twilioXmlResponse()
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (!isRescheduleIntent) {
    return twilioXmlMessageResponse('ما فهمت عليك تمام 🤔\n\nتقدر تكتب مثلاً:\n- أبغى موعد\n- غير الموعد\n- كم السعر')
  }

  const rescheduleClinicId = notificationJob?.clinicId ?? latestAppointmentFallback?.clinicId
  const rescheduleAppointmentId = notificationJob?.appointmentId ?? latestAppointmentFallback?.id

  if (!rescheduleClinicId || !rescheduleAppointmentId) {
    return twilioXmlMessageResponse('تعذر تحديد الموعد لإعادة الجدولة. حاول الرد على رسالة الموعد مباشرة.')
  }

  await prisma.escalationLog.create({
    data: {
      clinicId: rescheduleClinicId,
      entityType: 'appointment',
      entityId: rescheduleAppointmentId,
      eventType: 'whatsapp_reply_reschedule_requested',
      severity: 'warning',
      message: `Patient requested reschedule via WhatsApp reply (${from}).`,
      metadata: {
        notificationJobId: notificationJob?.id ?? null,
        replyRaw: bodyRaw,
        replyNormalized: normalizedReply,
        originalRepliedSid: originalRepliedSid || null,
        reminderRef: reminderRef || null,
        mappingSource,
      },
    },
  })

  console.log('[whatsapp-webhook] action', {
    action: 'log_reschedule_request',
    appointmentId: notificationJob?.appointmentId ?? latestAppointmentFallback?.id ?? null,
    appointmentScheduledAt:
      notificationJob?.appointment?.scheduledAt?.toISOString?.()
      ?? latestAppointmentFallback?.scheduledAt?.toISOString?.()
      ?? null,
  })

  const appointmentForReschedule = await prisma.appointment.findFirst({
    where: {
      id: rescheduleAppointmentId,
      clinicId: rescheduleClinicId,
    },
    include: {
      doctor: {
        select: {
          availabilitySchedule: true,
          firstName: true,
          lastName: true,
        },
      },
      service: {
        select: {
          durationMinutes: true,
          name: true,
        },
      },
      patient: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  })

  if (!appointmentForReschedule) {
    return twilioXmlMessageResponse('ما قدرت أبدأ التغيير الآن. جرّب بعد شوي.')
  }

  const options = await buildNextRescheduleOptions({
    id: appointmentForReschedule.id,
    clinicId: appointmentForReschedule.clinicId,
    doctorId: appointmentForReschedule.doctorId,
    durationMinutes: appointmentForReschedule.durationMinutes,
    scheduledAt: appointmentForReschedule.scheduledAt,
    doctor: {
      availabilitySchedule: appointmentForReschedule.doctor.availabilitySchedule,
    },
  })

  if (options.length === 0) {
    await sendWhatsAppWithOutcomeLogging({
      to: normalizePhone(from),
      body: 'حالياً ما فيه بدائل مناسبة. إذا تبغى، اكتب يوم أو فترة ثانية ونطلع لك خيارات جديدة.',
      meta: {
        action: 'reschedule_no_options',
        clinicId: appointmentForReschedule.clinicId,
        entityType: 'appointment',
        entityId: appointmentForReschedule.id,
      },
      patientContext: outboundPatientContext,
    })

    return twilioXmlResponse()
  }

  const optionsMessage = [
    'تمام 👍 بنغير موعدك',
    '',
    'اختر وقت مناسب:',
    ...options.map((option) => `${option.index}) ${option.label}`),
    '',
    'اختَر رقم الوقت المناسب 👇',
  ].join('\n')

  const sent = await sendWhatsAppWithOutcomeLogging({
    to: normalizePhone(from),
    body: optionsMessage,
    meta: {
      action: 'reschedule_options_sent',
      clinicId: appointmentForReschedule.clinicId,
      entityType: 'appointment',
      entityId: appointmentForReschedule.id,
    },
    patientContext: outboundPatientContext,
  })

  await prisma.escalationLog.create({
    data: {
      clinicId: appointmentForReschedule.clinicId,
      entityType: 'appointment',
      entityId: appointmentForReschedule.id,
      eventType: 'whatsapp_reschedule_options_sent',
      severity: 'info',
      message: 'Sent WhatsApp reschedule options to patient.',
      metadata: {
        notificationJobId: notificationJob?.id ?? null,
        phoneNormalized: normalizePhone(from),
        options,
        status: 'pending',
        expiresAtIso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        providerMessageId: sent.sid,
      },
    },
  })

  await saveConversationSession({
    flow: 'reschedule_flow',
    clinicId: appointmentForReschedule.clinicId,
    appointmentId: appointmentForReschedule.id,
    notificationJobId: notificationJob?.id ?? null,
    phoneNormalized: normalizePhone(from),
    providerMessageId: sent.sid,
    options: options.map((opt) => ({
      index: opt.index,
      scheduledAtIso: opt.scheduledAtIso,
      label: opt.label,
      doctorName: `${appointmentForReschedule.doctor.firstName} ${appointmentForReschedule.doctor.lastName}`,
      doctorId: appointmentForReschedule.doctorId,
      serviceId: appointmentForReschedule.serviceId,
    })),
  })

  return twilioXmlResponse()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    const timestamp = new Date().toISOString()

    console.error('[whatsapp-webhook] FATAL_UNHANDLED_ERROR', {
      timestamp,
      errorMessage,
      errorStack,
      senderPhone: senderPhone || 'unknown',
      messageSid: messageSid || 'unknown',
    })

    if (clinicId) {
      try {
        await prisma.escalationLog.create({
          data: {
            clinicId,
            entityType: 'system',
            entityId: 'whatsapp-webhook',
            eventType: 'webhook_fatal_error',
            severity: 'critical',
            message: errorMessage,
            metadata: {
              errorMessage,
              errorStack: errorStack ?? null,
              senderPhone: senderPhone || 'unknown',
              messageSid: messageSid || 'unknown',
              timestamp,
            },
          },
        })
      } catch (dbError) {
        console.error('[whatsapp-webhook] fatal-error-db-log-failed', { dbError })
      }
    }

    return twilioXmlResponse()
  } finally {
    clearTimeout(slowProcessingTimer)
  }
}
