ALTER TABLE "backup_runs" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "backup_runs_businessId_idempotencyKey_key"
  ON "backup_runs"("businessId", "idempotencyKey");
