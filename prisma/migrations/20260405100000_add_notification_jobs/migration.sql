-- CreateEnum
CREATE TYPE "NotificationJobStatus" AS ENUM ('pending', 'queued', 'sent', 'failed');

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "destination" TEXT NOT NULL,
    "messageBody" TEXT NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "status" "NotificationJobStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_jobs_reminderId_channel_destination_key" ON "notification_jobs"("reminderId", "channel", "destination");

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
