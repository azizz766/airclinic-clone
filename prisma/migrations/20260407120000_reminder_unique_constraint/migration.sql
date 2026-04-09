-- Cleanup: Delete duplicate reminders keeping only the oldest (safest) for each (appointmentId, type, scheduledAt)
-- This ensures the constraint won't fail if duplicates exist pre-migration
DELETE FROM "reminders" r1 WHERE r1.id IN (
  SELECT r2.id FROM "reminders" r2
  INNER JOIN (
    SELECT "appointmentId", "type", "scheduledAt", MIN(id) as keep_id
    FROM "reminders"
    GROUP BY "appointmentId", "type", "scheduledAt"
    HAVING COUNT(*) > 1
  ) dupes ON r2."appointmentId" = dupes."appointmentId"
    AND r2."type" = dupes."type"
    AND r2."scheduledAt" = dupes."scheduledAt"
    AND r2.id != dupes.keep_id
);

-- Add unique constraint to prevent future duplicates per appointment/type/scheduledAt
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_appointmentId_type_scheduledAt_key" UNIQUE ("appointmentId", "type", "scheduledAt");

