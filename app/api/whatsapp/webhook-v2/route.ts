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
import { regenerateAppointmentReminderJobs } from '@/lib/notifications/reminder-jobs'
import twilio from 'twilio'
import { sendWhatsAppReply } from '@/lib/whatsapp/twilio-sender'
import {
  parseSelection,
  isAffirmative,
  isNegative,
  isEscalationRequest,
  parseDateInput,
  parseDeterministicArabicDate,
  normalizeArabicInput,
} from '@/lib/whatsapp/input-parsers'
import { saveLead } from '@/lib/whatsapp/lead-handler'
import { syncUpdateEventForAppointment } from '@/lib/google/sync'
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
    const { from } = ctx
    const guardPatient = await prisma.patient.findFirst({
      where: { clinicId, phone: from },
      select: { id: true },
    })

    if (guardPatient) {
      const activeAppts = await prisma.appointment.findMany({
        where: {
          clinicId,
          patientId: guardPatient.id,
          status: { in: ['scheduled', 'confirmed', 'confirmation_pending'] },
          scheduledAt: { gt: new Date() },
        },
        orderBy: { scheduledAt: 'asc' },
        select: {
          id: true,
          serviceId: true,
          scheduledAt: true,
          service: { select: { name: true } },
        },
        take: 5,
      })

      if (activeAppts.length > 0) {
        const candidates = activeAppts.map((a) => ({
          id: a.id,
          serviceId: a.serviceId,
          serviceName: a.service.name,
          scheduledAt: a.scheduledAt.toISOString(),
        }))

        await prisma.conversationSession.update({
          where: { id: session.id },
          data: {
            ambiguousIntents: { type: 'booking_intent_clarification', candidates } as unknown as Prisma.InputJsonValue,
            retryCount: 0,
          },
        })

        await transitionSession(session.id, clinicId, 'INTENT_DISAMBIGUATION', 'INTENT_BOOKING_GUARD')

        if (activeAppts.length === 1) {
          const a = activeAppts[0]!
          const date = new Date(a.scheduledAt).toLocaleDateString('ar-SA', {
            weekday: 'long', month: 'short', day: 'numeric',
          })
          const time = new Date(a.scheduledAt).toLocaleTimeString('ar-SA', {
            hour: '2-digit', minute: '2-digit',
          })
          return {
            reply:
              `عندك موعد قائم:\n\n${a.service.name} — ${date}، ${time}\n\n` +
              `هل تبغى:\n1. تعديل الموعد الحالي\n2. حجز موعد إضافي`,
          }
        } else {
          return {
            reply:
              `عندك أكثر من موعد قائم.\n\nهل تبغى:\n1. تعديل موعد قائم\n2. حجز موعد إضافي`,
          }
        }
      }
    }

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

