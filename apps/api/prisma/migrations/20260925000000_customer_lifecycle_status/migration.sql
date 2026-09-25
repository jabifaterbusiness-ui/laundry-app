-- CreateEnum
CREATE TYPE "CustomerLifecycleStatus" AS ENUM ('ACTIVE', 'DORMANT', 'BLOCKED', 'BLACKLISTED');

-- Add lifecycle fields while retaining isActive for legacy compatibility.
ALTER TABLE "customers"
ADD COLUMN "lifecycleStatus" "CustomerLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "statusReason" TEXT,
ADD COLUMN "statusChangedAt" TIMESTAMP(3),
ADD COLUMN "statusChangedById" TEXT;

-- Preserve the meaning of the legacy inactive flag.
UPDATE "customers"
SET "lifecycleStatus" = 'DORMANT'
WHERE "isActive" = false;

-- CreateTable
CREATE TABLE "customer_status_history" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "previousStatus" "CustomerLifecycleStatus",
    "newStatus" "CustomerLifecycleStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" TEXT,

    CONSTRAINT "customer_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_status_history_customerId_changedAt_idx"
ON "customer_status_history"("customerId", "changedAt");

-- CreateIndex
CREATE INDEX "customer_status_history_businessId_changedAt_idx"
ON "customer_status_history"("businessId", "changedAt");

-- AddForeignKey
ALTER TABLE "customers"
ADD CONSTRAINT "customers_statusChangedById_fkey"
FOREIGN KEY ("statusChangedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_status_history"
ADD CONSTRAINT "customer_status_history_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "customers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_status_history"
ADD CONSTRAINT "customer_status_history_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_status_history"
ADD CONSTRAINT "customer_status_history_changedById_fkey"
FOREIGN KEY ("changedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
