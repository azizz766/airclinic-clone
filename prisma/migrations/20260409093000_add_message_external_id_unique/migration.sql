-- Add database-level idempotency protection for inbound provider message IDs.
-- PostgreSQL unique indexes allow multiple NULL values by default.
CREATE UNIQUE INDEX "messages_externalId_key" ON "messages"("externalId");
