-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_createdBy_fkey";

-- AlterTable
ALTER TABLE "appointments" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
