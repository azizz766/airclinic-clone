import { SYSTEM_PROMPT } from './system-prompt'
import { validatePayload } from './payload-validator'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function generateReply(payload: unknown): Promise<string> {
  // 1) Validate payload
  const parsed = validatePayload(payload)

  if (!parsed.success) {
    console.error('[response-generator] invalid payload', parsed.error)
    return fallback()
  }

  const safePayload = parsed.data
  const ctx = safePayload.context

  // Deterministic replies for booking-flow steps — no LLM, no guardrails.
  switch (safePayload.action) {
    case 'ask_for_service':
      return ctx.customText
        ? `هذه الخدمات المتاحة:\n\n${ctx.customText}\n\nاختر رقم الخدمة.`
        : 'هذه الخدمات المتاحة.\n\nاختر رقم الخدمة.'
    case 'ask_for_date':
      return 'متى يناسبك الموعد؟'
    case 'show_slots':
      return ctx.slotsText
        ? `هذه المواعيد المتاحة:\n\n${ctx.slotsText}\n\nاختر رقم الموعد.`
        : 'للأسف ما فيه مواعيد متاحة.\n\nاختر وقت آخر.'
    case 'confirm_details':
      return ctx.summaryText
        ? `تأكد من بيانات الحجز:\n\n${ctx.summaryText}\n\nاكتب نعم للتأكيد أو لا للتعديل.`
        : 'اكتب نعم للتأكيد أو لا للتعديل.'
  }

  // 2) Pre-LLM guardrails
  if (
    safePayload.action === 'confirm_booking' &&
    (!safePayload.context.dateLabel ||
      !safePayload.context.timeLabel ||
      !safePayload.context.serviceName)
  ) {
    return fallback()
  }

  try {
    // 3) Call LLM
    const res = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 200,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(safePayload),
        },
      ],
    })

    const text =
      res.content[0].type === 'text'
        ? res.content[0].text.trim()
        : ''

    // 4) Post-LLM guardrails
    if (!text || text.length < 2) return fallback()
    if (text.includes('{') || text.includes('}')) return fallback()
    if (text.toLowerCase().includes('json')) return fallback()
    // Count only non-empty lines — LLM Arabic responses often include blank separator lines.
    // Original `> 3` was too tight: a 3-content-line response with 1 blank line = 4 split parts → fallback.
    const contentLines = text.split('\n').filter(l => l.trim() !== '').length
    if (contentLines > 5) return fallback()

    return text
  } catch (err) {
    console.error('[response-generator] LLM failed', err)
    return fallback()
  }
}

function fallback(): string {
  return 'المدخل غير واضح. حاول مرة ثانية.'
}