import { prisma } from '@/lib/prisma'
import { ConversationState } from '@/lib/prisma-client/enums'

type InquirySession = {
  slotServiceId: string | null
  currentState: ConversationState
}

const STATE_REPROMPTS: Partial<Record<ConversationState, string>> = {
  SLOT_COLLECTION_SERVICE: 'اختر الخدمة برقمها من القائمة.',
  SLOT_COLLECTION_DATE: 'متى يناسبك؟',
  SLOT_COLLECTION_TIME: 'اختر رقم الموعد المناسب.',
  SLOT_COLLECTION_PATIENT_NAME: 'ممكن اسمك الكامل؟',
  SLOT_COLLECTION_PATIENT_DOB: 'ما تاريخ ميلادك؟\nمثال: 15/03/1990 أو 1990-03-15',
  SLOT_COLLECTION_PHONE_CONFIRM: 'هل رقم جوالك صحيح؟ اكتب *نعم* للتأكيد.',
  CONFIRMATION_PENDING: 'اكتب *نعم* لتأكيد الحجز أو *لا* لتعديل البيانات.',
}

export async function handleInquiryInterrupt(
  session: InquirySession,
  intent: 'inquiry_price' | 'inquiry_doctor',
): Promise<{ reply: string }> {
  let inquiryReply: string

  if (intent === 'inquiry_price') {
    if (session.slotServiceId) {
      const service = await prisma.service.findUnique({
        where: { id: session.slotServiceId },
        select: { name: true, price: true },
      })
      inquiryReply =
        service?.price != null
          ? `سعر ${service.name}: ${service.price} ريال`
          : 'أي خدمة تقصد؟'
    } else {
      inquiryReply = 'أي خدمة تقصد؟'
    }
  } else {
    inquiryReply = 'أي دكتور؟'
  }

  const reprompt = STATE_REPROMPTS[session.currentState]
  return { reply: reprompt ? `${inquiryReply}\n\n${reprompt}` : inquiryReply }
}