async function handleBookingIntentClarification(
  ctx: HandlerContext,
): Promise<HandlerResult> {
  const { session, clinicId, body } = ctx

  const stored = session.ambiguousIntents as {
    type: string
    candidates: Array<{ id: string; serviceId: string; serviceName: string; scheduledAt: string }>
  } | null

  if (!stored || stored.type !== 'booking_intent_clarification') {
    return handleEntryState(ctx)
  }

  const selection = parseSelection(body)

  if (selection === 1) {
    return handleRescheduleIntercept(ctx)
  }

  if (selection === 2) {
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
      return { reply: 'عذراً، لا توجد خدمات متاحة حالياً. بيتواصل معك فريقنا.' }
    }

    await prisma.conversationSession.update({
      where: { id: session.id },
      data: { ambiguousIntents: services as unknown as Prisma.InputJsonValue },
    })

    await transitionSession(session.id, clinicId, 'SLOT_COLLECTION_SERVICE', 'INTENT_BOOKING')

    const list = services.map((s, i) => `${i + 1}. ${s.name}`).join('\n')

    return {
      reply: await generateReply({
        action: 'ask_for_service',
        context: { customText: list },
      }),
    }
  }

  return { reply: 'اختر 1 لتعديل موعد قائم أو 2 لحجز موعد إضافي.' }
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

  // Guard: session already confirmed — return idempotent response without re-processing.
  if (session.bookingId) {
    return { reply: 'تم تأكيد حجزك مسبقاً.' }
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
    select: { id: true, serviceId: true, scheduledAt: true },
  })

  if (!appointment) {
    await transitionSession(session.id, clinicId, 'IDLE', 'DENY')
    return { reply: 'ما عندك حجز نشط للإلغاء.' }
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: 'cancelled' },
    })

    await tx.availableSlot.updateMany({
      where: {
        clinicId,
        serviceId: appointment.serviceId,
        startTime: appointment.scheduledAt,
        isBooked: true,
      },
      data: { isBooked: false, isHeld: false, heldBySessionId: null, heldAt: null },
    })

    await tx.reminder.updateMany({
      where: { appointmentId: appointment.id, status: 'pending' },
      data: { status: 'cancelled' },
    })

    await tx.notificationJob.updateMany({
      where: { appointmentId: appointment.id, status: { in: ['pending', 'queued'] } },
      data: { status: 'failed' },
    })
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
// Reschedule — Date Resolution (local, reschedule-only)
// ─────────────────────────────────────────────────────────────────────────────

function resolveRescheduleTargetDate(input: string): Date | null {
  // 1. Reuse shared deterministic parser for اليوم / بكرا / بعد بكره etc.
  const det = parseDeterministicArabicDate(input)
  if (det !== null) {
    const now = new Date()
    return new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + det.offsetDays,
    ))
  }

  const t = normalizeArabicInput(input)
  // Normalize Arabic-Indic digits (٠-٩ → 0-9) for numeric patterns
  const td = t.replace(/[٠-٩]/g, (d: string) => String(d.charCodeAt(0) - 0x0660))

  // 2. Arabic weekday names.
  // Keys are pre-normalized (أ→ا, ى→ي, ة→ه) but we also compare with standalone
  // hamza ء stripped, since normalizeArabicInput does not normalize ء and some
  // mobile keyboards omit or substitute it.
  const WEEKDAYS: Array<[string, number]> = [
    ['السبت', 6], ['الاحد', 0], ['الاثنين', 1], ['الثلاثاء', 2],
    ['الاربعاء', 3], ['الخميس', 4], ['الجمعه', 5],
  ]

  // Strip "يوم " prefix so that "يوم الأربعاء" and "موعدي يوم الأربعاء" both reduce
  // to a bare weekday name before boundary-matching.
  const yawmIdx = t.lastIndexOf('يوم ')
  const tBare = yawmIdx >= 0 ? t.slice(yawmIdx + 4).trim() : t

  function weekdayBoundaryMatch(candidate: string, word: string): boolean {
    // Check with and without trailing ء to survive encoding variation
    const cs = [candidate, candidate.replace(/ء/g, '')]
    const ws = [word, word.replace(/ء/g, '')]
    for (let i = 0; i < 2; i++) {
      const c = cs[i]!, w = ws[i]!
      if (c === w || c.startsWith(w + ' ') || c.endsWith(' ' + w) || c.includes(' ' + w + ' ')) {
        return true
      }
    }
    return false
  }

  for (const [word, targetDay] of WEEKDAYS) {
    if (weekdayBoundaryMatch(t, word) || weekdayBoundaryMatch(tBare, word)) {
      const now = new Date()
      const diff = (targetDay - now.getUTCDay() + 7) % 7
      return new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        // If today matches the weekday, advance to next week to avoid past-slot confusion
        now.getUTCDate() + (diff === 0 ? 7 : diff),
      ))
    }
  }

  // 3. Day + Arabic month: "27 ابريل", "٢٧ اغسطس"
  const MONTHS: Record<string, number> = {
    'يناير': 1, 'فبراير': 2, 'مارس': 3, 'ابريل': 4, 'مايو': 5,
    'يونيو': 6, 'يوليو': 7, 'اغسطس': 8, 'سبتمبر': 9,
    'اكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12,
  }
  const dayMonthMatch = td.match(/^(\d{1,2})\s+(\S+)$/)
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1]!, 10)
    const month = MONTHS[dayMonthMatch[2]!]
    if (month !== undefined && day >= 1 && day <= 31) {
      const now = new Date()
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      let target = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day))
      if (target < today) target = new Date(Date.UTC(now.getUTCFullYear() + 1, month - 1, day))
      return target
    }
  }

  // 4. Numeric day only: "27", "٢٧"
  const dayOnlyMatch = td.match(/^(\d{1,2})$/)
  if (dayOnlyMatch) {
    const day = parseInt(dayOnlyMatch[1]!, 10)
    if (day >= 1 && day <= 31) {
      const now = new Date()
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      let target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day))
      if (target < today) {
        const nm = now.getUTCMonth() + 1
        target = new Date(Date.UTC(
          nm > 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(),
          nm % 12,
          day,
        ))
      }
      return target
    }
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Reschedule — Intercept
// ─────────────────────────────────────────────────────────────────────────────

