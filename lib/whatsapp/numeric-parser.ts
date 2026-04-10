/**
 * Parses a WhatsApp message body for a numeric selection index.
 *
 * Returns:
 *   - 1..N  — the selected 1-based index
 *   - -1    — special sentinel meaning "last item"
 *   - null  — no numeric selection detected
 */
export function parseNumericInput(rawBody: string): number | null {
  const normalized = rawBody
    // Arabic-Indic digits → ASCII
    .replace(/[٠۰]/g, '0')
    .replace(/[١۱]/g, '1')
    .replace(/[٢۲]/g, '2')
    .replace(/[٣۳]/g, '3')
    .replace(/[٤۴]/g, '4')
    .replace(/[٥۵]/g, '5')
    .replace(/[٦۶]/g, '6')
    .replace(/[٧۷]/g, '7')
    .replace(/[٨۸]/g, '8')
    .replace(/[٩۹]/g, '9')
    .trim()

  // "last" sentinel
  if (/^(الأخير|الاخير|آخر|اخر|last)$/i.test(normalized)) {
    return -1
  }

  // Standalone integer 1–20
  const match = normalized.match(/^(\d{1,2})$/)
  if (match) {
    const n = parseInt(match[1], 10)
    if (n >= 1 && n <= 20) return n
  }

  return null
}
