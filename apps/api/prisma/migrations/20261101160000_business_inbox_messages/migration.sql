CREATE TABLE "business_inbox_messages" (
  "id" TEXT NOT NULL,
  "broadcastId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "displayDurationMinutes" INTEGER NOT NULL DEFAULT 10,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "createdByPlatformAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_inbox_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "business_inbox_messages_businessId_userId_publishedAt_idx"
  ON "business_inbox_messages"("businessId", "userId", "publishedAt");
CREATE INDEX "business_inbox_messages_userId_readAt_publishedAt_idx"
  ON "business_inbox_messages"("userId", "readAt", "publishedAt");
CREATE INDEX "business_inbox_messages_broadcastId_idx"
  ON "business_inbox_messages"("broadcastId");

ALTER TABLE "business_inbox_messages"
  ADD CONSTRAINT "business_inbox_messages_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_inbox_messages"
  ADD CONSTRAINT "business_inbox_messages_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
