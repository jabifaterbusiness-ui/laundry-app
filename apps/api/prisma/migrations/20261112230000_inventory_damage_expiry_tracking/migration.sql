-- Add explicit damaged-stock movements and retain batch/expiry trace on receipts and stock ledger rows.
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'DAMAGED';

ALTER TABLE "inventory_movements"
  ADD COLUMN "batchNumber" TEXT,
  ADD COLUMN "expiryDate" TIMESTAMP(3);

ALTER TABLE "inventory_goods_receipt_lines"
  ADD COLUMN "batchNumber" TEXT,
  ADD COLUMN "expiryDate" TIMESTAMP(3);
