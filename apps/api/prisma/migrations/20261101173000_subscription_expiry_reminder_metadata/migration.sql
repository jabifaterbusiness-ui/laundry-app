ALTER TABLE "business_inbox_messages"
  ADD COLUMN "notificationKey" TEXT,
  ADD COLUMN "sourceSubscriptionId" TEXT;

CREATE UNIQUE INDEX "business_inbox_messages_notificationKey_key"
  ON "business_inbox_messages"("notificationKey");
CREATE INDEX "business_inbox_messages_sourceSubscriptionId_readAt_idx"
  ON "business_inbox_messages"("sourceSubscriptionId", "readAt");
