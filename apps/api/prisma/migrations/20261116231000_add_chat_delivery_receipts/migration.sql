-- Track the latest message fetched by each active conversation participant.
-- This supports explicit delivered and seen indicators without storing per-message receipts.
ALTER TABLE "chat_participants"
  ADD COLUMN "lastDeliveredMessageId" TEXT,
  ADD COLUMN "lastDeliveredAt" TIMESTAMP(3);
