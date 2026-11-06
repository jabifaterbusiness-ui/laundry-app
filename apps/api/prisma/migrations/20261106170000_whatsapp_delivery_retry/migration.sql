ALTER TABLE "communication_deliveries"
  ADD COLUMN "retryPayload" JSONB,
  ADD COLUMN "retryOfId" TEXT,
  ADD COLUMN "retryAttempt" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "communication_deliveries_retryOfId_retryAttempt_idx"
  ON "communication_deliveries"("retryOfId", "retryAttempt");

ALTER TABLE "communication_deliveries"
  ADD CONSTRAINT "communication_deliveries_retryOfId_fkey"
  FOREIGN KEY ("retryOfId")
  REFERENCES "communication_deliveries"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
