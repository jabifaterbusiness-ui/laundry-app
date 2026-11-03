ALTER TABLE "price_adjustments"
  ADD COLUMN "targetScope" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "customerId" TEXT,
  ADD COLUMN "groupId" TEXT,
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "endsAt" TIMESTAMP(3),
  ADD COLUMN "allowStacking" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "excludedServiceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "price_adjustments"
  ADD CONSTRAINT "price_adjustments_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "price_adjustments"
  ADD CONSTRAINT "price_adjustments_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "customer_groups"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "price_adjustments_businessId_targetScope_startsAt_endsAt_idx"
  ON "price_adjustments"("businessId", "targetScope", "startsAt", "endsAt");
CREATE INDEX "price_adjustments_businessId_customerId_idx"
  ON "price_adjustments"("businessId", "customerId");
CREATE INDEX "price_adjustments_businessId_groupId_idx"
  ON "price_adjustments"("businessId", "groupId");
