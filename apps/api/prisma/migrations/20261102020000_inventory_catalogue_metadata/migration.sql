ALTER TABLE "inventory_items"
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "category" TEXT,
  ADD COLUMN "storageLocation" TEXT,
  ADD COLUMN "reorderQuantity" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "inventory_items_businessId_sku_key"
  ON "inventory_items"("businessId", "sku");

CREATE INDEX "inventory_items_businessId_category_idx"
  ON "inventory_items"("businessId", "category");

ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_reorder_quantity_check"
  CHECK ("reorderQuantity" >= 0);