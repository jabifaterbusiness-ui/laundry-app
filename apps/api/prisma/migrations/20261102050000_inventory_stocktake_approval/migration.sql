ALTER TYPE "InventoryStocktakeStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED' BEFORE 'APPLIED';
ALTER TYPE "InventoryStocktakeStatus" ADD VALUE IF NOT EXISTS 'APPROVED' BEFORE 'APPLIED';

ALTER TABLE "inventory_stocktakes"
  ADD COLUMN "submittedById" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

CREATE INDEX "inventory_stocktakes_businessId_branchId_status_submittedAt_idx"
  ON "inventory_stocktakes"("businessId", "branchId", "status", "submittedAt");

ALTER TABLE "inventory_stocktakes"
  ADD CONSTRAINT "inventory_stocktakes_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_stocktakes"
  ADD CONSTRAINT "inventory_stocktakes_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
