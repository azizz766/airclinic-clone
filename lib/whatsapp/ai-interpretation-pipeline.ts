import { normalizeReplyValue } from '@/lib/whatsapp/context-resolution'

export type AiIntent =
  | 'confirm'
  | 'cancel'
  | 'reschedule'
  | 'new_booking'
  | 'availability_check'
  | 'inquiry_price'
  | 'inquiry_doctor'
  | 'unknown'

export type PreferredPeriod = 'morning' | 'afternoon' | 'evening' | 'after_isha'

export type AiInterpretation = {
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
  confidence: 'low' | 'medium' | 'high'
  preferredPeriod: PreferredPeriod | null
  preferredDateOffsetDays: number | null
  notes: string
  detectedLanguage?: 'ar' | 'en'
  extractedFields?: {
    serviceName?: string | null
    patientName?: string | null
    patientDob?: string | null
    phone?: string | null
    dateText?: string | null
    timeText?: string | null
  }
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
    [/(^|\s)(مواعيد|موعد|احجز|حجز|ابغى\s*موعد|ابي\s*موعد|موعد\s*جديد|book|booking)(\s|[\u061f\u060c!?,.]|$)/g, ' $1booking$3 '],
    [/(^|\s)(اي\s*وقت|أي\s*وقت|وقت\s*فاضي|فاضي\s*عندكم|any\s*time)(\s|[\u061f\u060c!?,.]|$)/g, ' $1flexible_time availability$3 '],
    [/(^|\s)(يناسب\s*دوامي|يناسب\s*دوام[ي]?|حسب\s*دوامي|حسب\s*دوام[ي]?|بعد\s*الدوام|after\s*work)(\s|[\u061f\u060c!?,.]|$)/g, ' $1work_schedule availability$3 '],
    [/(^|\s)(مو\s*متاكد\s*متى|ماني\s*متاكد\s*متى|مش\s*متاكد\s*متى|not\s*sure\s*when)(\s|[\u061f\u060c!?,.]|$)/g, ' $1vague_time booking availability$3 '],
    [/(^|\s)(اكد|تاكيد|confirm|confirmed|ok|اوكي)(\s|[\u061f\u060c!?,.]|$)/g, ' $1confirm$3 '],
    [/(^|\s)(الغ|الغاء|الغي|ابغى\s*الغي|ابي\s*الغي|الغ\s*الموعد|ايقاف\s*الموعد|cancel|cancellation)(\s|[\u061f\u060c!?,.]|$)/g, ' $1cancel$3 '],
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

function hasPhrase(text: string, phrase: string) {
  return text.includes(normalizeForNlu(phrase))
}

function hasAnyPhrase(text: string, phrases: string[]) {
  return phrases.some((phrase) => hasPhrase(text, phrase))
}

function extractPreferredDateOffsetDays(canonicalText: string) {
  if (tokenExists(canonicalText, 'day_after_tomorrow')) return 2
  if (tokenExists(canonicalText, 'tomorrow')) return 1
  if (/(^|\s)(today|اليوم|now)(\s|$)/.test(canonicalText)) return 0
  return null
}

function extractPreferredPeriod(canonicalText: string): PreferredPeriod | null {
  if (tokenExists(canonicalText, 'after_isha')) return 'after_isha'
  if (tokenExists(canonicalText, 'evening')) return 'evening'
  if (tokenExists(canonicalText, 'afternoon')) return 'afternoon'
  if (tokenExists(canonicalText, 'morning')) return 'morning'
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
  if (tokenExists(canonicalText, 'next_week')) return 7
  return 0
}

function extractDoctorHint(text: string) {
  const doctorMatch = text.match(
    /(?:دكتور|دكتوره|doctor|dr\.?)[\s:]+([\p{L}]+(?:\s+[\p{L}]+)?)/iu,
  )
  if (!doctorMatch) return null
  const value = doctorMatch[1]?.trim()
  return value || null
}

function interpretIncomingMessage(bodyRaw: string): AiInterpretation {
  const normalized = normalizeForNlu(bodyRaw)

  // Hard stop for booking phrases so "ابي احجز" never falls through to unknown/escalation
  if (
    normalized.includes('حجز') ||
    normalized.includes('احجز') ||
    normalized.includes('موعد')
  ) {
    return {
      intent: 'new_booking',
      confidence: 'high',
      preferredDateOffsetDays: null,
      preferredWeekOffsetDays: 0,
      preferredDayOfWeek: null,
      preferredPeriod: null,
      doctorHint: null,
      canonicalText: normalized,
    }
  }

  const canonicalText = applySynonymNormalization(` ${normalized} `)
    .replace(/\s+/g, ' ')
    .trim()

  const dateOffset = extractPreferredDateOffsetDays(canonicalText)
  const weekOffsetDays = extractPreferredWeekOffsetDays(canonicalText)
  const dayOfWeek = extractPreferredDayOfWeek(canonicalText)
  const period = extractPreferredPeriod(canonicalText)
  const doctorHint = extractDoctorHint(normalized)

  const explicitBookingPhrases = [
    'ابي احجز',
    'ابغى احجز',
    'ابغي احجز',
    'اريد احجز',
    'ابي حجز',
    'ابغى حجز',
    'ابغي حجز',
    'اريد حجز',
    'ابي موعد',
    'ابغى موعد',
    'ابغي موعد',
    'اريد موعد',
    'احجز',
    'احجز موعد',
    'حجز موعد',
    'موعد جديد',
  ]

  const explicitCancelPhrases = [
    'ابي الغي',
    'ابغى الغي',
    'ابغي الغي',
    'اريد الغي',
    'الغ الموعد',
    'الغاء الموعد',
    'الغي الموعد',
    'cancel',
  ]

  const explicitReschedulePhrases = [
    'ابي اغير الموعد',
    'ابغى اغير الموعد',
    'ابغي اغير الموعد',
    'اريد اغير الموعد',
    'ابي موعد ثاني',
    'غير الموعد',
    'تغيير الموعد',
    'reschedule',
  ]

  const explicitPricePhrases = [
    'كم سعر',
    'السعر',
    'بكم',
    'كم التكلفه',
    'كم التكلفة',
    'price',
    'cost',
  ]

  const explicitDoctorPhrases = [
    'ابي دكتور',
    'ابغى دكتور',
    'اريد دكتور',
    'مين الدكتور',
    'مين الدكتوره',
    'doctor',
    'dr',
  ]

  const explicitAvailabilityPhrases = [
    'متى عندكم',
    'وش المواعيد المتاحه',
    'وش المواعيد المتاحة',
    'فيه موعد',
    'عندكم موعد',
    'متاح',
    'availability',
    'available',
  ]

  if (hasAnyPhrase(normalized, explicitBookingPhrases)) {
    return {
      intent: 'new_booking',
      confidence: 'high',
      preferredDateOffsetDays: dateOffset,
      preferredWeekOffsetDays: weekOffsetDays,
      preferredDayOfWeek: dayOfWeek,
      preferredPeriod: period,
      doctorHint,
      canonicalText,
    }
  }

  if (hasAnyPhrase(normalized, explicitCancelPhrases)) {
    return {
      intent: 'cancel',
      confidence: 'high',
      preferredDateOffsetDays: dateOffset,
      preferredWeekOffsetDays: weekOffsetDays,
      preferredDayOfWeek: dayOfWeek,
      preferredPeriod: period,
      doctorHint,
      canonicalText,
    }
  }

  if (hasAnyPhrase(normalized, explicitReschedulePhrases)) {
    return {
      intent: 'reschedule',
      confidence: 'high',
      preferredDateOffsetDays: dateOffset,
      preferredWeekOffsetDays: weekOffsetDays,
      preferredDayOfWeek: dayOfWeek,
      preferredPeriod: period,
      doctorHint,
      canonicalText,
    }
  }

  if (hasAnyPhrase(normalized, explicitPricePhrases)) {
    return {
      intent: 'inquiry_price',
      confidence: 'high',
      preferredDateOffsetDays: dateOffset,
      preferredWeekOffsetDays: weekOffsetDays,
      preferredDayOfWeek: dayOfWeek,
      preferredPeriod: period,
      doctorHint,
      canonicalText,
    }
  }

  if (hasAnyPhrase(normalized, explicitDoctorPhrases)) {
    return {
      intent: 'inquiry_doctor',
      confidence: 'high',
      preferredDateOffsetDays: dateOffset,
      preferredWeekOffsetDays: weekOffsetDays,
      preferredDayOfWeek: dayOfWeek,
      preferredPeriod: period,
      doctorHint,
      canonicalText,
    }
  }

  if (
    hasAnyPhrase(normalized, explicitAvailabilityPhrases) ||
    dateOffset !== null ||
    dayOfWeek !== null ||
    period !== null
  ) {
    return {
      intent: 'availability_check',
      confidence: 'high',
      preferredDateOffsetDays: dateOffset,
      preferredWeekOffsetDays: weekOffsetDays,
      preferredDayOfWeek: dayOfWeek,
      preferredPeriod: period,
      doctorHint,
      canonicalText,
    }
  }

  const intentScores: Record<AiIntent, number> = {
    confirm: countPatternMatches(canonicalText, [/\bconfirm\b/, /\bتاكيد\b/, /\bاكد\b/]),
    cancel: countPatternMatches(canonicalText, [/\bcancel\b/, /\bالغاء\b/, /\bالغ\b/, /\bالغي\b/]),
    reschedule: countPatternMatches(canonicalText, [/\breschedule\b/, /\bتغيير\b/, /\bغير\b/, /\bموعد ثاني\b/]),
    new_booking: countPatternMatches(canonicalText, [/\bbooking\b/, /\bحجز\b/, /\bموعد جديد\b/]),
    availability_check: countPatternMatches(canonicalText, [
      /\bavailability\b/,
      /\bمتاح\b/,
      /\bعندكم\b/,
      /\bمتى\b/,
      /\bflexible_time\b/,
      /\bwork_schedule\b/,
      /\bvague_time\b/,
      /\btomorrow\b/,
      /\bday_after_tomorrow\b/,
    ]),
    inquiry_price: countPatternMatches(canonicalText, [/\bprice_inquiry\b/, /\bسعر\b/, /\bبكم\b/]),
    inquiry_doctor: countPatternMatches(canonicalText, [/\bdoctor\b/, /\bمين الدكتور\b/]),
    unknown: 0,
  }

  if (dateOffset !== null || dayOfWeek !== null || period !== null) {
    intentScores.availability_check += 2
  }

  if (tokenExists(canonicalText, 'work_schedule')) {
    intentScores.availability_check += 3
  }

  if (tokenExists(canonicalText, 'flexible_time')) {
    intentScores.availability_check += 2
  }

  if (tokenExists(canonicalText, 'vague_time')) {
    intentScores.availability_check += 2
    intentScores.new_booking += 2
  }

  if (doctorHint) {
    intentScores.inquiry_doctor += 1
    intentScores.new_booking += 1
  }

  if (tokenExists(canonicalText, 'cancel')) {
    intentScores.cancel += 3
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
      'cancel',
      'inquiry_price',
      'inquiry_doctor',
      'unknown',
    ]
    const validConfidence = ['low', 'medium', 'high'] as const
    const validPeriods: Array<PreferredPeriod | null> = [
      'morning',
      'afternoon',
      'evening',
      'after_isha',
      null,
    ]

    const intent = validIntent.includes(parsed.intent as AiIntent)
      ? (parsed.intent as AiIntent)
      : null

    const confidence = validConfidence.includes(
      parsed.confidence as (typeof validConfidence)[number],
    )
      ? (parsed.confidence as (typeof validConfidence)[number])
      : 'medium'

    const preferredPeriod = validPeriods.includes(
      (parsed.preferredPeriod as PreferredPeriod | null) ?? null,
    )
      ? ((parsed.preferredPeriod as PreferredPeriod | null) ?? null)
      : null

    const preferredDateOffsetDays =
      typeof parsed.preferredDateOffsetDays === 'number'
        ? Math.max(0, Math.floor(parsed.preferredDateOffsetDays))
        : null

    const notes = typeof parsed.notes === 'string' ? parsed.notes : ''

    if (!intent) return null

    return {
      intent,
      confidence,
      preferredPeriod,
      preferredDateOffsetDays,
      notes,
    }
  } catch {
    return null
  }
}

