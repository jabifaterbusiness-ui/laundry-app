ALTER TABLE "orders" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "orders_businessId_branchId_idempotencyKey_key"
  ON "orders"("businessId", "branchId", "idempotencyKey");
