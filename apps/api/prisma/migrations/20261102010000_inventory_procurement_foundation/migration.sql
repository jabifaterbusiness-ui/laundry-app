CREATE TYPE "InventoryPurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

CREATE TABLE "inventory_suppliers" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "taxId" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_suppliers_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "inventory_purchase_orders" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "status" "InventoryPurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "orderedAt" TIMESTAMP(3),
  "expectedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_purchase_orders_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "inventory_purchase_order_lines" (
  "id" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "quantityOrdered" INTEGER NOT NULL,
  "quantityReceived" INTEGER NOT NULL DEFAULT 0,
  "unitCost" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_purchase_order_lines_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "inventory_goods_receipts" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "receivedById" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_goods_receipts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "inventory_goods_receipt_lines" (
  "id" TEXT NOT NULL,
  "goodsReceiptId" TEXT NOT NULL,
  "purchaseOrderLineId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_goods_receipt_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_suppliers_businessId_name_key" ON "inventory_suppliers"("businessId", "name");
CREATE INDEX "inventory_suppliers_businessId_isActive_idx" ON "inventory_suppliers"("businessId", "isActive");
CREATE UNIQUE INDEX "inventory_purchase_orders_businessId_orderNumber_key" ON "inventory_purchase_orders"("businessId", "orderNumber");
CREATE INDEX "inventory_purchase_orders_businessId_branchId_status_createdAt_idx" ON "inventory_purchase_orders"("businessId", "branchId", "status", "createdAt");
CREATE INDEX "inventory_purchase_orders_businessId_supplierId_createdAt_idx" ON "inventory_purchase_orders"("businessId", "supplierId", "createdAt");
CREATE UNIQUE INDEX "inventory_purchase_order_lines_purchaseOrderId_inventoryItemId_key" ON "inventory_purchase_order_lines"("purchaseOrderId", "inventoryItemId");
CREATE INDEX "inventory_purchase_order_lines_inventoryItemId_idx" ON "inventory_purchase_order_lines"("inventoryItemId");
CREATE UNIQUE INDEX "inventory_goods_receipts_businessId_receiptNumber_key" ON "inventory_goods_receipts"("businessId", "receiptNumber");
CREATE INDEX "inventory_goods_receipts_businessId_branchId_receivedAt_idx" ON "inventory_goods_receipts"("businessId", "branchId", "receivedAt");
CREATE INDEX "inventory_goods_receipts_purchaseOrderId_receivedAt_idx" ON "inventory_goods_receipts"("purchaseOrderId", "receivedAt");
CREATE INDEX "inventory_goods_receipt_lines_inventoryItemId_createdAt_idx" ON "inventory_goods_receipt_lines"("inventoryItemId", "createdAt");
ALTER TABLE "inventory_suppliers" ADD CONSTRAINT "inventory_suppliers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_orders" ADD CONSTRAINT "inventory_purchase_orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_orders" ADD CONSTRAINT "inventory_purchase_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_orders" ADD CONSTRAINT "inventory_purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "inventory_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_orders" ADD CONSTRAINT "inventory_purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_order_lines" ADD CONSTRAINT "inventory_purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "inventory_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_purchase_order_lines" ADD CONSTRAINT "inventory_purchase_order_lines_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_goods_receipts" ADD CONSTRAINT "inventory_goods_receipts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_goods_receipts" ADD CONSTRAINT "inventory_goods_receipts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_goods_receipts" ADD CONSTRAINT "inventory_goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "inventory_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_goods_receipts" ADD CONSTRAINT "inventory_goods_receipts_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_goods_receipt_lines" ADD CONSTRAINT "inventory_goods_receipt_lines_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "inventory_goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_goods_receipt_lines" ADD CONSTRAINT "inventory_goods_receipt_lines_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "inventory_purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_goods_receipt_lines" ADD CONSTRAINT "inventory_goods_receipt_lines_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
