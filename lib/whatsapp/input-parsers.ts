/**
 * Pure input-parsing helpers for the WhatsApp FSM webhook.
 * No side effects, no I/O, no imports.
 */

/**
 * Parse Arabic-Indic digits, Arabic ordinal words, and Latin digits
 * into a 1-based integer. Returns null on failure.
 */
export function parseSelection(text: string): number | null {
  const t = text.replace(/[​-‏﻿]/g, '').trim()

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

export function isAffirmative(text: string): boolean {
  const t = text.trim()
  return [
    'نعم', 'اي', 'آي', 'أي', 'ايوا', 'ايوه', 'ايه', 'أيه',
    'تمام', 'صح', 'صحيح', 'اكيد', 'أكيد', 'بالتأكيد',
    'موافق', 'موافقة', 'احجز', 'أحجز', 'تأكيد', 'تاكيد',
    'yes', 'y', 'ok', 'okay', 'yep', '1',
  ].some((a) => t === a || t.toLowerCase().includes(a))
}

export function isNegative(text: string): boolean {
  const t = text.trim()
  return [
    'لا', 'لأ', 'لأه', 'لاه', 'كلا',
    'مو', 'مب', 'ما ابي', 'ما أبي',
    'no', 'n', 'نو', 'الغ',
  ].some((n) => t === n || t.toLowerCase().startsWith(n))
}

export function isEscalationRequest(text: string): boolean {
  // Normalize same as NLU pipeline
  const t = text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[.,!?،؟]/g, '')
    .trim()

  const tokens = t.split(' ')

  // Booking protection: booking intent with no explicit escalation word → not escalation
  const bookingTokens = ['احجز', 'حجز', 'موعد']
  const escalationWords = ['بشري', 'انسان', 'موظف', 'موضف', 'support', 'agent', 'human']

  const hasBooking = bookingTokens.some((tok) => tokens.includes(tok))
  const hasEscalationWord = escalationWords.some((word) => tokens.includes(word))

  if (hasBooking && !hasEscalationWord) return false

  // Exact phrase matches (normalized, ة→ه already applied above)
  const exactPhrases = [
    'ابي اتكلم مع الموظف',
    'ابي اكلم الموظف',
    'ابغي اكلم الموظف',
    'ابغي اتكلم مع الموظف',
    'اريد اتكلم مع الموظف',
    'عطني الموظف',
    'عطني موظف',
    'ابي موظف',
    'تكلم موظف',
    'اريد موظف',
    'ابي اكلم موظف',
    'اريد التحدث مع موظف',
    'اريد التحدث مع الموظف',
    'اريد اتكلم مع موظف',

    'ابي اتكلم مع الموضف',
    'ابي اكلم الموضف',
    'ابغي اكلم الموضف',
    'ابغي اتكلم مع الموضف',
    'عطني الموضف',
    'ابي موضف',
    'تكلم موضف',
    'اريد موضف',

    'عطني خدمه العملاء',
    'حولني علي خدمه العملاء',
    'حولني خدمه العملاء',
    'وصلني بخدمه العملاء',
    'ابي اتكلم مع خدمه العملاء',

    'ابي دعم',
    'ابي انسان',
    'ابي بشري',

    'talk to human',
    'talk to agent',
    'i want agent',
    'i want human',
    'customer service',
  ]

  if (exactPhrases.some((phrase) => t === phrase)) return true

  // Single English escalation tokens (standalone word only, not substring)
  const englishEscalationTokens = ['human', 'agent', 'support']
  if (englishEscalationTokens.some((word) => tokens.includes(word))) return true

  return false
}

/**
 * Parse DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, YYYY/MM/DD.
 * Normalizes Arabic-Indic digits to Latin before parsing.
 * Returns null on failure.
 */
export function parseDateInput(raw: string): Date | null {
  raw = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  const t = raw.trim()

  const dmy = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    if (!isNaN(d.getTime())) return d
  }

  const ymd = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    if (!isNaN(d.getTime())) return d
  }

  return null
}