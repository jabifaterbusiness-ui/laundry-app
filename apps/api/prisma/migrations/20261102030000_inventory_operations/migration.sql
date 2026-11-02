ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'RETURN';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'WASTE';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_IN';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'STOCKTAKE';
CREATE TYPE "InventoryTransferStatus" AS ENUM ('DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
CREATE TYPE "InventoryStocktakeStatus" AS ENUM ('DRAFT', 'APPLIED', 'CANCELLED');

ALTER TABLE "inventory_stocks"
  ADD COLUMN "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "averageUnitCost" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "inventory_movements" ADD COLUMN "unitCost" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "inventory_stocks"
  ADD CONSTRAINT "inventory_stocks_reserved_quantity_check" CHECK ("reservedQuantity" >= 0 AND "reservedQuantity" <= "quantity"),
  ADD CONSTRAINT "inventory_stocks_average_unit_cost_check" CHECK ("averageUnitCost" >= 0);
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_unit_cost_check" CHECK ("unitCost" >= 0);

CREATE TABLE "inventory_transfers" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "sourceBranchId" TEXT NOT NULL,
  "destinationBranchId" TEXT NOT NULL, "transferNumber" TEXT NOT NULL,
  "status" "InventoryTransferStatus" NOT NULL DEFAULT 'DISPATCHED', "notes" TEXT,
  "createdById" TEXT NOT NULL, "dispatchedById" TEXT NOT NULL, "receivedById" TEXT,
  "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_transfers_different_branches_check" CHECK ("sourceBranchId" <> "destinationBranchId")
);
CREATE TABLE "inventory_transfer_lines" (
  "id" TEXT NOT NULL, "transferId" TEXT NOT NULL, "inventoryItemId" TEXT NOT NULL,
  "quantityDispatched" INTEGER NOT NULL, "quantityReceived" INTEGER NOT NULL DEFAULT 0,
  "unitCost" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_transfer_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_transfer_lines_quantity_check" CHECK ("quantityDispatched" > 0 AND "quantityReceived" >= 0 AND "quantityReceived" <= "quantityDispatched"),
  CONSTRAINT "inventory_transfer_lines_cost_check" CHECK ("unitCost" >= 0)
);
CREATE TABLE "inventory_stocktakes" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "branchId" TEXT NOT NULL,
  "reference" TEXT NOT NULL, "status" "InventoryStocktakeStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT, "createdById" TEXT NOT NULL, "appliedById" TEXT, "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_stocktakes_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "inventory_stocktake_lines" (
  "id" TEXT NOT NULL, "stocktakeId" TEXT NOT NULL, "inventoryItemId" TEXT NOT NULL,
  "expectedQuantity" INTEGER NOT NULL, "countedQuantity" INTEGER NOT NULL, "variance" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_stocktake_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_stocktake_lines_quantities_check" CHECK ("expectedQuantity" >= 0 AND "countedQuantity" >= 0 AND "variance" = "countedQuantity" - "expectedQuantity")
);
CREATE TABLE "inventory_reservations" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "branchId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL, "quantity" INTEGER NOT NULL, "reference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "createdById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3), "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_reservations_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "inventory_reservations_status_check" CHECK ("status" IN ('ACTIVE', 'RELEASED', 'CONSUMED', 'EXPIRED'))
);

CREATE UNIQUE INDEX "inventory_transfers_businessId_transferNumber_key" ON "inventory_transfers"("businessId", "transferNumber");
CREATE INDEX "inventory_transfers_businessId_sourceBranchId_status_createdAt_idx" ON "inventory_transfers"("businessId", "sourceBranchId", "status", "createdAt");
CREATE INDEX "inventory_transfers_businessId_destinationBranchId_status_createdAt_idx" ON "inventory_transfers"("businessId", "destinationBranchId", "status", "createdAt");
CREATE UNIQUE INDEX "inventory_transfer_lines_transferId_inventoryItemId_key" ON "inventory_transfer_lines"("transferId", "inventoryItemId");
CREATE INDEX "inventory_transfer_lines_inventoryItemId_idx" ON "inventory_transfer_lines"("inventoryItemId");
CREATE UNIQUE INDEX "inventory_stocktakes_businessId_reference_key" ON "inventory_stocktakes"("businessId", "reference");
CREATE INDEX "inventory_stocktakes_businessId_branchId_status_createdAt_idx" ON "inventory_stocktakes"("businessId", "branchId", "status", "createdAt");
CREATE UNIQUE INDEX "inventory_stocktake_lines_stocktakeId_inventoryItemId_key" ON "inventory_stocktake_lines"("stocktakeId", "inventoryItemId");
CREATE INDEX "inventory_reservations_businessId_branchId_status_expiresAt_idx" ON "inventory_reservations"("businessId", "branchId", "status", "expiresAt");
CREATE INDEX "inventory_reservations_inventoryItemId_branchId_status_idx" ON "inventory_reservations"("inventoryItemId", "branchId", "status");

ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_destinationBranchId_fkey" FOREIGN KEY ("destinationBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "inventory_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_stocktakes" ADD CONSTRAINT "inventory_stocktakes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_stocktakes" ADD CONSTRAINT "inventory_stocktakes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_stocktakes" ADD CONSTRAINT "inventory_stocktakes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_stocktakes" ADD CONSTRAINT "inventory_stocktakes_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_stocktake_lines" ADD CONSTRAINT "inventory_stocktake_lines_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "inventory_stocktakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_stocktake_lines" ADD CONSTRAINT "inventory_stocktake_lines_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
