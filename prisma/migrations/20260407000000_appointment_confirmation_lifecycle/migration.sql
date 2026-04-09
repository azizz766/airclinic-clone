-- Extend appointment status lifecycle for confirmation/reminder flow
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'confirmation_pending';
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'rescheduled';

-- Add minimal tracking fields for confirmation and reminder sending
ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "confirmationRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reminder24hSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reminder3hSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastReminderType" TEXT,
  ADD COLUMN IF NOT EXISTS "lastPatientMessageAt" TIMESTAMP(3);
