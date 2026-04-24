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
import {
  holdAvailableSlot,
  SlotAlreadyBookedError,
  SlotHeldByAnotherSessionError,
  SlotNotFoundError,
} from '@/lib/booking/slot-hold'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/lib/prisma-client/client'
import { resolveSession, transitionSession, persistMessage } from '@/lib/whatsapp/session'
import {
  runAiInterpretationPipeline,
  type AiInterpretation,
} from '@/lib/whatsapp/ai-interpretation-pipeline'
import {
  processBooking,
  SlotConflictError,
  BookingValidationError,
} from '@/lib/whatsapp/booking-handler'
import twilio from 'twilio'
import { sendWhatsAppReply } from '@/lib/whatsapp/twilio-sender'
import {
  parseSelection,
  isAffirmative,
  isNegative,
  isEscalationRequest,
  parseDateInput,
} from '@/lib/whatsapp/input-parsers'
import { saveLead } from '@/lib/whatsapp/lead-handler'
import { generateReply } from '@/lib/whatsapp/response-generator'
import { handleInquiryInterrupt } from '@/lib/inquiry-interrupt'

// Slot TTL: how long a presented slot list remains valid before re-checking.
// Override with SLOT_TTL_MS env var. Default: 10 minutes.
const SLOT_TTL_MS = Number(process.env.SLOT_TTL_MS) || 10 * 60 * 1000

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Session = Awaited<ReturnType<typeof resolveSession>>

type HandlerContext = {
  session: Session
  clinicId: string
  from: string
  clinicNumber: string
  body: string
  messageSid: string
  interpretation: AiInterpretation
}

type HandlerResult = {
  reply: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Retry Logic
// ─────────────────────────────────────────────────────────────────────────────

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
    await saveLead(session, 'vague_repeated')
    return { reply: 'بيتواصل معك أحد من فريقنا قريبًا.' }
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

  await prisma.conversationSession.update({
    where: { id: ctx.session.id },
    data: { handoffActive: true },
  })

  await saveLead(ctx.session, 'other')

  return { reply: 'بيتواصل معك أحد من فريقنا.\nشكراً على الانتظار.' }
}

// ─────────────────────────────────────────────────────────────────────────────
// State Handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleEntryState(ctx: HandlerContext): Promise<HandlerResult> {
  const { interpretation, session, clinicId } = ctx
  const { intent, confidence } = interpretation

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
      reply: 'بيتواصل معك أحد من فريقنا قريبًا.',
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
        reply: 'عذراً، لا توجد خدمات متاحة حالياً. بيتواصل معك فريقنا.',
      }
    }

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

    return {
      reply: await generateReply({
        action: 'ask_for_service',
        context: {
          customText: list,
        },
      }),
    }
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

  await prisma.conversationSession.update({
    where: { id: session.id },
    data: { retryCount: { increment: 1 } },
  })

  return {
    reply: 'كيف أقدر أساعدك؟',
  }
}

