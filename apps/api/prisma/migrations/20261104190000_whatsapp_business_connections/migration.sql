CREATE TABLE "whatsapp_business_connections" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhoneNumber" TEXT,
    "verifiedName" TEXT,
    "encryptedAccessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_business_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_webhook_events" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "connectionId" TEXT,
    "eventKey" TEXT NOT NULL,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "providerMessageId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_business_connections_businessId_key" ON "whatsapp_business_connections"("businessId");
CREATE UNIQUE INDEX "whatsapp_business_connections_phoneNumberId_key" ON "whatsapp_business_connections"("phoneNumberId");
CREATE INDEX "whatsapp_business_connections_wabaId_idx" ON "whatsapp_business_connections"("wabaId");
CREATE INDEX "whatsapp_business_connections_status_updatedAt_idx" ON "whatsapp_business_connections"("status", "updatedAt");
CREATE UNIQUE INDEX "whatsapp_webhook_events_eventKey_key" ON "whatsapp_webhook_events"("eventKey");
CREATE INDEX "whatsapp_webhook_events_businessId_receivedAt_idx" ON "whatsapp_webhook_events"("businessId", "receivedAt");
CREATE INDEX "whatsapp_webhook_events_connectionId_receivedAt_idx" ON "whatsapp_webhook_events"("connectionId", "receivedAt");
CREATE INDEX "whatsapp_webhook_events_providerMessageId_idx" ON "whatsapp_webhook_events"("providerMessageId");
CREATE INDEX "whatsapp_webhook_events_processedAt_receivedAt_idx" ON "whatsapp_webhook_events"("processedAt", "receivedAt");

ALTER TABLE "whatsapp_business_connections" ADD CONSTRAINT "whatsapp_business_connections_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_webhook_events" ADD CONSTRAINT "whatsapp_webhook_events_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_webhook_events" ADD CONSTRAINT "whatsapp_webhook_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_business_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
