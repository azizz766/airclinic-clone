import { ConversationState } from '@/lib/prisma-client/enums'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5'

type MessageHistory = {
  role: string
  content: string
}

type SlotResult =
  | { success: true; value: string; inputTokens: number; outputTokens: number }
  | { success: false; inputTokens: number; outputTokens: number }

const SLOT_TOOLS: Record<string, object> = {
  SLOT_COLLECTION_SERVICE: {
    name: 'extract_service',
    description: 'Extract the medical service or specialty the patient is requesting',
    input_schema: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          description: 'The service name in the patient original language',
        },
      },
      required: ['service'],
    },
  },
  SLOT_COLLECTION_DATE: {
    name: 'extract_date',
    description: 'Extract the preferred appointment date from the message',
    input_schema: {
      type: 'object',
      properties: {
        date_iso: {
          type: 'string',
          description: 'ISO date string YYYY-MM-DD',
        },
      },
      required: ['date_iso'],
    },
  },
  SLOT_COLLECTION_TIME: {
    name: 'extract_time',
    description: 'Extract which time slot number the patient selected',
    input_schema: {
      type: 'object',
      properties: {
        slot_selection: {
          type: 'string',
          description: 'The number or label the patient selected',
        },
      },
      required: ['slot_selection'],
    },
  },
  SLOT_COLLECTION_PATIENT_NAME: {
    name: 'extract_name',
    description: 'Extract the full patient name',
    input_schema: {
      type: 'object',
      properties: {
        full_name: {
          type: 'string',
          description: 'Full name as provided by the patient',
        },
      },
      required: ['full_name'],
    },
  },
  SLOT_COLLECTION_PATIENT_DOB: {
    name: 'extract_dob',
    description: 'Extract the patient date of birth',
    input_schema: {
      type: 'object',
      properties: {
        dob_iso: {
          type: 'string',
          description: 'ISO date string YYYY-MM-DD',
        },
      },
      required: ['dob_iso'],
    },
  },
  SLOT_COLLECTION_PHONE_CONFIRM: {
    name: 'extract_phone_confirmation',
    description: 'Determine if patient confirmed their phone number or provided a new one',
    input_schema: {
      type: 'object',
      properties: {
        confirmed: {
          type: 'boolean',
          description: 'True if patient confirmed existing number',
        },
        alternate_phone: {
          type: 'string',
          description: 'New phone number if patient provided one, otherwise null',
        },
      },
      required: ['confirmed'],
    },
  },
}

const TOOL_OUTPUT_KEY: Record<string, string> = {
  extract_service:              'service',
  extract_date:                 'date_iso',
  extract_time:                 'slot_selection',
  extract_name:                 'full_name',
  extract_dob:                  'dob_iso',
  extract_phone_confirmation:   'confirmed',
}

export async function extractSlot(
  state: ConversationState,
  history: MessageHistory[],
  latestMessage: string
): Promise<SlotResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const tool = SLOT_TOOLS[state]
  if (!tool) return { success: false, inputTokens: 0, outputTokens: 0 }

  const systemPrompt = [
    'You are a clinic booking assistant.',
    'The patient is communicating in Arabic or English.',
    'Extract exactly the requested slot from the latest patient message.',
    'If the information is not present or unclear, do not guess.',
    'Always call the provided tool — never respond with plain text.',
  ].join('\n')

  const messages = [
    ...history.map((m) => ({
      role: m.role === 'patient' ? 'user' : 'assistant',
      content: m.content,
    })),
    { role: 'user', content: latestMessage },
  ]

  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 256,
      temperature: 0,
      system: systemPrompt,
      tools: [tool],
      tool_choice: { type: 'any' },
      messages,
    }),
  })

  if (!response.ok) {
    return { success: false, inputTokens: 0, outputTokens: 0 }
  }

  const data = await response.json()
  const inputTokens: number = data.usage?.input_tokens ?? 0
  const outputTokens: number = data.usage?.output_tokens ?? 0

  const toolUse = data.content?.find(
    (block: { type: string }) => block.type === 'tool_use'
  )

  if (!toolUse?.input) {
    return { success: false, inputTokens, outputTokens }
  }

  const toolName: string = toolUse.name
  const outputKey = TOOL_OUTPUT_KEY[toolName]
  const extracted = toolUse.input[outputKey]

  if (extracted === undefined || extracted === null || extracted === '') {
    return { success: false, inputTokens, outputTokens }
  }

  return { success: true, value: String(extracted), inputTokens, outputTokens }
}
