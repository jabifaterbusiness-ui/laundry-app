ALTER TABLE "whatsapp_webhook_events"
ADD COLUMN "contactPhone" TEXT;

CREATE INDEX "wa_events_business_contact_type_received_idx"
ON "whatsapp_webhook_events"("businessId", "contactPhone", "eventType", "receivedAt");
