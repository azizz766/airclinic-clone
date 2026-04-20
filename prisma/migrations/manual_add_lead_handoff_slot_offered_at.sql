-- AlterTable
ALTER TABLE "conversation_sessions" ADD COLUMN "handoffActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "slotOfferedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientPhone" TEXT NOT NULL,
    "patientName" TEXT,
    "serviceInterest" TEXT,
    "datePreference" TEXT,
    "dropReason" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_clinicId_createdAt_idx" ON "leads"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "leads_patientPhone_idx" ON "leads"("patientPhone");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
