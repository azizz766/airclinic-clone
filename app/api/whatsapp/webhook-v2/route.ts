/**
 * app/api/whatsapp/webhook-v2/route.ts
 *
 * WhatsApp FSM Webhook — Production Entry Point
 *
 * Dispatch is STATE-driven, not intent-driven.
 * AI intent detection feeds INTO the FSM — it never replaces it.
 *
 * Every message produces exactly one of:
 *   ✅ Confirmed booking (persisted to DB)
 *   ✅ Clean escalation (staff notified, user informed)
 *   ✅ Continued flow (next FSM step prompted)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/lib/prisma-client/client'
import { resolveSession, transitionSession, persistMessage } from '@/lib/whatsapp/session'
import {
  runAiInterpretationPipeline,
  type AiInterpretation,
  type AiDecisionRecord,
} from '@/lib/whatsapp/ai-interpretation-pipeline'
import {
  processBooking,
  SlotConflictError,
  BookingValidationError,
} from '@/lib/whatsapp/booking-handler'
import { ConversationState } from '@/lib/prisma-client/enums'
import twilio from 'twilio'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Session = Awaited<ReturnType<typeof resolveSession>>

type HandlerContext = {
  session: Session
  clinicId: string
  from: string         // patient WhatsApp number  e.g. "+966XXXXXXXXX"
  clinicNumber: string // clinic Twilio number      e.g. "+9660XXXXXXXX"
  body: string         // raw user message text
  messageSid: string
  interpretation: AiInterpretation
}

type HandlerResult = {
  reply: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Twilio — Client & Sender
// ─────────────────────────────────────────────────────────────────────────────

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
)

async function sendWhatsAppReply(
  to: string,
  from: string,
  body: string,
): Promise<string> {
  const msg = await twilioClient.messages.create({
    from: `whatsapp:${from}`,
    to: `whatsapp:${to}`,
    body,
  })
  return msg.sid
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Parsers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse Arabic-Indic digits, Arabic ordinal words, and Latin digits
 * into a 1-based integer. Returns null on failure.
 */
function parseSelection(text: string): number | null {
  const t = text.trim()

  // Latin digits: "1", "2", ...
  const latin = parseInt(t, 10)
  if (!isNaN(latin) && String(latin) === t && latin > 0) return latin

  // Arabic-Indic digits: ١, ٢, ...
  const normalized = t.replace(/[٠-٩]/g, (d) =>
    String(d.charCodeAt(0) - 0x0660),
  )
  const fromIndic = parseInt(normalized, 10)
  if (!isNaN(fromIndic) && fromIndic > 0) return fromIndic

  // Arabic ordinal words
  const ordinals: Record<string, number> = {
    'الأول': 1, 'الاول': 1, 'أول': 1, 'اول': 1, 'الأولى': 1, 'الاولى': 1, 'واحد': 1,
    'الثاني': 2, 'الثانية': 2, 'ثاني': 2, 'ثانية': 2, 'اثنين': 2, 'اثنان': 2,
    'الثالث': 3, 'الثالثة': 3, 'ثالث': 3, 'ثلاثة': 3,
    'الرابع': 4, 'الرابعة': 4, 'رابع': 4, 'أربعة': 4,
    'الخامس': 5, 'الخامسة': 5, 'خامس': 5, 'خمسة': 5,
  }
  return ordinals[t] ?? null
}

function isAffirmative(text: string): boolean {
  const t = text.trim()
  return [
    'نعم', 'اي', 'آي', 'أي', 'ايوا', 'ايوه', 'ايه', 'أيه',
    'تمام', 'صح', 'صحيح', 'اكيد', 'أكيد', 'بالتأكيد',
    'موافق', 'موافقة', 'احجز', 'أحجز', 'تأكيد', 'تاكيد',
    'yes', 'y', 'ok', 'okay', 'yep', '1',
  ].some((a) => t === a || t.toLowerCase().includes(a))
}

function isNegative(text: string): boolean {
  const t = text.trim()
  return [
    'لا', 'لأ', 'لأه', 'لاه', 'كلا',
    'مو', 'مب', 'ما ابي', 'ما أبي',
    'no', 'n', 'نو', 'الغ',
  ].some((n) => t === n || t.toLowerCase().startsWith(n))
}

function isEscalationRequest(text: string): boolean {
  const t = text.trim()
  return [
    'ابي احد يكلمني', 'أبي أحد يكلمني', 'ابغى احد يكلمني',
    'وصلني لموظف', 'وصلني موظف', 'كلمني موظف',
    'تكلم موظف', 'اريد موظف', 'أريد موظف',
    'human', 'agent', 'موظف بشري',
  ].some((trigger) => t.includes(trigger))
}

function parseDateInput(raw: string): Date | null {

  // Normalize Arabic-Indic digits to Latin
  raw = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  const t = raw.trim()

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    if (!isNaN(d.getTime())) return d
  }

  // YYYY-MM-DD or YYYY/MM/DD
  const ymd = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    if (!isNaN(d.getTime())) return d
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Retry Logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Increment retryCount and escalate if limit reached.
 * Returns an escalation HandlerResult, or null to continue with re-prompt.
 */
