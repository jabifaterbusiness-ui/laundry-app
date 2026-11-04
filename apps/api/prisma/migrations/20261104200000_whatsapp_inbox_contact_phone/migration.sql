ALTER TABLE "whatsapp_webhook_events"
ADD COLUMN "contactPhone" TEXT;

CREATE INDEX "whatsapp_webhook_events_businessId_contactPhone_eventType_receivedAt_idx"
ON "whatsapp_webhook_events"("businessId", "contactPhone", "eventType", "receivedAt");
