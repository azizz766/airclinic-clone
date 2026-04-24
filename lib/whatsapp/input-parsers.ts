/**
 * Pure input-parsing helpers for the WhatsApp FSM webhook.
 * No side effects, no I/O, no imports.
 */

/**
 * Deterministic Arabic normalization for intent matching.
 * Strips diacritics, punctuation, normalizes letter variants, collapses spaces.
 */
export function normalizeArabicInput(message: string): string {
  return message
    .toLowerCase()
    .trim()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/[.,!?،؟;:()\[\]{}"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

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
  const t = normalizeArabicInput(text)
  const tokens = t.split(' ')

  // Booking protection: booking intent with no explicit escalation word → not escalation
  const bookingTokens = ['احجز', 'حجز', 'موعد']
  const escalationWords = [
    'بشري', 'انسان', 'موظف', 'موضف', 'دعم', 'كلموني', 'ادمي',
    'support', 'agent', 'human',
  ]

  const hasBooking = bookingTokens.some((tok) => tokens.includes(tok))
  const hasEscalationWord = escalationWords.some((word) => tokens.includes(word))

  if (hasBooking && !hasEscalationWord) return false

  // Any message containing a clear escalation keyword (without booking) → escalate
  if (hasEscalationWord) return true

  // Exact phrase matches for ambiguous triggers (احد, خدمه, بوت)
  const exactPhrases = [
    // customer service
    'خدمه عملاء',
    'عطني خدمه العملاء',
    'حولني علي خدمه العملاء',
    'حولني لخدمه العملاء',
    'حولني خدمه العملاء',
    'وصلني بخدمه العملاء',
    'ابي اتكلم مع خدمه العملاء',
    'ابي خدمه العملاء',
    'ابغي خدمه العملاء',
    'ابغي اكلم خدمه العملاء',
    // "anyone there" / احد
    'فيه احد',
    'في احد',
    'ابي احد',
    'ابغي احد',
    'ابي اكلم احد',
    'ابغي اكلم احد',
    // anti-bot
    'مو بوت',
    'مابي بوت',
    // English
    'talk to human',
    'talk to agent',
    'i want agent',
    'i want human',
    'customer service',
  ]

  if (exactPhrases.some((phrase) => t === phrase || t.includes(phrase))) return true

  // Single English escalation tokens
  const englishEscalationTokens = ['human', 'agent', 'support']
  if (englishEscalationTokens.some((word) => tokens.includes(word))) return true

  return false
}

/**
 * Deterministic parser for Arabic relative date phrases.
 * Returns {offsetDays: 0|1|2} if matched, null otherwise.
 * Must run before AI/LLM pipeline to prevent non-deterministic weekday drift.
 */
export function parseDeterministicArabicDate(
  message: string,
): { offsetDays: number } | null {
  const t = normalizeArabicInput(message)

  // Pre-normalized forms (after normalizeArabicInput). Order matters: check
  // "بعد" phrases before standalone tomorrow words.
  const DAY_AFTER_TOMORROW = ['بعد بكرا', 'بعد بكره', 'بعد غدا']
  const TOMORROW = ['بكرا', 'بكره', 'غدا']

  function containsWord(haystack: string, word: string): boolean {
    return (
      haystack === word ||
      haystack.startsWith(word + ' ') ||
      haystack.endsWith(' ' + word) ||
      haystack.includes(' ' + word + ' ')
    )
  }

  if (DAY_AFTER_TOMORROW.some((p) => containsWord(t, p))) return { offsetDays: 2 }
  if (TOMORROW.some((p) => containsWord(t, p))) return { offsetDays: 1 }
  if (t === 'اليوم') return { offsetDays: 0 }

  return null
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