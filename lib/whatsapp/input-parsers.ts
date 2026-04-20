/**
 * Pure input-parsing helpers for the WhatsApp FSM webhook.
 * No side effects, no I/O, no imports.
 */

/**
 * Parse Arabic-Indic digits, Arabic ordinal words, and Latin digits
 * into a 1-based integer. Returns null on failure.
 */
export function parseSelection(text: string): number | null {
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
  const t = text.trim()
  return [
    'ابي اتكلم مع الموظف', 'أبي اكلم الموظف', 'ابغى اكلم الموظف',
    'عطني الموظف', 'عطني موظف', 'ابي موظف',
    'تكلم موظف', 'اريد موظف', 'أريد موظف',
    'human', 'agent', 'عطني خدمة العملاء ', 'حولني على خدمة العملاء', 'وصلني بخدمة العملاء', 'ابي اتكلم مع خدمة العملاء', 'ابغي اتكلم مع الموظف', 'حولني على الموظف', 'اريد اتكلم مع الموظف',

    'ابي اتكلم مع الموضف', 'أبي اكلم الموضف', 'ابغى اكلم الموضف',
    'عطني الموضف', 'عطني موظف', 'ابي موضف',
    'تكلم موضف', 'اريد موضف', 'أريد موضف',
    'humen', 'i  want agent', 'عطني خدمة العملاء ', 'حولني على خدمة العملاء', 'وصلني بخدمة العملاء', 'ابي اتكلم مع خدمة العملاء', 'ابغي اتكلم مع الموضف', 'حولني على الموضف', 'اريد اتكلم مع الموف',

  ].some((trigger) => t.includes(trigger))
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
