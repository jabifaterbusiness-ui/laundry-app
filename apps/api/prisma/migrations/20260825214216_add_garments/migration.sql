-- CreateEnum
CREATE TYPE "GarmentStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'READY', 'PICKED_UP', 'DAMAGED', 'LOST');

-- CreateTable
CREATE TABLE "garments" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "garmentNumber" INTEGER NOT NULL,
    "status" "GarmentStatus" NOT NULL DEFAULT 'RECEIVED',
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "damagedAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "garments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "garments_businessId_branchId_createdAt_idx" ON "garments"("businessId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "garments_businessId_orderId_idx" ON "garments"("businessId", "orderId");

-- CreateIndex
CREATE INDEX "garments_businessId_status_idx" ON "garments"("businessId", "status");

-- CreateIndex
CREATE INDEX "garments_orderItemId_idx" ON "garments"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "garments_orderItemId_garmentNumber_key" ON "garments"("orderItemId", "garmentNumber");

-- AddForeignKey
ALTER TABLE "garments" ADD CONSTRAINT "garments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garments" ADD CONSTRAINT "garments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garments" ADD CONSTRAINT "garments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garments" ADD CONSTRAINT "garments_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