// ─────────────────────────────────────────────────────────────────────────────

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
    return { reply: 'حدث خطأ تقني. بيتواصل معك فريقنا.' }
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
    return { reply: `هذه الخدمات المتاحة:\n\n${list}\n\nاختر رقم الخدمة.` }
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
    reply: await generateReply({
      action: 'ask_for_date',
      context: {
        serviceName: selected.name,
      },
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────

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
    return { reply: 'حدث خطأ تقني. بيتواصل معك فريقنا.' }
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
    take: 20,
  })

  let dayFiltered = slots
  if (interpretation.preferredDayOfWeek != null) {
    dayFiltered = dayFiltered.filter(
      (s) => s.startTime.getDay() === interpretation.preferredDayOfWeek,
    )
  }

  const filtered = dayFiltered.filter((s) => {
    const h = s.startTime.getHours()
    return h >= hourStart && h <= hourEnd
  })

  const candidates = filtered.length > 0 ? filtered.slice(0, 5) : dayFiltered.slice(0, 5)

  if (candidates.length === 0) {
    const escalation = await checkRetryLimit(session, clinicId)
    if (escalation) return escalation

    return {
      reply: 'للأسف ما فيه مواعيد متاحة.\n\nاختر وقت آخر.',
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
      slotOfferedAt: new Date(),
      ambiguousIntents: slotData as unknown as Prisma.InputJsonValue,
    },
  })

  await transitionSession(
    session.id,
    clinicId,
    'SLOT_COLLECTION_TIME',
    'SLOT_VALID',
  )

  const list = candidates
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

  return {
    reply: await generateReply({
      action: 'show_slots',
      context: {
        slotsText: list,
      },
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────

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
    return { reply: 'حدث خطأ تقني. بيتواصل معك فريقنا.' }
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

    return { reply: `هذه المواعيد المتاحة:\n\n${list}\n\nاختر رقم الموعد.` }
  }

  const selected = storedSlots[selection - 1]!

  try {
    await prisma.$transaction(async (tx) => {
      await holdAvailableSlot(tx, {
        slotId: selected.id,
        sessionId: session.id,
      })

      await tx.conversationSession.update({
        where: { id: session.id },
        data: {
          slotTimeId: selected.id,
          retryCount: 0,
          ambiguousIntents: Prisma.JsonNull,
        },
      })
    })
  } catch (holdErr) {
    const isExpectedConflict =
      holdErr instanceof SlotAlreadyBookedError ||
      holdErr instanceof SlotHeldByAnotherSessionError ||
      holdErr instanceof SlotNotFoundError

    console.error('[SLOT HOLD ERROR]', {
      sessionId: session.id,
      slotId: selected.id,
      errorName: (holdErr as Error).name,
      message: (holdErr as Error).message,
      expected: isExpectedConflict,
    })

    // Query fresh slots — do NOT reuse stale storedSlots (that's what caused the infinite loop)
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
            slotOfferedAt: new Date(),
            ambiguousIntents: slotData as unknown as Prisma.InputJsonValue,
          },
        })

        const list = freshSlots
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

        return {
          reply: `هذه المواعيد المتاحة:\n\n${list}\n\nاختر رقم الموعد.`,
        }
      }
    }

    // No fresh slots at all — fall back to date collection
    await prisma.conversationSession.update({
      where: { id: session.id },
      data: { slotDate: null, ambiguousIntents: Prisma.JsonNull },
    })

    await transitionSession(session.id, clinicId, 'SLOT_COLLECTION_DATE', 'SLOT_CONFLICT')

    return {
      reply: 'للأسف ما فيه مواعيد متاحة.\n\nاختر وقت آخر.',
    }
  }

  await transitionSession(
    session.id,
    clinicId,
    'SLOT_COLLECTION_PATIENT_NAME',
    'SLOT_VALID',
  )

  return { reply: 'ممكن اسمك الكامل.' }
}

// ─────────────────────────────────────────────────────────────────────────────

