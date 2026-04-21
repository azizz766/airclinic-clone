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
    console.log('[DEBUG GENERATE REPLY] raw LLM text:', JSON.stringify(text))
    if (!text || text.length < 2) {
      console.log('[DEBUG GENERATE REPLY] fallback: text too short')
      return fallback()
    }
    if (text.includes('{') || text.includes('}')) {
      console.log('[DEBUG GENERATE REPLY] fallback: contains braces')
      return fallback()
    }
    if (text.toLowerCase().includes('json')) {
      console.log('[DEBUG GENERATE REPLY] fallback: contains json keyword')
      return fallback()
    }
    // Count only non-empty lines — LLM Arabic responses often include blank separator lines.
    // Original `> 3` was too tight: a 3-content-line response with 1 blank line = 4 split parts → fallback.
    const contentLines = text.split('\n').filter(l => l.trim() !== '').length
    if (contentLines > 5) {
      console.log('[DEBUG GENERATE REPLY] fallback: too many content lines', contentLines)
      return fallback()
    }

    console.log('[DEBUG GENERATE REPLY] reply accepted, contentLines:', contentLines)
    return text
  } catch (err) {
    console.error('[response-generator] LLM failed', err)
    return fallback()
  }
}

function fallback(): string {
  return 'حصل خطأ بسيط، خلني أتأكد لك وأرجع لك الآن.'
}