const RESCHEDULE_STATES = new Set([
  'RESCHEDULE_PENDING',
  'RESCHEDULE_DATE',
  'RESCHEDULE_TIME',
])

type RescheduleCtx = {
  type: 'reschedule_ctx'
  appointmentId: string
  serviceId: string
}

type RescheduleApptSelect = {
  type: 'reschedule_appt_select'
  candidates: Array<{
    id: string
    serviceId: string
    serviceName: string
    scheduledAt: string
  }>
}

async function handleRescheduleIntercept(ctx: HandlerContext): Promise<HandlerResult> {
  const { session, clinicId, from } = ctx

  const patient = await prisma.patient.findFirst({
    where: { clinicId, phone: from },
    select: { id: true },
  })

  if (!patient) {
    return { reply: 'ما لقيت موعد قائم على هذا الرقم.' }
  }

  const apptSelect = {
    id: true,
    serviceId: true,
    scheduledAt: true,
    service: { select: { name: true } },
  } as const

  // Priority 1: the appointment booked in this session — avoids selecting an older
  // appointment when the patient has multiple upcoming ones.
  let appointment: {
    id: string
    serviceId: string
    scheduledAt: Date
    service: { name: string }
  } | null = null

  if (session.bookingId) {
    appointment = await prisma.appointment.findFirst({
      where: {
        id: session.bookingId,
        clinicId,
        patientId: patient.id,
        status: { in: ['scheduled', 'confirmed', 'confirmation_pending'] },
        scheduledAt: { gt: new Date() },
      },
      select: apptSelect,
    })
  }

  // Priority 2: fetch all active future appointments for disambiguation.
  if (!appointment) {
    const activeAppointments = await prisma.appointment.findMany({
      where: {
        clinicId,
        patientId: patient.id,
        status: { in: ['scheduled', 'confirmed', 'confirmation_pending'] },
        scheduledAt: { gt: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      select: apptSelect,
      take: 5,
    })

    if (activeAppointments.length === 0) {
      return { reply: 'ما لقيت موعد قائم على هذا الرقم.' }
    }

    if (activeAppointments.length === 1) {
      appointment = activeAppointments[0]!
    } else {
      const candidates = activeAppointments.map((a) => ({
        id: a.id,
        serviceId: a.serviceId,
        serviceName: a.service.name,
        scheduledAt: a.scheduledAt.toISOString(),
      }))

      await prisma.conversationSession.update({
        where: { id: session.id },
        data: {
          ambiguousIntents: { type: 'reschedule_appt_select', candidates } as unknown as Prisma.InputJsonValue,
          retryCount: 0,
        },
      })

      await transitionSession(session.id, clinicId, 'RESCHEDULE_PENDING', 'INTENT_RESCHEDULE')

      const list = candidates
        .map((c, i) => {
          const d = new Date(c.scheduledAt).toLocaleDateString('ar-SA', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
          return `${i + 1}. ${c.serviceName} — ${d}`
        })
        .join('\n')

      return {
        reply: `لقيت لك أكثر من موعد، أي موعد تقصد؟\n\n${list}\n\nاختر رقم الموعد.`,
      }
    }
  }

  // Single appointment resolved — proceed with normal reschedule flow.
  const rescheduleCtx: RescheduleCtx = {
    type: 'reschedule_ctx',
    appointmentId: appointment.id,
    serviceId: appointment.serviceId,
  }

  await prisma.conversationSession.update({
    where: { id: session.id },
    data: {
      ambiguousIntents: rescheduleCtx as unknown as Prisma.InputJsonValue,
      retryCount: 0,
    },
  })

  await transitionSession(session.id, clinicId, 'RESCHEDULE_PENDING', 'INTENT_RESCHEDULE')

  const dateLabel = appointment.scheduledAt.toLocaleDateString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return {
    reply: `لقيت موعدك الحالي: ${appointment.service.name} – ${dateLabel}\n\nمتى يناسبك الموعد الجديد؟`,
  }
}

async function handleRescheduleDate(ctx: HandlerContext): Promise<HandlerResult> {
  const { session, clinicId, body, interpretation } = ctx

  const stored = session.ambiguousIntents as (RescheduleCtx | RescheduleApptSelect) | null

  // Appointment disambiguation: user is selecting which appointment to reschedule.
  if (stored?.type === 'reschedule_appt_select') {
    const { candidates } = stored as RescheduleApptSelect
    const selection = parseSelection(body)
    if (selection === null || selection < 1 || selection > candidates.length) {
      return { reply: 'اختر رقم الموعد من القائمة.' }
    }
    const chosen = candidates[selection - 1]!
    const rescheduleCtx: RescheduleCtx = {
      type: 'reschedule_ctx',
      appointmentId: chosen.id,
      serviceId: chosen.serviceId,
    }
    await prisma.conversationSession.update({
      where: { id: session.id },
      data: {
        ambiguousIntents: rescheduleCtx as unknown as Prisma.InputJsonValue,
        retryCount: 0,
      },
    })
    return { reply: 'تمام، متى يناسبك الموعد الجديد؟' }
  }

  if (!stored || stored.type !== 'reschedule_ctx' || !stored.appointmentId || !stored.serviceId) {
    return escalate(ctx, 'CORRUPTED_RESCHEDULE')
  }

  let targetDate = resolveRescheduleTargetDate(body)

  // Fallback: if string parser couldn't extract a date but the AI pipeline parsed a
  // weekday (e.g. from a free-form phrase the regex didn't cover), use that.
  if (targetDate === null && interpretation.preferredDayOfWeek !== null) {
    const now = new Date()
    const diff = (interpretation.preferredDayOfWeek - now.getUTCDay() + 7) % 7
    targetDate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + (diff === 0 ? 7 : diff),
    ))
  }

  if (targetDate === null) {
    const limit = await checkRetryLimit(session, clinicId)
    if (limit) return limit
    return { reply: 'المدخل غير واضح. اختر تاريخاً للموعد الجديد.' }
  }

  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  if (targetDate < today) {
    const limit = await checkRetryLimit(session, clinicId)
    if (limit) return limit
    return { reply: 'لا يمكن الحجز في تاريخ ماضٍ. اختر تاريخاً آخر.' }
  }

  const dayEnd = new Date(targetDate)
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)

  const slots = await prisma.availableSlot.findMany({
    where: {
      clinicId,
      serviceId: stored.serviceId,
      isBooked: false,
      OR: [{ isHeld: false }, { heldBySessionId: session.id }],
      startTime: { gte: targetDate, lt: dayEnd },
    },
    select: { id: true, startTime: true },
    orderBy: { startTime: 'asc' },
    take: 5,
  })

  if (slots.length === 0) {
    await transitionSession(session.id, clinicId, 'RESCHEDULE_DATE', 'NO_AVAILABILITY')
    return { reply: 'ما فيه مواعيد متاحة في هذا اليوم.\nاختر يوم ثاني.' }
  }

  await prisma.conversationSession.update({
    where: { id: session.id },
    data: {
      ambiguousIntents: {
        type: 'reschedule_slots',
        appointmentId: stored.appointmentId,
        serviceId: stored.serviceId,
        slots: slots.map((s) => ({ id: s.id, startTime: s.startTime.toISOString() })),
      } as unknown as Prisma.InputJsonValue,
      retryCount: 0,
      slotOfferedAt: new Date(),
    },
  })

  await transitionSession(session.id, clinicId, 'RESCHEDULE_TIME', 'SLOT_VALID')

  const list = slots
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

async function handleRescheduleTime(ctx: HandlerContext): Promise<HandlerResult> {
  const { session, clinicId, body } = ctx

  const stored = session.ambiguousIntents as {
    type: string
    appointmentId: string
    serviceId: string
    slots: Array<{ id: string; startTime: string }>
  } | null

  if (
    !stored ||
    stored.type !== 'reschedule_slots' ||
    !stored.appointmentId ||
    !Array.isArray(stored.slots) ||
    stored.slots.length === 0
  ) {
    return escalate(ctx, 'CORRUPTED_RESCHEDULE')
  }

  const selection = parseSelection(body)
  if (selection === null || selection < 1 || selection > stored.slots.length) {
    const list = stored.slots
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

  const selectedSlot = stored.slots[selection - 1]!
  const newSlotTime = new Date(selectedSlot.startTime)

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "available_slots" WHERE id = ${selectedSlot.id} FOR UPDATE`

      const newSlot = await tx.availableSlot.findUnique({
        where: { id: selectedSlot.id },
        select: { id: true, isBooked: true, isHeld: true, heldBySessionId: true, startTime: true },
      })

      if (
        !newSlot ||
        newSlot.isBooked ||
        (newSlot.isHeld && newSlot.heldBySessionId !== session.id)
      ) {
        throw new SlotConflictError()
      }

      const appointment = await tx.appointment.findUniqueOrThrow({
        where: { id: stored.appointmentId },
        select: { scheduledAt: true, serviceId: true, patientId: true },
      })

      await tx.availableSlot.updateMany({
        where: {
          clinicId,
          serviceId: appointment.serviceId,
          startTime: appointment.scheduledAt,
          isBooked: true,
        },
        data: { isBooked: false, isHeld: false, heldBySessionId: null, heldAt: null },
      })

      await tx.availableSlot.update({
        where: { id: selectedSlot.id },
        data: { isBooked: true, isHeld: false, heldBySessionId: null, heldAt: null },
      })

      await tx.appointment.update({
        where: { id: stored.appointmentId },
        data: { scheduledAt: newSlot.startTime },
      })

      await tx.reminder.updateMany({
        where: { appointmentId: stored.appointmentId, status: 'pending' },
        data: { status: 'cancelled' },
      })

      await tx.notificationJob.updateMany({
        where: {
          appointmentId: stored.appointmentId,
          status: { in: ['pending', 'queued'] },
        },
        data: { status: 'failed' },
      })

      const [clinic, service, patient] = await Promise.all([
        tx.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { name: true } }),
        tx.service.findUniqueOrThrow({ where: { id: stored.serviceId }, select: { name: true } }),
        tx.patient.findUniqueOrThrow({
          where: { id: appointment.patientId },
          select: { id: true, firstName: true, lastName: true, phone: true, email: true },
        }),
      ])

      await regenerateAppointmentReminderJobs(tx, {
        clinicId,
        clinic: { name: clinic.name },
        appointmentId: stored.appointmentId,
        appointmentScheduledAt: newSlot.startTime,
        patient,
        doctor: { firstName: '', lastName: '' },
        service: { name: service.name },
        includeImmediateConfirmation: false,
      })
    })
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return { reply: 'هذا الموعد لم يعد متاحًا.\nاختر موعدًا آخر من القائمة.' }
    }
    console.error('[RESCHEDULE_TIME_ERROR]', err)
    throw err
  }

  // Google Calendar sync — runs after DB transaction succeeds.
  // Calendar failure does not block the user-facing reply (DB is source of truth).
  const syncAppt = await prisma.appointment.findUnique({
    where: { id: stored.appointmentId },
    select: {
      id: true,
      calendarEventId: true,
      scheduledAt: true,
      durationMinutes: true,
      patient: { select: { firstName: true, lastName: true } },
      service: { select: { name: true } },
      clinic: { select: { name: true, timezone: true } },
    },
  })

  if (syncAppt) {
    await syncUpdateEventForAppointment(clinicId, {
      id: syncAppt.id,
      calendarEventId: syncAppt.calendarEventId,
      scheduledAt: syncAppt.scheduledAt,
      durationMinutes: syncAppt.durationMinutes,
      patient: syncAppt.patient,
      doctor: null,
      service: syncAppt.service,
      clinic: syncAppt.clinic,
    })
  }

  await prisma.conversationSession.update({
    where: { id: session.id },
    data: { ambiguousIntents: Prisma.JsonNull, retryCount: 0 },
  })

  await transitionSession(session.id, clinicId, 'RESCHEDULE_CONFIRMED', 'RESCHEDULE_SUCCESS')

  const dateLabel = newSlotTime.toLocaleDateString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const timeLabel = newSlotTime.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })

  return { reply: `تم تعديل الموعد.\n\nالموعد الجديد: ${dateLabel} – ${timeLabel}` }
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

  if (ctx.interpretation.intent === 'reschedule' && !RESCHEDULE_STATES.has(currentState)) {
    return handleRescheduleIntercept(ctx)
  }

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
    case 'BOOKING_CONFIRMED':
    case 'BOOKING_FAILED':
    case 'CANCELLATION_CONFIRMED':
    case 'EXPIRED':
    case 'CORRUPTED':
      return handleEntryState(ctx)

    case 'INTENT_DISAMBIGUATION':
      return handleBookingIntentClarification(ctx)

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

    case 'RESCHEDULE_PENDING':
    case 'RESCHEDULE_DATE':
      return handleRescheduleDate(ctx)

    case 'RESCHEDULE_TIME':
      return handleRescheduleTime(ctx)

    case 'RESCHEDULE_CONFIRMED':
      return handleEntryState(ctx)

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

  // Early-exit: skip AI pipeline entirely for clear escalation requests.
  // dispatch() will re-run isEscalationRequest() and call escalate().
  if (isEscalationRequest(body)) {
    interpretation = {
      intent: 'unknown',
      confidence: 'high',
      canonicalText: body,
      preferredDateOffsetDays: null,
      preferredWeekOffsetDays: 0,
      preferredDayOfWeek: null,
      preferredPeriod: null,
      doctorHint: null,
    }
  } else try {
    const decision = await runAiInterpretationPipeline({
      bodyRaw: body,
      from,
      messageSid,
      originalRepliedSid,
      currentState: session.currentState,
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

  // Deterministic Arabic relative date guard — runs before any AI/LLM date
  // interpretation is consumed, preventing non-deterministic weekday drift.
  const deterministicDate = parseDeterministicArabicDate(body)
  if (deterministicDate !== null) {
    interpretation.preferredDateOffsetDays = deterministicDate.offsetDays
    interpretation.preferredDayOfWeek = null
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