async function handlePatientName(ctx: HandlerContext): Promise<HandlerResult> {
  const { session, clinicId, body } = ctx

  if (ctx.session.slotPatientName) {
    await transitionSession(
      ctx.session.id,
      ctx.clinicId,
      'SLOT_COLLECTION_PATIENT_DOB',
      'SKIP_ALREADY_SET',
    )
    return { reply: 'اكتب تاريخ ميلادك.\n\nمثال:\n1990-05-15' }
  }

  const name = body.trim()
  if (name.length < 3 || name.length > 100) {
    const escalation = await checkRetryLimit(session, clinicId)
    if (escalation) return escalation
    return { reply: 'المدخل غير واضح. حاول مرة ثانية.' }
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

  return { reply: 'اكتب تاريخ ميلادك.\n\nمثال:\n1990-05-15' }
}

// ─────────────────────────────────────────────────────────────────────────────

async function handlePatientDob(ctx: HandlerContext): Promise<HandlerResult> {
  const { session, clinicId, body } = ctx

  if (ctx.session.slotPatientDob) {
    await transitionSession(
      ctx.session.id,
      ctx.clinicId,
      'SLOT_COLLECTION_PHONE_CONFIRM',
      'SKIP_ALREADY_SET',
    )
    const maskedSkip = `${ctx.from.slice(0, 5)}*****${ctx.from.slice(-2)}`
    return { reply: `هذا رقمك؟\n\n${maskedSkip}\n\nاكتب نعم أو أرسل الرقم الصحيح.` }
  }

  const parsed = parseDateInput(body)
  if (!parsed) {
    const escalation = await checkRetryLimit(session, clinicId)
    if (escalation) return escalation
    return { reply: 'المدخل غير واضح. حاول مرة ثانية.' }
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

  const masked = `${ctx.from.slice(0, 5)}*****${ctx.from.slice(-2)}`
  return {
    reply: `هذا رقمك؟\n\n${masked}\n\nاكتب نعم أو أرسل الرقم الصحيح.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function handlePhoneConfirm(
  ctx: HandlerContext,
): Promise<HandlerResult> {
  const { session, clinicId, body, from } = ctx
  const trimmed = body.trim()

  if (ctx.session.slotPhoneConfirmed) {
    await transitionSession(
      ctx.session.id,
      ctx.clinicId,
      'CONFIRMATION_PENDING',
      'SKIP_ALREADY_SET',
    )
    return { reply: 'اكتب نعم للتأكيد أو لا للتعديل.' }
  }

  const affirmativeValues = [
    'يب',
    'ايهه',
    'اييه',
    'نعم',
    'yes',
    'اه',
    'أيه',
    'ايه',
    'اي',
    'ok',
    'اايه',
    'يس',
    'نعم.',
  ]

  let confirmedPhone: string

  if (affirmativeValues.includes(trimmed.toLowerCase())) {
    confirmedPhone = from
  } else {
    const digits = trimmed.replace(/[\s\-\(\)]/g, '')
    if (!/^\+?\d{9,15}$/.test(digits)) {
      const escalation = await checkRetryLimit(session, clinicId)
      if (escalation) return escalation
      return { reply: 'المدخل غير واضح. حاول مرة ثانية.' }
    }
    confirmedPhone = digits
  }

  await prisma.conversationSession.update({
    where: { id: session.id },
    data: { slotPhoneConfirmed: confirmedPhone, retryCount: 0 },
  })

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
    reply: await generateReply({
      action: 'confirm_details',
      context: {
        summaryText:
          `الخدمة: ${service?.name ?? 'غير محدد'}\n` +
          `الموعد: ${slotLabel}\n` +
          `الاسم: ${session.slotPatientName ?? 'غير محدد'}\n` +
          `الجوال: ${confirmedPhone}`,
      },
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function handleConfirmation(
  ctx: HandlerContext,
): Promise<HandlerResult> {
  const { session, clinicId, body } = ctx

  if (isNegative(body)) {
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
    return { reply: `هذه الخدمات المتاحة:\n\n${list}\n\nاختر رقم الخدمة.` }
  }

  if (!isAffirmative(body)) {
    return { reply: 'المدخل غير واضح. حاول مرة ثانية.' }
  }

  if (session.slotOfferedAt) {
    const elapsed = Date.now() - new Date(session.slotOfferedAt).getTime()
    if (elapsed > SLOT_TTL_MS) {
      await prisma.conversationSession.update({
        where: { id: session.id },
        data: { slotTimeId: null, slotOfferedAt: null },
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
              slotOfferedAt: new Date(),
              ambiguousIntents: slotData as unknown as Prisma.InputJsonValue,
            },
          })

          await transitionSession(session.id, clinicId, 'SLOT_COLLECTION_TIME', 'SLOT_TTL_EXPIRED')

          const list = freshSlots
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

          return {
            reply: `هذه المواعيد المتاحة:\n\n${list}\n\nاختر رقم الموعد.`,
          }
        }
      }

      await prisma.conversationSession.update({
        where: { id: session.id },
        data: { slotDate: null, ambiguousIntents: Prisma.JsonNull },
      })

      await transitionSession(session.id, clinicId, 'SLOT_COLLECTION_DATE', 'SLOT_TTL_EXPIRED')

      return { reply: 'متى يناسبك الموعد؟' }
    }
  }

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

    const [slot, service] = await Promise.all([
      session.slotTimeId
        ? prisma.availableSlot.findUnique({
            where: { id: session.slotTimeId },
            select: { startTime: true },
          })
        : null,
      session.slotServiceId
        ? prisma.service.findUnique({
            where: { id: session.slotServiceId },
            select: { name: true },
          })
        : null,
    ])

    const startTime = slot?.startTime ?? null

    const dateLabel = startTime
      ? new Date(startTime).toLocaleDateString('ar-SA', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'غير محدد'

    const timeLabel = startTime
      ? new Date(startTime).toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''

    const msUntil = startTime ? startTime.getTime() - Date.now() : Infinity
    const closing =
      msUntil > 0 && msUntil <= 24 * 60 * 60 * 1000
        ? 'ننتظرك في الموعد.'
        : 'سيصلك تذكير قبل الموعد.'

    await new Promise((resolve) => setTimeout(resolve, 2000))
    await transitionSession(session.id, clinicId, 'IDLE', 'SESSION_RESET_AFTER_BOOKING')

    return {
      reply:
        `تم تأكيد الحجز.\n\n` +
        `الخدمة: ${service?.name ?? '—'}\n` +
        `الموعد: ${dateLabel}${timeLabel ? ` – ${timeLabel}` : ''}\n\n` +
        closing,
    }
  } catch (err) {
    if (err instanceof SlotConflictError) {
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
              slotOfferedAt: new Date(),
              ambiguousIntents: slotData as unknown as Prisma.InputJsonValue,
            },
          })

          await transitionSession(
            session.id,
            clinicId,
            'SLOT_COLLECTION_TIME',
            'SLOT_CONFLICT',
          )

          const list = freshSlots
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

          return {
            reply: `هذه المواعيد المتاحة:\n\n${list}\n\nاختر رقم الموعد.`,
          }
        }
      }

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

      return { reply: 'للأسف ما فيه مواعيد متاحة.\n\nاختر وقت آخر.' }
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

      return { reply: 'المدخل غير واضح. حاول مرة ثانية.' }
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

    return { reply: 'المدخل غير واضح. حاول مرة ثانية.' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function handleCancellationConfirm(
  ctx: HandlerContext,
): Promise<HandlerResult> {
  const { session, clinicId, body } = ctx

  if (isNegative(body)) {
    await transitionSession(session.id, clinicId, 'IDLE', 'DENY')
    return { reply: 'تم إلغاء طلب الإلغاء. كيف ممكن أساعدك' }
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
    return { reply: 'ما عندك حجز نشط للإلغاء.' }
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
    return { reply: 'ما عندك حجز نشط للإلغاء.' }
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

  await new Promise((resolve) => setTimeout(resolve, 2000))
  await transitionSession(session.id, clinicId, 'IDLE', 'SESSION_RESET_AFTER_CANCELLATION')

  return {
    reply:
      'تم إلغاء حجزك.\n' +
      'إذا احتجت أي شيء، حنا هنا.',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Override — pre-routing correction for mid-booking date change
// ─────────────────────────────────────────────────────────────────────────────

const DATE_OVERRIDE_STATES = new Set([
  'SLOT_COLLECTION_TIME',
  'SLOT_COLLECTION_PATIENT_NAME',
  'SLOT_COLLECTION_PATIENT_DOB',
  'SLOT_COLLECTION_PHONE_CONFIRM',
  'CONFIRMATION_PENDING',
])

async function handleDateOverride(ctx: HandlerContext): Promise<HandlerResult> {
  const { session, clinicId, interpretation } = ctx

  const offsetDays = interpretation.preferredDateOffsetDays ?? 0
  const now = new Date()
  const targetDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + offsetDays,
  ))

  if (interpretation.preferredDayOfWeek !== null) {
    const diff = (interpretation.preferredDayOfWeek - targetDate.getUTCDay() + 7) % 7
    targetDate.setUTCDate(targetDate.getUTCDate() + (diff === 0 ? 7 : diff))
  }

  const dayEnd = new Date(Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate() + 1,
  ))

  const slots = await prisma.availableSlot.findMany({
    where: {
      clinicId,
      serviceId: session.slotServiceId!,
      isBooked: false,
      OR: [{ isHeld: false }, { heldBySessionId: session.id }],
      startTime: { gte: targetDate, lt: dayEnd },
    },
    select: { id: true, startTime: true },
    orderBy: { startTime: 'asc' },
    take: 5,
  })

  if (!slots.length) {
    return { reply: 'للأسف ما فيه مواعيد متاحة في هذا اليوم.' }
  }

  const slotData = slots.map((s) => ({
    id: s.id,
    startTime: s.startTime.toISOString(),
  }))

  await prisma.$transaction(async (tx) => {
    if (session.slotTimeId) {
      await tx.availableSlot.updateMany({
        where: {
          id: session.slotTimeId,
          heldBySessionId: session.id,
          isHeld: true,
          isBooked: false,
        },
        data: { isHeld: false, heldBySessionId: null, heldAt: null },
      })
    }

    await tx.conversationSession.update({
      where: { id: session.id },
      data: {
        slotDate: targetDate,
        slotTimeId: null,
        slotOfferedAt: new Date(),
        ambiguousIntents: slotData as unknown as Prisma.InputJsonValue,
      },
    })
  })

  await transitionSession(session.id, clinicId, 'SLOT_COLLECTION_TIME', 'DATE_OVERRIDE')

  const list = slots
    .map((s, i) => {
      const label = new Date(s.startTime).toLocaleString('ar-SA', {
        weekday: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      return `${i + 1}. ${label}`
    })
    .join('\n')

  return {
    reply: `تمام، هذه مواعيد اليوم الجديد:\n\n${list}\n\nاختر رقم الموعد.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dispatch — State-Driven
// ─────────────────────────────────────────────────────────────────────────────

const BOOKING_SLOT_STATES = new Set([
  'SLOT_COLLECTION_SERVICE',
  'SLOT_COLLECTION_DATE',
  'SLOT_COLLECTION_TIME',
  'SLOT_COLLECTION_PATIENT_NAME',
  'SLOT_COLLECTION_PATIENT_DOB',
  'SLOT_COLLECTION_PHONE_CONFIRM',
  'CONFIRMATION_PENDING',
])

async function dispatch(ctx: HandlerContext): Promise<HandlerResult> {
  if (isEscalationRequest(ctx.body)) {
    return escalate(ctx, 'USER_REQUESTED')
  }

  const { currentState } = ctx.session

  if (ctx.interpretation.intent === 'cancel' && BOOKING_SLOT_STATES.has(currentState)) {
    await transitionSession(ctx.session.id, ctx.clinicId, 'CANCELLATION_PENDING', 'INTENT_CANCEL')
    return {
      reply: 'هل تريد إلغاء آخر حجز لديك؟\n\nاكتب *نعم* للتأكيد أو *لا* للرجوع.',
    }
  }

  if (
    DATE_OVERRIDE_STATES.has(currentState) &&
    (ctx.interpretation.preferredDateOffsetDays !== null ||
      ctx.interpretation.preferredDayOfWeek !== null) &&
    ctx.session.slotServiceId
  ) {
    return handleDateOverride(ctx)
  }

  switch (currentState) {
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
        reply: 'بيتواصلون معك قريبًا.',
      }

    default: {
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

      return { reply: 'حدث خطأ غير متوقع. بيتواصل معك فريقنا.' }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Entry Point
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const bodyRaw = await req.text()

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

  const session = await resolveSession(from, clinicId)

  if (messageSid) {
    const existingInbound = await prisma.conversationMessage.findFirst({
      where: {
        sessionId: session.id,
        role: 'patient',
        twilioMessageSid: messageSid,
      },
      select: { id: true },
    })

    if (existingInbound) {
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 })
    }
  }

  await persistMessage({
    sessionId: session.id,
    clinicId,
    role: 'patient',
    channel: 'whatsapp',
    content: body,
    twilioMessageSid: messageSid,
    currentState: session.currentState,
  })

  let interpretation: AiInterpretation
  try {
    const decision = await runAiInterpretationPipeline({
      bodyRaw: body,
      from,
      messageSid,
      originalRepliedSid,
    })
    interpretation = decision.finalInterpretation
  } catch (pipelineErr) {
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

  // ── 6.5. Recover from stuck handoff for explicit booking intents ───────────
  if (
    session.handoffActive &&
    interpretation.intent === 'new_booking'
  ) {
    await prisma.conversationSession.update({
      where: { id: session.id },
      data: {
        handoffActive: false,
        currentState: 'IDLE',
        retryCount: 0,
      },
    })

    session.handoffActive = false
    session.currentState = 'IDLE'
    session.retryCount = 0

    console.log('[webhook-v2] recovered session from handoff lock for booking', {
      sessionId: session.id,
      from,
    })
  }

  // If still in handoff after interpretation and not a booking recovery, hold silently
  if (session.handoffActive) {
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  try {
    const ef = (interpretation as any).extractedFields
    const updates: Record<string, any> = {}
    let didUpdate = false

    if (
      !session.slotPatientName &&
      ef?.patientName &&
      typeof ef.patientName === 'string'
    ) {
      const trimmedName = ef.patientName.trim()
      if (trimmedName.length >= 3 && trimmedName.length <= 100) {
        updates.slotPatientName = trimmedName
        didUpdate = true
      }
    }

    if (
      !session.slotPatientDob &&
      ef?.patientDob &&
      typeof ef.patientDob === 'string'
    ) {
      const parsedDob = parseDateInput(ef.patientDob)
      if (parsedDob) {
        updates.slotPatientDob = parsedDob
        didUpdate = true
      }
    }

    if (
      !session.slotPhoneConfirmed &&
      ef?.phone &&
      typeof ef.phone === 'string'
    ) {
      const normalizedPhone = ef.phone.replace(/[\s\-\(\)]/g, '')
      if (/^\+?\d{9,15}$/.test(normalizedPhone)) {
        updates.slotPhoneConfirmed = normalizedPhone
        didUpdate = true
      }
    }

    if (didUpdate) {
      await prisma.conversationSession.update({
        where: { id: session.id },
        data: updates,
      })

      if (updates.slotPatientName) session.slotPatientName = updates.slotPatientName
      if (updates.slotPatientDob) session.slotPatientDob = updates.slotPatientDob
      if (updates.slotPhoneConfirmed) session.slotPhoneConfirmed = updates.slotPhoneConfirmed
    }
  } catch (prefillErr) {
    console.error('[prefill] error during extractedFields prefill', prefillErr)
  }

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
    let inquiryIntent: 'inquiry_price' | 'inquiry_doctor' | null = null

    if (
      interpretation.intent === 'inquiry_price' ||
      body.includes('بكم') ||
      body.includes('كم السعر')
    ) {
      inquiryIntent = 'inquiry_price'
    } else if (
      interpretation.intent === 'inquiry_doctor' ||
      body.includes('أي دكتور') ||
      body.includes('مين الدكتور')
    ) {
      inquiryIntent = 'inquiry_doctor'
    }

    if (inquiryIntent) {
      result = await handleInquiryInterrupt(session, inquiryIntent)
    } else {
      result = await dispatch(ctx)
    }
  } catch (dispatchErr) {
    console.error('[webhook-v2] unhandled dispatch error', {
      sessionId: session.id,
      from,
      error: dispatchErr,
    })

    result = { reply: 'حدث خطأ تقني. بيتواصل معك فريقنا قريبًا.' }

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

  let outboundSid: string
  try {
    outboundSid = await sendWhatsAppReply(from, clinicNumber, result.reply)
  } catch (sendErr) {
    console.error('[webhook-v2] WhatsApp delivery failed', {
      sessionId: session.id,
      from,
      error: sendErr,
    })
    return NextResponse.json({ error: 'Message delivery failed' }, { status: 500 })
  }

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