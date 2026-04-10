import { ConversationState } from '@/lib/prisma-client/enums'

type RouteDecision =
  | { action: 'fsm_slot_input' }      // patient is mid-flow, treat as slot input
  | { action: 'fsm_confirmation' }    // patient is confirming/denying
  | { action: 'ai_intent' }           // no active session, let AI decide
  | { action: 'human_suppressed' }    // human is active, suppress AI

const SLOT_COLLECTION_STATES: ConversationState[] = [
  'SLOT_COLLECTION_SERVICE',
  'SLOT_COLLECTION_DATE',
  'SLOT_COLLECTION_TIME',
  'SLOT_COLLECTION_PATIENT_NAME',
  'SLOT_COLLECTION_PATIENT_DOB',
  'SLOT_COLLECTION_PHONE_CONFIRM',
]

const CONFIRMATION_STATES: ConversationState[] = [
  'CONFIRMATION_PENDING',
  'CANCELLATION_PENDING',
]

export function routeMessage(
  fsmState: ConversationState | null,
  isHumanActive: boolean
): RouteDecision {
  if (isHumanActive) {
    return { action: 'human_suppressed' }
  }

  if (!fsmState) {
    return { action: 'ai_intent' }
  }

  if (SLOT_COLLECTION_STATES.includes(fsmState)) {
    return { action: 'fsm_slot_input' }
  }

  if (CONFIRMATION_STATES.includes(fsmState)) {
    return { action: 'fsm_confirmation' }
  }

  return { action: 'ai_intent' }
}
