-- CreateEnum
CREATE TYPE "InventoryUnit" AS ENUM ('PIECE', 'PACK', 'BOTTLE', 'LITRE', 'KILOGRAM', 'BOX', 'ROLL', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" "InventoryUnit" NOT NULL,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_stocks" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "resultingQuantity" INTEGER NOT NULL,
    "reason" TEXT,
    "reference" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_items_businessId_isActive_idx" ON "inventory_items"("businessId", "isActive");

-- CreateIndex
CREATE INDEX "inventory_items_businessId_name_idx" ON "inventory_items"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_businessId_name_key" ON "inventory_items"("businessId", "name");

-- CreateIndex
CREATE INDEX "inventory_stocks_businessId_branchId_idx" ON "inventory_stocks"("businessId", "branchId");

-- CreateIndex
CREATE INDEX "inventory_stocks_businessId_branchId_quantity_idx" ON "inventory_stocks"("businessId", "branchId", "quantity");

-- CreateIndex
CREATE INDEX "inventory_stocks_businessId_inventoryItemId_idx" ON "inventory_stocks"("businessId", "inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stocks_inventoryItemId_branchId_key" ON "inventory_stocks"("inventoryItemId", "branchId");

-- CreateIndex
CREATE INDEX "inventory_movements_businessId_branchId_createdAt_idx" ON "inventory_movements"("businessId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_movements_businessId_branchId_inventoryItemId_cre_idx" ON "inventory_movements"("businessId", "branchId", "inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_movements_businessId_inventoryItemId_createdAt_idx" ON "inventory_movements"("businessId", "inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_movements_createdById_idx" ON "inventory_movements"("createdById");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