async function checkRetryLimit(
  session: Session,
  clinicId: string,
): Promise<HandlerResult | null> {
  const nextRetry = session.retryCount + 1

  await prisma.conversationSession.update({
    where: { id: session.id },
    data: { retryCount: { increment: 1 } },
  })

  if (nextRetry >= session.maxRetriesPerState) {
    await transitionSession(
      session.id,
      clinicId,
      'HUMAN_ESCALATION_PENDING',
      'MAX_RETRIES',
    )
    return { reply: 'سيتواصل معك أحد من فريقنا قريبًا 🙏' }
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Escalation
// ─────────────────────────────────────────────────────────────────────────────

async function escalate(
  ctx: HandlerContext,
  reason: string,
): Promise<HandlerResult> {
  console.log('[webhook-v2] escalation-triggered', {
    sessionId: ctx.session.id,
    from: ctx.from,
    state: ctx.session.currentState,
    reason,
  })

  await transitionSession(
    ctx.session.id,
    ctx.clinicId,
    'HUMAN_ESCALATION_PENDING',
    'USER_REQUESTED_ESCALATION',
    reason,
  )

  return { reply: 'سيتواصل معك أحد من فريقنا قريبًا 🙏\nشكراً على صبرك.' }
}

// ─────────────────────────────────────────────────────────────────────────────
// State Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IDLE | LANGUAGE_DETECTION | INTENT_DISAMBIGUATION
 * + Terminal states after resolveSession reset them to IDLE-equivalent.
 *
 * Detect intent → route to first booking step.
 */
async function handleEntryState(ctx: HandlerContext): Promise<HandlerResult> {
  const { interpretation, session, clinicId } = ctx
  const { intent, confidence } = interpretation

  // Low-confidence after retries → hand off to staff
  if (
    confidence === 'low' &&
    session.retryCount >= session.maxRetriesPerState - 1
  ) {
    await transitionSession(
      session.id,
      clinicId,
      'HUMAN_ESCALATION_PENDING',
      'MAX_RETRIES',
    )
    return {
      reply: 'آسف، ما قدرت أفهم طلبك 😔\nسيتواصل معك أحد من فريقنا قريبًا.',
    }
  }

  if (intent === 'new_booking') {
    const services = await prisma.service.findMany({
      where: { clinicId },
      select: { id: true, name: true },
    })

    if (services.length === 0) {
      await transitionSession(
        session.id,
        clinicId,
        'HUMAN_ESCALATION_PENDING',
        'NO_SERVICES_AVAILABLE',
      )
      return {
        reply: 'عذراً، لا توجد خدمات متاحة حالياً. سيتواصل معك فريقنا.',
      }
    }

    // Store service list in session so selection step can validate without a DB round-trip
    await prisma.conversationSession.update({
      where: { id: session.id },
      data: {
        ambiguousIntents: services as unknown as Prisma.InputJsonValue,
      },
    })

    await transitionSession(
      session.id,
      clinicId,
      'SLOT_COLLECTION_SERVICE',
      'INTENT_BOOKING',
    )

    const list = services.map((s, i) => `${i + 1}. ${s.name}`).join('\n')
    return { reply: `أهلاً! 😊 اختر الخدمة المطلوبة:\n\n${list}` }
  }

  if (intent === 'cancel') {
    await transitionSession(
      session.id,
      clinicId,
      'CANCELLATION_PENDING',
      'INTENT_CANCEL',
    )
    return {
      reply:
        'هل تريد إلغاء آخر حجز لديك؟\n\nاكتب *نعم* للتأكيد أو *لا* للرجوع.',
    }
  }

  // Unknown intent — increment and re-prompt
  await prisma.conversationSession.update({
    where: { id: session.id },
    data: { retryCount: { increment: 1 } },
  })

  return {
    reply:
      'أهلاً! 👋 كيف يمكنني مساعدتك؟\n\n' +
      'اكتب *احجز* لحجز موعد، أو *الغ* لإلغاء حجز.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * SLOT_COLLECTION_SERVICE
 * User is replying with their service selection from the displayed list.
 */
async function handleServiceSelection(
  ctx: HandlerContext,
): Promise<HandlerResult> {
  const { session, clinicId, body } = ctx

  const storedServices = session.ambiguousIntents as Array<{
    id: string
    name: string
  }> | null

  if (!storedServices || storedServices.length === 0) {
    console.error(
      '[webhook-v2] SLOT_COLLECTION_SERVICE: services missing from session',
      { sessionId: session.id },
    )
    await transitionSession(
      session.id,
      clinicId,
      'HUMAN_ESCALATION_PENDING',
      'CORRUPTED_STATE',
    )
    return { reply: 'حدث خطأ تقني. سيتواصل معك فريقنا.' }
  }

  const selection = parseSelection(body)

  if (
    selection === null ||
    selection < 1 ||
    selection > storedServices.length
  ) {
    const escalation = await checkRetryLimit(session, clinicId)
    if (escalation) return escalation

    const list = storedServices
      .map((s, i) => `${i + 1}. ${s.name}`)
      .join('\n')
    return { reply: `الرجاء اختيار رقم من القائمة:\n\n${list}` }
  }

  const selected = storedServices[selection - 1]!

  await prisma.conversationSession.update({
    where: { id: session.id },
    data: {
      slotServiceId: selected.id,
      retryCount: 0,
      ambiguousIntents: Prisma.JsonNull,
    },
  })

  await transitionSession(
    session.id,
    clinicId,
    'SLOT_COLLECTION_DATE',
    'SLOT_VALID',
  )

  return {
    reply:
      `ممتاز! اخترت: *${selected.name}* ✅\n\n` +
      'متى تفضل الموعد؟\n' +
      'مثال: بكره، هذا الأسبوع، صباح الثلاثاء، مساء',
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * SLOT_COLLECTION_DATE
 * Parse user's time preference → query real slots → store → show list.
 */
async function handleDateCollection(
  ctx: HandlerContext,
): Promise<HandlerResult> {
  const { session, clinicId, interpretation } = ctx

  if (!session.slotServiceId) {
    console.error(
      '[webhook-v2] SLOT_COLLECTION_DATE: slotServiceId missing',
      { sessionId: session.id },
    )
    await transitionSession(
      session.id,
      clinicId,
      'HUMAN_ESCALATION_PENDING',
      'CORRUPTED_STATE',
    )
    return { reply: 'حدث خطأ تقني. سيتواصل معك فريقنا.' }
  }

  const offsetDays = interpretation.preferredDateOffsetDays ?? 0
  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + offsetDays)
  targetDate.setHours(0, 0, 0, 0)

  const rangeEnd = new Date(targetDate)
  rangeEnd.setDate(rangeEnd.getDate() + 7)

  const hourRanges: Record<string, [number, number]> = {
    morning: [8, 12],
    afternoon: [12, 17],
    evening: [17, 22],
    after_isha: [20, 23],
  }
  const [hourStart, hourEnd] = interpretation.preferredPeriod
    ? (hourRanges[interpretation.preferredPeriod] ?? [0, 23])
    : [0, 23]


  const slots = await prisma.availableSlot.findMany({
    where: {
      clinicId,
      serviceId: session.slotServiceId,
      isBooked: false,
      OR: [{ isHeld: false }, { heldBySessionId: session.id }],
      startTime: { gte: targetDate, lte: rangeEnd },
    },
    select: { id: true, startTime: true },
    orderBy: { startTime: 'asc' },
    take: 20, // fetch more, filter in-memory
  })

  // Day-of-week filter
  let dayFiltered = slots
  if (interpretation.preferredDayOfWeek != null) {
    dayFiltered = dayFiltered.filter((s) => s.startTime.getDay() === interpretation.preferredDayOfWeek)
  }

  // Apply hour-of-day filter in-memory to avoid DB timezone arithmetic
  const filtered = dayFiltered.filter((s) => {
    const h = s.startTime.getHours()
    return h >= hourStart && h <= hourEnd
  })

  // Fall back to unfiltered if preference yields nothing
  const candidates = filtered.length > 0 ? filtered.slice(0, 5) : dayFiltered.slice(0, 5)

  if (candidates.length === 0) {
    const escalation = await checkRetryLimit(session, clinicId)
    if (escalation) return escalation

    return {
      reply:
        'عذراً، لا توجد مواعيد متاحة في هذا الوقت.\n' +
        'جرّب يوماً آخر أو وقتاً مختلفاً.',
    }
  }

  const slotData = candidates.map((s) => ({
    id: s.id,
    startTime: s.startTime.toISOString(),
  }))

  await prisma.conversationSession.update({
    where: { id: session.id },
    data: {
      slotDate: targetDate,
      retryCount: 0,
      ambiguousIntents: slotData as unknown as Prisma.InputJsonValue,
    },
  })

  await transitionSession(
    session.id,
    clinicId,
    'SLOT_COLLECTION_TIME',
    'SLOT_VALID',
  )

  const SLOT_NUMBERS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']
  const list = candidates
    .map((s, i) => {
      const label = new Date(s.startTime).toLocaleDateString('ar-SA', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      return `${SLOT_NUMBERS[i] ?? `${i + 1}.`} ${label}`
    })
    .join('\n')

  return {
    reply: `المواعيد المتاحة:\n\n${list}\n\nاختر رقم الموعد المناسب.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * SLOT_COLLECTION_TIME
 * User selects a slot from the numbered list shown in the previous message.
 */
async function handleTimeSelection(
  ctx: HandlerContext,
): Promise<HandlerResult> {
  const { session, clinicId, body } = ctx

  const storedSlots = session.ambiguousIntents as Array<{
    id: string
    startTime: string
  }> | null

  if (!storedSlots || storedSlots.length === 0) {
    console.error(
      '[webhook-v2] SLOT_COLLECTION_TIME: slots missing from session',
      { sessionId: session.id },
    )
    await transitionSession(
      session.id,
      clinicId,
      'HUMAN_ESCALATION_PENDING',
      'CORRUPTED_STATE',
    )
    return { reply: 'حدث خطأ تقني. سيتواصل معك فريقنا.' }
  }

  const selection = parseSelection(body)

  if (
    selection === null ||
    selection < 1 ||
    selection > storedSlots.length
  ) {
    const escalation = await checkRetryLimit(session, clinicId)
    if (escalation) return escalation

    const list = storedSlots
      .map((s, i) => {
        const label = new Date(s.startTime).toLocaleDateString('ar-SA', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
        return `${i + 1}. ${label}`
      })
      .join('\n')

    return { reply: `الرجاء اختيار رقم من المواعيد:\n\n${list}` }
  }

  const selected = storedSlots[selection - 1]!

  await prisma.conversationSession.update({
    where: { id: session.id },
    data: {
      slotTimeId: selected.id,
      retryCount: 0,
      ambiguousIntents: Prisma.JsonNull,
    },
  })

  await transitionSession(
    session.id,
    clinicId,
    'SLOT_COLLECTION_PATIENT_NAME',
    'SLOT_VALID',
  )

  return { reply: 'ممتاز! ✅ ما اسمك الكامل؟' }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * SLOT_COLLECTION_PATIENT_NAME
 */
async function handlePatientName(ctx: HandlerContext): Promise<HandlerResult> {
  const { session, clinicId, body } = ctx
  // Skip if already set
  if (ctx.session.slotPatientName) {
    await transitionSession(ctx.session.id, ctx.clinicId, 'SLOT_COLLECTION_PATIENT_DOB', 'SKIP_ALREADY_SET')
    return { reply: `تمام، سجلناك باسم ${ctx.session.slotPatientName} 👍\nما هو تاريخ ميلادك؟ (مثال: 1990/05/15)` }
  }

  // Original validation — must stay
  const name = body.trim()
  if (name.length < 3 || name.length > 100) {
    const escalation = await checkRetryLimit(session, clinicId)
    if (escalation) return escalation
    return {
      reply: 'الرجاء إدخال اسمك الكامل.\nمثال: محمد عبدالله العمري',
    }
  }

  await prisma.conversationSession.update({
    where: { id: session.id },
    data: { slotPatientName: name, retryCount: 0 },
  })

  await transitionSession(
    session.id,
    clinicId,
    'SLOT_COLLECTION_PATIENT_DOB',
    'SLOT_VALID',
  )

  return {
    reply: 'ما تاريخ ميلادك؟\nمثال: 15/03/1990 أو 1990-03-15',
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * SLOT_COLLECTION_PATIENT_DOB
 */
async function handlePatientDob(ctx: HandlerContext): Promise<HandlerResult> {
  const { session, clinicId, body } = ctx
  // Skip if already set
  if (ctx.session.slotPatientDob) {
    await transitionSession(ctx.session.id, ctx.clinicId, 'SLOT_COLLECTION_PHONE_CONFIRM', 'SKIP_ALREADY_SET')
    return { reply: `تمام 👍 ننتقل لتأكيد رقم جوالك.` }
  }

  // Original validation — must stay
  const parsed = parseDateInput(body)
  if (!parsed) {
    const escalation = await checkRetryLimit(session, clinicId)
    if (escalation) return escalation
    return {
      reply:
        'تأكد من صحة التاريخ وأعد المحاولة.\n' +
        'مثال: 15/03/1990 أو 1990-03-15',
    }
  }

  await prisma.conversationSession.update({
    where: { id: session.id },
    data: { slotPatientDob: parsed, retryCount: 0 },
  })

  await transitionSession(
    session.id,
    clinicId,
    'SLOT_COLLECTION_PHONE_CONFIRM',
    'SLOT_VALID',
  )

  // Show masked number for privacy
  const masked = `${ctx.from.slice(0, 5)}*****${ctx.from.slice(-2)}`
  return {
    reply:
      `هل رقم جوالك المسجل صحيح؟\n${masked}\n\n` +
      'اكتب *نعم* للتأكيد، أو أرسل رقمك الصحيح.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * SLOT_COLLECTION_PHONE_CONFIRM
 */
async function handlePhoneConfirm(
  ctx: HandlerContext,
): Promise<HandlerResult> {
  const { session, clinicId, body, from } = ctx
  if (ctx.session.slotPhoneConfirmed) {
    await transitionSession(ctx.session.id, ctx.clinicId, 'CONFIRMATION_PENDING', 'SKIP_ALREADY_SET')
    return { reply: `ممتاز 👍 جاهزين نأكد موعدك — اكتب "تأكيد" للمتابعة.` }
  }
  const trimmed = body.trim()

  let confirmedPhone: string
  const isAffirmative = (t: string) =>
    ['نعم', 'yes', 'اه', 'أه', 'ايه', 'آه', 'ok', 'okay', 'يس', 'نعم.'].includes(t.toLowerCase())

  if (isAffirmative(trimmed)) {
    confirmedPhone = from
  } else {
    const digits = trimmed.replace(/[\s\-\(\)]/g, '')
    if (!/^\+?\d{9,15}$/.test(digits)) {
      const escalation = await checkRetryLimit(session, clinicId)
      if (escalation) return escalation
      return {
        reply: 'اكتب *نعم* إذا كان الرقم صحيح، أو أرسل رقمك الصحيح.',
      }
    }
    confirmedPhone = digits
  }

  await prisma.conversationSession.update({
    where: { id: session.id },
    data: { slotPhoneConfirmed: confirmedPhone, retryCount: 0 },
  })

  // Fetch booking summary for the confirmation card
  const [service, slot] = await Promise.all([
    session.slotServiceId
      ? prisma.service.findUnique({
          where: { id: session.slotServiceId },
          select: { name: true },
        })
      : null,
    session.slotTimeId
      ? prisma.availableSlot.findUnique({
          where: { id: session.slotTimeId },
          select: { startTime: true },
        })
      : null,
  ])

  const slotLabel = slot?.startTime
    ? new Date(slot.startTime).toLocaleDateString('ar-SA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'غير محدد'

  await transitionSession(
    session.id,
    clinicId,
    'CONFIRMATION_PENDING',
    'CONFIRMED',
  )

  return {
    reply:
      '📋 *ملخص الحجز:*\n' +
      `• الخدمة: ${service?.name ?? 'غير محدد'}\n` +
      `• الموعد: ${slotLabel}\n` +
      `• الاسم: ${session.slotPatientName ?? 'غير محدد'}\n` +
      `• الجوال: ${confirmedPhone}\n\n` +
      'هل تريد تأكيد الحجز؟\n' +
      'اكتب *نعم* للتأكيد أو *لا* لتعديل البيانات.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * CONFIRMATION_PENDING
 * Final gate before writing the booking to the database.
 */
async function handleConfirmation(
  ctx: HandlerContext,
): Promise<HandlerResult> {
  const { session, clinicId, body } = ctx

  if (isNegative(body)) {
    // User wants to change something — restart from service selection
    const services = await prisma.service.findMany({
      where: { clinicId },
      select: { id: true, name: true },
    })

    await prisma.conversationSession.update({
      where: { id: session.id },
      data: {
        slotServiceId: null,
        slotDate: null,
        slotTimeId: null,
        slotPatientName: null,
        slotPatientDob: null,
        slotPhoneConfirmed: null,
        retryCount: 0,
        ambiguousIntents: services as unknown as Prisma.InputJsonValue,
      },
    })

    await transitionSession(session.id, clinicId, 'SLOT_COLLECTION_SERVICE', 'DENY')

    const list = services.map((s, i) => `${i + 1}. ${s.name}`).join('\n')
    return { reply: `حسناً، لنبدأ من جديد. اختر الخدمة:\n\n${list}` }
  }

  if (!isAffirmative(body)) {
    // Ambiguous — re-prompt without consuming a retry
    return { reply: 'اكتب *نعم* لتأكيد الحجز أو *لا* لتعديل البيانات.' }
  }

  // ── User confirmed — write to DB ─────────────────────
  await transitionSession(
    session.id,
    clinicId,
    'BOOKING_PROCESSING',
    'AFFIRM',
  )

  try {
    const appointment = await processBooking(session.id)

    await prisma.conversationSession.update({
      where: { id: session.id },
      data: { bookingId: appointment.id },
    })

    await transitionSession(
      session.id,
      clinicId,
      'BOOKING_CONFIRMED',
      'BOOKING_SUCCESS',
    )

    // Fetch slot time for the success message
    const slot = session.slotTimeId
      ? await prisma.availableSlot.findUnique({
          where: { id: session.slotTimeId },
          select: { startTime: true },
        })
      : null

    const slotLabel = slot?.startTime
      ? new Date(slot.startTime).toLocaleDateString('ar-SA', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'غير محدد'

    // Auto-reset session to IDLE after booking
    await new Promise(resolve => setTimeout(resolve, 2000))
    await transitionSession(session.id, clinicId, 'IDLE', 'SESSION_RESET_AFTER_BOOKING')
    return {
      reply:
        '✅ *تم الحجز بنجاح!*\n\n' +
        `موعدك: ${slotLabel}\n` +
        'سيصلك تذكير قبل الموعد.\n\n' +
        'شكراً لاختيارك عيادتنا! 🙏',
    }
  } catch (err) {
    if (err instanceof SlotConflictError) {
      // Slot was taken — try to find fresh slots for the same date
      console.warn('[webhook-v2] slot conflict — searching for alternatives', {
        sessionId: session.id,
        slotTimeId: session.slotTimeId,
      })

      await prisma.conversationSession.update({
        where: { id: session.id },
        data: { slotTimeId: null },
      })

      if (session.slotServiceId && session.slotDate) {
        const freshSlots = await prisma.availableSlot.findMany({
          where: {
            clinicId,
            serviceId: session.slotServiceId,
            isBooked: false,
            OR: [{ isHeld: false }, { heldBySessionId: session.id }],
            startTime: { gte: session.slotDate },
          },
          select: { id: true, startTime: true },
          orderBy: { startTime: 'asc' },
          take: 5,
        })

        if (freshSlots.length > 0) {
          const slotData = freshSlots.map((s) => ({
            id: s.id,
            startTime: s.startTime.toISOString(),
          }))

          await prisma.conversationSession.update({
            where: { id: session.id },
            data: {
              ambiguousIntents: slotData as unknown as Prisma.InputJsonValue,
            },
          })

          await transitionSession(
            session.id,
            clinicId,
            'SLOT_COLLECTION_TIME',
            'SLOT_CONFLICT',
          )

          const SLOT_NUMBERS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']
          const list = freshSlots
            .map((s, i) => {
              const label = new Date(s.startTime).toLocaleDateString('ar-SA', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
              return `${SLOT_NUMBERS[i] ?? `${i + 1}.`} ${label}`
            })
            .join('\n')

          return {
            reply:
              'عذراً، تم حجز الموعد السابق للتو.\n\n' +
              `المواعيد المتاحة الأخرى:\n\n${list}\n\n` +
              'اختر رقم الموعد المناسب.',
          }
        }
      }

      // No alternatives — go back to date collection
      await prisma.conversationSession.update({
        where: { id: session.id },
        data: { slotDate: null, ambiguousIntents: Prisma.JsonNull },
      })
      await transitionSession(
        session.id,
        clinicId,
        'SLOT_COLLECTION_DATE',
        'SLOT_CONFLICT',
      )
      return {
        reply:
          'عذراً، لا توجد مواعيد متاحة في هذا اليوم.\n' +
          'متى يناسبك؟',
      }
    }

    if (err instanceof BookingValidationError) {
      console.error('[webhook-v2] BookingValidationError', {
        sessionId: session.id,
        message: (err as Error).message,
      })
      await transitionSession(
        session.id,
        clinicId,
        'BOOKING_FAILED',
        'BOOKING_ERROR',
      )
      return {
        reply: 'حدث خطأ في بيانات الحجز. سيتواصل معك فريقنا لإتمام الحجز.',
      }
    }

    console.error('[webhook-v2] unexpected booking error', {
      sessionId: session.id,
      err,
    })
    await transitionSession(
      session.id,
      clinicId,
      'BOOKING_FAILED',
      'BOOKING_ERROR',
    )
    return { reply: 'حدث خطأ تقني. سيتواصل معك فريقنا قريبًا.' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * CANCELLATION_PENDING
 */
async function handleCancellationConfirm(
  ctx: HandlerContext,
): Promise<HandlerResult> {
  const { session, clinicId, body } = ctx

  if (isNegative(body)) {
    await transitionSession(session.id, clinicId, 'IDLE', 'DENY')
    return { reply: 'تم إلغاء طلب الإلغاء. كيف يمكنني مساعدتك؟' }
  }

  if (!isAffirmative(body)) {
    return { reply: 'اكتب *نعم* لتأكيد الإلغاء أو *لا* للرجوع.' }
  }

  const patient = await prisma.patient.findFirst({
    where: { clinicId, phone: session.phoneNumber },
    select: { id: true },
  })

  if (!patient) {
    await transitionSession(session.id, clinicId, 'IDLE', 'DENY')
    return { reply: 'لا يوجد لديك حجز نشط للإلغاء.' }
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      clinicId,
      patientId: patient.id,
      status: {
        in: ['scheduled', 'confirmed', 'confirmation_pending'],
      },
    },
    orderBy: { scheduledAt: 'asc' },
    select: { id: true },
  })

  if (!appointment) {
    await transitionSession(session.id, clinicId, 'IDLE', 'DENY')
    return { reply: 'لا يوجد لديك حجز نشط للإلغاء.' }
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'cancelled' },
  })

  await transitionSession(
    session.id,
    clinicId,
    'CANCELLATION_CONFIRMED',
    'AFFIRM',
  )

  // Auto-reset session to IDLE after cancellation
  await new Promise(resolve => setTimeout(resolve, 2000))
  await transitionSession(session.id, clinicId, 'IDLE', 'SESSION_RESET_AFTER_CANCELLATION')
  return {
    reply:
      'تم إلغاء حجزك بنجاح ✅\n' +
      'إذا احتجت أي شيء في المستقبل، نحن هنا.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dispatch — State-Driven
// ─────────────────────────────────────────────────────────────────────────────

async function dispatch(ctx: HandlerContext): Promise<HandlerResult> {
  // Global escalation check — runs before any state handler, from any state
  if (isEscalationRequest(ctx.body)) {
    return escalate(ctx, 'USER_REQUESTED')
  }

  const { currentState } = ctx.session

  switch (currentState) {
    // Entry states + terminal states (resolveSession already reset these to IDLE-equivalent)
    case 'IDLE':
    case 'LANGUAGE_DETECTION':
    case 'INTENT_DISAMBIGUATION':
    case 'BOOKING_CONFIRMED':
    case 'BOOKING_FAILED':
    case 'CANCELLATION_CONFIRMED':
    case 'EXPIRED':
    case 'CORRUPTED':
      return handleEntryState(ctx)

    case 'SLOT_COLLECTION_SERVICE':
      return handleServiceSelection(ctx)

    case 'SLOT_COLLECTION_DATE':
      return handleDateCollection(ctx)

    case 'SLOT_COLLECTION_TIME':
      return handleTimeSelection(ctx)

    case 'SLOT_COLLECTION_PATIENT_NAME':
      return handlePatientName(ctx)

    case 'SLOT_COLLECTION_PATIENT_DOB':
      return handlePatientDob(ctx)

    case 'SLOT_COLLECTION_PHONE_CONFIRM':
      return handlePhoneConfirm(ctx)

    case 'CONFIRMATION_PENDING':
      return handleConfirmation(ctx)

    case 'BOOKING_PROCESSING':
      // Transient state — booking is in flight, user should not send messages here
      console.warn('[webhook-v2] message received during BOOKING_PROCESSING', {
        sessionId: ctx.session.id,
        from: ctx.from,
      })
      return { reply: 'جاري معالجة حجزك، الرجاء الانتظار قليلاً...' }

    case 'CANCELLATION_PENDING':
      return handleCancellationConfirm(ctx)

    case 'HUMAN_ESCALATION_PENDING':
    case 'HUMAN_ESCALATION_ACTIVE':
      return {
        reply: 'محادثتك مع أحد من فريقنا — سيردون عليك قريبًا. 🙏',
      }

    default: {
      // TypeScript exhaustiveness check — surfaces unhandled states at compile time
      const _exhaustive: never = currentState
      console.error('[webhook-v2] unhandled FSM state', {
        state: _exhaustive,
        sessionId: ctx.session.id,
      })
      await transitionSession(
        ctx.session.id,
        ctx.clinicId,
        'HUMAN_ESCALATION_PENDING',
        'CORRUPTED_STATE',
      )
      return { reply: 'حدث خطأ غير متوقع. سيتواصل معك فريقنا.' }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Entry Point
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const bodyRaw = await req.text()

  // ── 1. Validate Twilio signature (enforced in production) ──────────────────
  if (process.env.NODE_ENV === 'production') {
    const signature = req.headers.get('x-twilio-signature') ?? ''
    const webhookUrl = process.env.TWILIO_WEBHOOK_V2_URL!
    const params = Object.fromEntries(new URLSearchParams(bodyRaw))
    const isValid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN!,
      signature,
      webhookUrl,
      params,
    )
    if (!isValid) {
      console.warn('[webhook-v2] rejected: invalid Twilio signature')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // ── 2. Parse Twilio payload ────────────────────────────────────────────────
  const params = Object.fromEntries(new URLSearchParams(bodyRaw))
  const from = (params['From'] ?? '').replace('whatsapp:', '').trim()
  const to = (params['To'] ?? '').replace('whatsapp:', '').trim()
  const body = (params['Body'] ?? '').trim()
  const messageSid = params['MessageSid'] ?? ''
  const originalRepliedSid = (params['OriginalRepliedMessageSid'] ?? '').trim()

  if (!from || !to || !body) {
    console.error('[webhook-v2] malformed Twilio payload', {
      hasFrom: Boolean(from),
      hasTo: Boolean(to),
      hasBody: Boolean(body),
    })
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }

  // ── 3. Resolve clinic from the inbound Twilio number ──────────────────────
  // NOTE: Clinic model must have a `whatsappNumber` field for this lookup.
  const clinic = await prisma.clinic.findFirst({
    where: { twilioPhoneNumber: to },
    select: { id: true, twilioPhoneNumber: true },
  })

  if (!clinic) {
    console.error('[webhook-v2] no clinic found for number', { to })
    return NextResponse.json({ error: 'Clinic not found' }, { status: 404 })
  }

  const clinicId = clinic.id
  const clinicNumber = clinic.twilioPhoneNumber!

  // ── 4. Resolve or reset session ───────────────────────────────────────────
  const session = await resolveSession(from, clinicId)

  // ── 5. Persist inbound message ────────────────────────────────────────────
  await persistMessage({
    sessionId: session.id,
    clinicId,
    role: 'patient',
    channel: 'whatsapp',
    content: body,
    twilioMessageSid: messageSid,
    currentState: session.currentState,
  })

  // ── 6. AI interpretation ──────────────────────────────────────────────────
  let interpretation: AiInterpretation
  try {
    const decision = await runAiInterpretationPipeline({
      bodyRaw: body,
      from,
      messageSid,
      originalRepliedSid,
    })
    // Always prefer finalInterpretation — it fuses rule-based + LLM results
    interpretation = decision.finalInterpretation
  } catch (pipelineErr) {
    // Non-fatal: log and fall back to 'unknown' so FSM can re-prompt gracefully
    console.error('[webhook-v2] AI pipeline failure — using safe fallback', {
      sessionId: session.id,
      from,
      error: pipelineErr,
    })
    interpretation = {
      intent: 'unknown',
      confidence: 'low',
      preferredDateOffsetDays: null,
      preferredWeekOffsetDays: 0,
      preferredDayOfWeek: null,
      preferredPeriod: null,
      doctorHint: null,
      canonicalText: body,
    }
  }

  console.log('[webhook-v2] inbound', {
    from,
    sessionId: session.id,
    state: session.currentState,
    intent: interpretation.intent,
    confidence: interpretation.confidence,
  })

  // Prefill session fields from extractedFields (Phase 1, hardened)
  // Insert after interpretation is set, before HandlerContext is built
  try {
    const ef = (interpretation as any).extractedFields;
    const updates: Record<string, any> = {};
    let didUpdate = false;

    // patientName
    if (
      !session.slotPatientName &&
      ef?.patientName &&
      typeof ef.patientName === 'string'
    ) {
      const trimmedName = ef.patientName.trim();
      if (trimmedName.length >= 3 && trimmedName.length <= 100) {
        updates.slotPatientName = trimmedName;
        didUpdate = true;
      }
    }

    // patientDob
    if (
      !session.slotPatientDob &&
      ef?.patientDob &&
      typeof ef.patientDob === 'string'
    ) {
      const parsedDob = parseDateInput(ef.patientDob);
      if (parsedDob) {
        updates.slotPatientDob = parsedDob;
        didUpdate = true;
      }
    }

    // phone
    if (
      !session.slotPhoneConfirmed &&
      ef?.phone &&
      typeof ef.phone === 'string'
    ) {
      const normalizedPhone = ef.phone.replace(/[\s\-\(\)]/g, '');
      if (/^\+?\d{9,15}$/.test(normalizedPhone)) {
        updates.slotPhoneConfirmed = normalizedPhone;
        didUpdate = true;
      }
    }

    if (didUpdate) {
      await prisma.conversationSession.update({
        where: { id: session.id },
        data: updates,
      });
      if (updates.slotPatientName) {
        session.slotPatientName = updates.slotPatientName;
        console.log('[prefill] slotPatientName set');
      }
      if (updates.slotPatientDob) {
        session.slotPatientDob = updates.slotPatientDob;
        console.log('[prefill] slotPatientDob set');
      }
      if (updates.slotPhoneConfirmed) {
        session.slotPhoneConfirmed = updates.slotPhoneConfirmed;
        console.log('[prefill] slotPhoneConfirmed set');
      }
    }
  } catch (prefillErr) {
    console.error('[prefill] error during extractedFields prefill', prefillErr);
  }

  // ── 7. Dispatch to the correct state handler ──────────────────────────────
  const ctx: HandlerContext = {
    session,
    clinicId,
    from,
    clinicNumber,
    body,
    messageSid,
    interpretation,
  }

  let result: HandlerResult
  try {
    result = await dispatch(ctx)
  } catch (dispatchErr) {
    console.error('[webhook-v2] unhandled dispatch error', {
      sessionId: session.id,
      from,
      error: dispatchErr,
    })
    result = { reply: 'حدث خطأ تقني. سيتواصل معك فريقنا قريبًا.' }
    try {
      await transitionSession(
        session.id,
        clinicId,
        'HUMAN_ESCALATION_PENDING',
        'SYSTEM_ERROR',
      )
    } catch (escalateErr) {
      console.error('[webhook-v2] escalation after dispatch failure also failed', {
        sessionId: session.id,
        escalateErr,
      })
    }
  }

  // ── 8. Deliver WhatsApp reply ─────────────────────────────────────────────
  let outboundSid: string
  try {
    outboundSid = await sendWhatsAppReply(from, clinicNumber, result.reply)
  } catch (sendErr) {
    console.error('[webhook-v2] WhatsApp delivery failed', {
      sessionId: session.id,
      from,
      error: sendErr,
    })
    // Return 500 so Twilio retries the webhook
    return NextResponse.json({ error: 'Message delivery failed' }, { status: 500 })
  }

  // ── 9. Persist outbound message (with post-dispatch state) ────────────────
  const updatedSession = await prisma.conversationSession.findUnique({
    where: { id: session.id },
    select: { currentState: true },
  })

  await persistMessage({
    sessionId: session.id,
    clinicId,
    role: 'assistant',
    channel: 'whatsapp',
    content: result.reply,
    twilioMessageSid: outboundSid,
    currentState: updatedSession?.currentState ?? session.currentState,
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}
