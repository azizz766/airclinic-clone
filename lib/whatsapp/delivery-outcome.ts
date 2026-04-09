import { prisma } from '@/lib/prisma'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { persistOutboundMessage } from '@/lib/whatsapp/persist-message'

type DeliveryOutcomeMeta = {
  clinicId?: string
  entityType?: 'appointment' | 'patient' | 'conversation' | 'system'
  entityId?: string
  action: string
}

type OutboundPatientContext = {
  clinicId: string
  patientId: string
  patientPhone: string
}

export async function sendWhatsAppWithOutcomeLogging(params: {
  to: string
  body: string
  meta: DeliveryOutcomeMeta
  patientContext?: OutboundPatientContext
}) {
  try {
    const result = await sendWhatsAppMessage(params.to, params.body)
    const mocked = Boolean((result as { mocked?: boolean }).mocked)

    console.info('[DELIVERY OUTCOME]', {
      action: params.meta.action,
      success: true,
      mocked,
      to: params.to,
      sid: result.sid,
      messageBody: params.body,
      clinicId: params.meta.clinicId ?? null,
      entityType: params.meta.entityType ?? null,
      entityId: params.meta.entityId ?? null,
    })

    if (params.meta.clinicId) {
      await prisma.escalationLog.create({
        data: {
          clinicId: params.meta.clinicId,
          entityType: params.meta.entityType ?? 'system',
          entityId: params.meta.entityId ?? params.to,
          eventType: 'whatsapp_delivery_outcome',
          severity: 'info',
          message: `WhatsApp delivery success (${params.meta.action}).`,
          metadata: {
            success: true,
            mocked,
            sid: result.sid,
            action: params.meta.action,
            to: params.to,
            messageBody: params.body,
          },
        },
      })
    }

    if (params.patientContext) {
      try {
        await persistOutboundMessage({
          clinicId: params.patientContext.clinicId,
          patientId: params.patientContext.patientId,
          patientPhone: params.patientContext.patientPhone,
          content: params.body,
          externalId: result.sid,
        })
      } catch (persistError) {
        console.error('[DELIVERY OUTCOME] outbound-persist-failed', {
          action: params.meta.action,
          to: params.to,
          persistError,
        })
      }
    }

    return result
  } catch (error) {
    console.error('[DELIVERY OUTCOME]', {
      action: params.meta.action,
      success: false,
      mocked: false,
      to: params.to,
      messageBody: params.body,
      clinicId: params.meta.clinicId ?? null,
      entityType: params.meta.entityType ?? null,
      entityId: params.meta.entityId ?? null,
      error,
    })

    if (params.meta.clinicId) {
      await prisma.escalationLog.create({
        data: {
          clinicId: params.meta.clinicId,
          entityType: params.meta.entityType ?? 'system',
          entityId: params.meta.entityId ?? params.to,
          eventType: 'whatsapp_delivery_outcome',
          severity: 'error',
          message: `WhatsApp delivery failed (${params.meta.action}).`,
          metadata: {
            success: false,
            mocked: false,
            action: params.meta.action,
            to: params.to,
            messageBody: params.body,
            error: error instanceof Error ? error.message : String(error),
          },
        },
      })
    }

    throw error
  }
}