async function interpretWithLlmFallback(params: {
  rawMessage: string
  normalizedText: string
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const model = process.env.WHATSAPP_INTENT_MODEL || 'claude-haiku-4-5'

  console.log('[LLM MODEL]', {
    model,
    modelSource: process.env.WHATSAPP_INTENT_MODEL ? 'env' : 'default',
  })

  const systemPrompt = `You are Velora AI — an interpretation engine for a WhatsApp clinic booking system.

Your ONLY job is to analyze incoming user messages and return structured JSON.
You do NOT generate responses. You do NOT control the conversation flow.

EXTRACT:
1. intent — one of: new_booking | availability_check | reschedule | confirm | cancel | inquiry_price | inquiry_doctor | unknown
2. confidence — low | medium | high
3. preferredPeriod — morning | afternoon | evening | after_isha | null
4. preferredDateOffsetDays — number | null
5. detectedLanguage — ar | en
6. extractedFields — { serviceName, patientName, patientDob, phone, dateText, timeText } all nullable
7. notes — short internal explanation

RULES:
- Return JSON only — no markdown, no explanation
- Never invent slots, times, or service names
- If multiple fields in one message extract all
- Implicit Arabic scheduling → new_booking or availability_check
- Truly unrelated → unknown

SCHEMA:
{
  "intent": "new_booking",
  "confidence": "high",
  "preferredPeriod": null,
  "preferredDateOffsetDays": null,
  "detectedLanguage": "ar",
  "extractedFields": {
    "serviceName": null,
    "patientName": null,
    "patientDob": null,
    "phone": null,
    "dateText": null,
    "timeText": null
  },
  "notes": "explanation"
}`

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
        messages: [{ role: 'user', content: userPrompt }],
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

    const data = (await response.json()) as {
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

function mergeInterpretationWithLlm(
  base: AiInterpretation,
  llm: LlmIntentResponse,
): AiInterpretation {
  const mergedIntent = llm.intent !== 'unknown' ? llm.intent : base.intent

  return {
    ...base,
    intent: mergedIntent,
    confidence:
      mergedIntent !== base.intent
        ? llm.confidence
        : base.confidence === 'high'
          ? 'high'
          : llm.confidence,
    preferredPeriod: base.preferredPeriod ?? llm.preferredPeriod,
    preferredDateOffsetDays:
      base.preferredDateOffsetDays ?? llm.preferredDateOffsetDays,
  }
}

export type AiDecisionRecord = {
  normalizedReply: number | null
  shouldCallLlm: boolean
  llmFallbackUsed: boolean
  llmFallbackNotes: string | null
  ruleInterpretation: AiInterpretation
  finalInterpretation: AiInterpretation
}

export async function runAiInterpretationPipeline(params: {
  bodyRaw: string
  from: string
  messageSid: string
  originalRepliedSid: string
}) {
  const normalizedReply = normalizeReplyValue(params.bodyRaw)
  const ruleInterpretation = interpretIncomingMessage(params.bodyRaw)
  let aiInterpretation = ruleInterpretation
  let llmFallbackUsed = false
  let llmFallbackNotes: string | null = null

  const shouldCallLlm =
    normalizedReply === null &&
    (
      ruleInterpretation.intent === 'unknown' ||
      ruleInterpretation.confidence === 'low' ||
      params.bodyRaw.trim().length > 3
    )

  console.log('[AI DEBUG]', {
    normalizedReply,
    shouldCallLlm,
    intent: aiInterpretation.intent,
    confidence: aiInterpretation.confidence,
  })

  if (shouldCallLlm) {
    const llmResult = await interpretWithLlmFallback({
      rawMessage: params.bodyRaw,
      normalizedText: ruleInterpretation.canonicalText,
    })

    console.log('[LLM RESULT]', llmResult)

    if (llmResult) {
      aiInterpretation = mergeInterpretationWithLlm(aiInterpretation, llmResult)
      llmFallbackUsed = true
      llmFallbackNotes = llmResult.notes
    }
  }

  const decision: AiDecisionRecord = {
    normalizedReply,
    shouldCallLlm,
    llmFallbackUsed,
    llmFallbackNotes,
    ruleInterpretation,
    finalInterpretation: aiInterpretation,
  }

  console.log('[AI DECISION]', decision.finalInterpretation)
  console.log('[AI DECISION DETAIL]', {
    messageSid: params.messageSid || null,
    from: params.from,
    originalRepliedSid: params.originalRepliedSid || null,
    normalizedReply: decision.normalizedReply,
    shouldCallLlm: decision.shouldCallLlm,
    llmFallbackUsed: decision.llmFallbackUsed,
    llmFallbackNotes: decision.llmFallbackNotes,
    ruleIntent: decision.ruleInterpretation.intent,
    ruleConfidence: decision.ruleInterpretation.confidence,
    finalIntent: decision.finalInterpretation.intent,
    finalConfidence: decision.finalInterpretation.confidence,
    preferredDateOffsetDays: decision.finalInterpretation.preferredDateOffsetDays,
    preferredDayOfWeek: decision.finalInterpretation.preferredDayOfWeek,
    preferredPeriod: decision.finalInterpretation.preferredPeriod,
  })

  return decision
}