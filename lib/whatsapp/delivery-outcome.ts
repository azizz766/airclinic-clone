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

const MAX_ATTEMPTS = 3
const BACKOFF_MS = [0, 2000, 5000]

export async function sendWhatsAppWithOutcomeLogging(params: {
  to: string
  body: string
  meta: DeliveryOutcomeMeta
  patientContext?: OutboundPatientContext
}) {
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]))
    }

    try {
      const result = await sendWhatsAppMessage(params.to, params.body)
      const mocked = Boolean((result as { mocked?: boolean }).mocked)

      console.info('[DELIVERY OUTCOME]', {
        action: params.meta.action,
        success: true,
        attempt: attempt + 1,
        mocked,
        to: params.to,
        sid: result.sid,
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
              attempt: attempt + 1,
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
      lastError = error
      console.error('[DELIVERY OUTCOME] attempt-failed', {
        action: params.meta.action,
        attempt: attempt + 1,
        maxAttempts: MAX_ATTEMPTS,
        to: params.to,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // All attempts exhausted — log final failure
  console.error('[DELIVERY OUTCOME] all-attempts-failed', {
    action: params.meta.action,
    to: params.to,
    maxAttempts: MAX_ATTEMPTS,
  })

  if (params.meta.clinicId) {
    await prisma.escalationLog.create({
      data: {
        clinicId: params.meta.clinicId,
        entityType: params.meta.entityType ?? 'system',
        entityId: params.meta.entityId ?? params.to,
        eventType: 'whatsapp_delivery_outcome',
        severity: 'error',
        message: `WhatsApp delivery failed after ${MAX_ATTEMPTS} attempts (${params.meta.action}).`,
        metadata: {
          success: false,
          action: params.meta.action,
          to: params.to,
          attempts: MAX_ATTEMPTS,
          messageBody: params.body,
          error: lastError instanceof Error ? lastError.message : String(lastError),
        },
      },
    }).catch(() => {}) // never let logging crash the caller
  }

  throw lastError
}
