-- Preserve merged customer records as a distinct archived lifecycle state.
ALTER TYPE "CustomerLifecycleStatus" ADD VALUE IF NOT EXISTS 'MERGED';

ALTER TABLE "customers"
  ADD COLUMN "mergedIntoCustomerId" TEXT;

CREATE INDEX "customers_businessId_mergedIntoCustomerId_idx"
  ON "customers"("businessId", "mergedIntoCustomerId");

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_mergedIntoCustomerId_fkey"
  FOREIGN KEY ("mergedIntoCustomerId")
  REFERENCES "customers"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
