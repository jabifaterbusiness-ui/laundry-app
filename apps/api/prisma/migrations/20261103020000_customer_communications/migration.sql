CREATE TABLE "announcement_campaigns" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "audience" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "announcement_campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "announcement_campaigns_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "announcement_campaigns_businessId_createdAt_idx" ON "announcement_campaigns"("businessId", "createdAt");
CREATE INDEX "announcement_campaigns_businessId_status_idx" ON "announcement_campaigns"("businessId", "status");

CREATE TABLE "announcement_recipients" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "announcement_recipients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "announcement_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "announcement_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "announcement_recipients_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "announcement_recipients_campaignId_customerId_key" ON "announcement_recipients"("campaignId", "customerId");
CREATE INDEX "announcement_recipients_customerId_idx" ON "announcement_recipients"("customerId");

CREATE TABLE "communication_deliveries" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "orderId" TEXT,
  "campaignId" TEXT,
  "channel" TEXT NOT NULL,
  "messageType" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "communication_deliveries_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "communication_deliveries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "communication_deliveries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "communication_deliveries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "announcement_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "communication_deliveries_dedupeKey_key" ON "communication_deliveries"("dedupeKey");
CREATE INDEX "communication_deliveries_businessId_status_createdAt_idx" ON "communication_deliveries"("businessId", "status", "createdAt");
CREATE INDEX "communication_deliveries_customerId_createdAt_idx" ON "communication_deliveries"("customerId", "createdAt");
CREATE INDEX "communication_deliveries_orderId_messageType_idx" ON "communication_deliveries"("orderId", "messageType");
CREATE INDEX "communication_deliveries_campaignId_channel_status_idx" ON "communication_deliveries"("campaignId", "channel", "status");

CREATE TABLE "order_status_notification_rules" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
  "whatsappMessage" TEXT,
  "emailSubject" TEXT,
  "emailMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_status_notification_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_status_notification_rules_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "order_status_notification_rules_businessId_status_key" ON "order_status_notification_rules"("businessId", "status");
CREATE INDEX "order_status_notification_rules_businessId_enabled_idx" ON "order_status_notification_rules"("businessId", "enabled");

CREATE TABLE "order_status_notification_deliveries" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_status_notification_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_status_notification_deliveries_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_status_notification_deliveries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_status_notification_deliveries_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "order_status_notification_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_status_notification_deliveries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "order_status_notification_deliveries_orderId_ruleId_status_key" ON "order_status_notification_deliveries"("orderId", "ruleId", "status");
CREATE INDEX "order_status_notification_deliveries_businessId_deliveryStatus_createdAt_idx" ON "order_status_notification_deliveries"("businessId", "deliveryStatus", "createdAt");
CREATE INDEX "order_status_notification_deliveries_customerId_createdAt_idx" ON "order_status_notification_deliveries"("customerId", "createdAt");

CREATE TABLE "unpicked_order_reminder_configs" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "thresholdMonths" INTEGER NOT NULL DEFAULT 2,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "unpicked_order_reminder_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "unpicked_order_reminder_configs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "unpicked_order_reminder_configs_businessId_key" ON "unpicked_order_reminder_configs"("businessId");
