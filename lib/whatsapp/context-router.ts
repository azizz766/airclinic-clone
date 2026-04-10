import { ConversationState } from '@/lib/prisma-client/enums'

type MessageHistory = {
  role: string
  content: string
}

export type RoutingDecision = {
  intent: string
  extractedValue: string | null
  confidence: 'high' | 'medium' | 'low'
  shouldContinueFlow: boolean
  reasoning: string
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5'

const FSM_STATE_DESCRIPTIONS: Record<string, string> = {
  IDLE: 'المريض لم يبدأ أي طلب بعد',
  LANGUAGE_DETECTION: 'جاري تحديد لغة المريض',
  INTENT_DISAMBIGUATION: 'طلب المريض غير واضح — ننتظر توضيحاً',
  SLOT_COLLECTION_SERVICE: 'المريض يختار الخدمة الطبية المطلوبة',
  SLOT_COLLECTION_DATE: 'تم اختيار الخدمة — ننتظر التاريخ أو الوقت المفضل',
  SLOT_COLLECTION_TIME: 'تم تحديد التاريخ — ننتظر اختيار وقت محدد من القائمة',
  SLOT_COLLECTION_PATIENT_NAME: 'ننتظر اسم المريض الكامل',
  SLOT_COLLECTION_PATIENT_DOB: 'ننتظر تاريخ ميلاد المريض',
  SLOT_COLLECTION_PHONE_CONFIRM: 'ننتظر تأكيد رقم الجوال',
  CONFIRMATION_PENDING: 'تم جمع كل البيانات — ننتظر تأكيد الحجز النهائي',
  BOOKING_CONFIRMED: 'تم الحجز بنجاح',
  BOOKING_FAILED: 'فشل الحجز',
  CANCELLATION_PENDING: 'المريض طلب الإلغاء — ننتظر التأكيد',
  HUMAN_ESCALATION_PENDING: 'تم تحويل المحادثة لموظف',
  HUMAN_ESCALATION_ACTIVE: 'موظف بشري يتابع',
  EXPIRED: 'انتهت الجلسة',
  CORRUPTED: 'حدث خطأ',
}

const ROUTING_TOOL = {
  name: 'route_message',
  description: 'حدد الإجراء التالي بناءً على رسالة المريض وسياق المحادثة',
  input_schema: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: [
          'continue_flow',
          'new_booking',
          'cancel_booking',
          'reschedule',
          'availability_check',
          'affirm',
          'deny',
          'inquiry',
          'escalate',
          'unknown',
        ],
      },
      extracted_value: {
        type: 'string',
        description: 'القيمة المستخرجة من الرسالة',
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
      },
      should_continue_flow: {
        type: 'boolean',
      },
      reasoning: {
        type: 'string',
      },
    },
    required: ['intent', 'confidence', 'should_continue_flow', 'reasoning'],
  },
}

function buildSystemPrompt(
  fsmState: ConversationState,
  collectedSlots: Record<string, string | null>
): string {
  const stateDesc = FSM_STATE_DESCRIPTIONS[fsmState] ?? fsmState
  const slotsText =
    Object.entries(collectedSlots)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n') || '- لا يوجد بيانات مجمعة بعد'

  return `
أنت مساعد ذكي لعيادة طبية يفهم اللهجة العربية السعودية والخليجية.

مهمتك: تحليل رسالة المريض بناءً على سياق المحادثة الكاملة وتحديد الخطوة التالية.

قواعد مهمة:
- المريض إنسان عادي — كلامه قد يكون فيه أخطاء إملائية أو غير رسمي
- افهم القصد من السياق، مو من الكلمة الحرفية فقط
- إذا المريض في منتصف حجز موعد، استمر في نفس الـ flow
- لا تبدأ من الأول إلا إذا المريض طلب ذلك صراحةً
- "ايه"، "نعم"، "زين"، "تمام"، "اوك"، "يلا" = موافقة
- "لا"، "ما ابغى"، "غير" = رفض أو تغيير
- الأخطاء الإملائية البسيطة لا تغير المعنى

الحالة الحالية للمحادثة: ${stateDesc}

البيانات المجمعة حتى الآن:
${slotsText}
`.trim()
}

export async function routeMessageWithContext(
  latestMessage: string,
  history: MessageHistory[],
  fsmState: ConversationState,
  collectedSlots: Record<string, string | null>
): Promise<RoutingDecision> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const systemPrompt = buildSystemPrompt(fsmState, collectedSlots)

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
      max_tokens: 512,
      temperature: 0,
      system: systemPrompt,
      tools: [ROUTING_TOOL],
      tool_choice: { type: 'tool', name: 'route_message' },
      messages,
    }),
  })

  if (!response.ok) {
    return {
      intent: 'continue_flow',
      extractedValue: latestMessage,
      confidence: 'low',
      shouldContinueFlow: true,
      reasoning: 'API error — defaulting to continue flow',
    }
  }

  const data = await response.json()
  const toolUse = data.content?.find(
    (b: { type: string }) => b.type === 'tool_use'
  )

  if (!toolUse?.input) {
    return {
      intent: 'unknown',
      extractedValue: null,
      confidence: 'low',
      shouldContinueFlow: true,
      reasoning: 'No tool response',
    }
  }

  const input = toolUse.input
  return {
    intent: input.intent ?? 'unknown',
    extractedValue: input.extracted_value ?? null,
    confidence: input.confidence ?? 'low',
    shouldContinueFlow: input.should_continue_flow ?? true,
    reasoning: input.reasoning ?? '',
  }
}
