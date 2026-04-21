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
    if (!text || text.length < 2) return fallback()
    if (text.includes('{') || text.includes('}')) return fallback()
    if (text.toLowerCase().includes('json')) return fallback()
    if (text.split('\n').length > 3) return fallback()

    return text
  } catch (err) {
    console.error('[response-generator] LLM failed', err)
    return fallback()
  }
}

function fallback(): string {
  return 'حصل خطأ بسيط، خلني أتأكد لك وأرجع لك الآن.'
}