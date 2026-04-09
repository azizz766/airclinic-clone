-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM (
  'IDLE',
  'LANGUAGE_DETECTION',
  'INTENT_DISAMBIGUATION',
  'SLOT_COLLECTION_SERVICE',
  'SLOT_COLLECTION_DATE',
  'SLOT_COLLECTION_TIME',
  'SLOT_COLLECTION_PATIENT_NAME',
  'SLOT_COLLECTION_PATIENT_DOB',
  'SLOT_COLLECTION_PHONE_CONFIRM',
  'CONFIRMATION_PENDING',
  'BOOKING_PROCESSING',
  'BOOKING_CONFIRMED',
  'BOOKING_FAILED',
  'CANCELLATION_PENDING',
  'CANCELLATION_CONFIRMED',
  'HUMAN_ESCALATION_PENDING',
  'HUMAN_ESCALATION_ACTIVE',
  'EXPIRED',
  'CORRUPTED'
);

-- CreateEnum
CREATE TYPE "DetectedLanguage" AS ENUM ('AR', 'EN', 'AR_EN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EscalationReason" AS ENUM (
  'USER_REQUESTED',
  'MAX_RETRIES_EXCEEDED',
  'INVALID_INPUT_LOOP',
  'BOOKING_FAILED_UNRECOVERABLE',
  'CORRUPTED_STATE'
);

-- AlterEnum: Add 'assistant' value to SenderType
ALTER TYPE "SenderType" ADD VALUE IF NOT EXISTS 'assistant';

-- AlterTable: Add twilioPhoneNumber to clinics
ALTER TABLE "clinics" ADD COLUMN "twilioPhoneNumber" TEXT;

-- CreateTable: available_slots
CREATE TABLE "available_slots" (
  "id"              TEXT        NOT NULL,
  "clinicId"        TEXT        NOT NULL,
  "serviceId"       TEXT        NOT NULL,
  "startTime"       TIMESTAMP(3) NOT NULL,
  "endTime"         TIMESTAMP(3) NOT NULL,
  "isHeld"          BOOLEAN     NOT NULL DEFAULT false,
  "heldBySessionId" TEXT,
  "heldAt"          TIMESTAMP(3),
  "isBooked"        BOOLEAN     NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "available_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable: conversation_sessions
CREATE TABLE "conversation_sessions" (
  "id"                  TEXT               NOT NULL,
  "clinicId"            TEXT               NOT NULL,
  "phoneNumber"         TEXT               NOT NULL,
  "currentState"        "ConversationState" NOT NULL DEFAULT 'IDLE',
  "previousState"       "ConversationState",
  "slotServiceId"       TEXT,
  "slotDate"            TIMESTAMP(3),
  "slotTimeId"          TEXT,
  "slotPatientName"     TEXT,
  "slotPatientDob"      TIMESTAMP(3),
  "slotPhoneConfirmed"  TEXT,
  "detectedLanguage"    "DetectedLanguage"  NOT NULL DEFAULT 'UNKNOWN',
  "retryCount"          INTEGER            NOT NULL DEFAULT 0,
  "maxRetriesPerState"  INTEGER            NOT NULL DEFAULT 3,
  "invalidInputCount"   INTEGER            NOT NULL DEFAULT 0,
  "ambiguousIntents"    JSONB,
  "escalationReason"    "EscalationReason",
  "escalationClaimedBy" TEXT,
  "escalationClaimedAt" TIMESTAMP(3),
  "bookingId"           TEXT,
  "expiresAt"           TIMESTAMP(3)       NOT NULL,
  "createdAt"           TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3)       NOT NULL,
  "resolvedAt"          TIMESTAMP(3),

  CONSTRAINT "conversation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: conversation_messages
CREATE TABLE "conversation_messages" (
  "id"                 TEXT               NOT NULL,
  "sessionId"          TEXT               NOT NULL,
  "clinicId"           TEXT               NOT NULL,
  "role"               "SenderType"       NOT NULL,
  "channel"            "Channel"          NOT NULL,
  "content"            TEXT               NOT NULL,
  "contentNormalized"  TEXT,
  "twilioMessageSid"   TEXT,
  "twilioStatus"       TEXT,
  "claudeModel"        TEXT,
  "claudeInputTokens"  INTEGER,
  "claudeOutputTokens" INTEGER,
  "claudeToolsUsed"    JSONB,
  "sessionStateAtSend" "ConversationState" NOT NULL,
  "createdAt"          TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: state_transition_logs
CREATE TABLE "state_transition_logs" (
  "id"             TEXT               NOT NULL,
  "sessionId"      TEXT               NOT NULL,
  "clinicId"       TEXT               NOT NULL,
  "fromState"      "ConversationState" NOT NULL,
  "toState"        "ConversationState" NOT NULL,
  "triggerType"    TEXT               NOT NULL,
  "triggerPayload" JSONB,
  "triggeredBy"    TEXT,
  "createdAt"      TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "state_transition_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: available_slots
CREATE INDEX "available_slots_clinicId_serviceId_startTime_idx" ON "available_slots"("clinicId", "serviceId", "startTime");
CREATE INDEX "available_slots_isHeld_heldAt_idx" ON "available_slots"("isHeld", "heldAt");

-- CreateIndex: conversation_sessions
CREATE UNIQUE INDEX "conversation_sessions_phoneNumber_clinicId_key" ON "conversation_sessions"("phoneNumber", "clinicId");
CREATE INDEX "conversation_sessions_clinicId_currentState_idx" ON "conversation_sessions"("clinicId", "currentState");
CREATE INDEX "conversation_sessions_expiresAt_idx" ON "conversation_sessions"("expiresAt");
CREATE INDEX "conversation_sessions_phoneNumber_idx" ON "conversation_sessions"("phoneNumber");

-- CreateIndex: conversation_messages
CREATE INDEX "conversation_messages_sessionId_createdAt_idx" ON "conversation_messages"("sessionId", "createdAt");
CREATE INDEX "conversation_messages_twilioMessageSid_idx" ON "conversation_messages"("twilioMessageSid");
CREATE INDEX "conversation_messages_clinicId_createdAt_idx" ON "conversation_messages"("clinicId", "createdAt");

-- CreateIndex: state_transition_logs
CREATE INDEX "state_transition_logs_sessionId_createdAt_idx" ON "state_transition_logs"("sessionId", "createdAt");
CREATE INDEX "state_transition_logs_clinicId_toState_idx" ON "state_transition_logs"("clinicId", "toState");

-- AddForeignKey: available_slots
ALTER TABLE "available_slots" ADD CONSTRAINT "available_slots_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "available_slots" ADD CONSTRAINT "available_slots_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: conversation_sessions
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_slotServiceId_fkey"
  FOREIGN KEY ("slotServiceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_slotTimeId_fkey"
  FOREIGN KEY ("slotTimeId") REFERENCES "available_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: conversation_messages
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "conversation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: state_transition_logs
ALTER TABLE "state_transition_logs" ADD CONSTRAINT "state_transition_logs_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "conversation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
