ALTER TABLE "customers" ADD COLUMN "ownerBranchId" TEXT;
ALTER TABLE "services" ADD COLUMN "ownerBranchId" TEXT;
ALTER TABLE "customer_service_prices" ADD COLUMN "branchId" TEXT;
ALTER TABLE "price_adjustments" ADD COLUMN "branchId" TEXT;
ALTER TABLE "tax_rules" ADD COLUMN "branchId" TEXT;
ALTER TABLE "customer_accounts" ADD COLUMN "branchId" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN "ownerBranchId" TEXT;

ALTER TABLE "customer_accounts" DROP CONSTRAINT IF EXISTS "customer_accounts_customerId_key";
ALTER TABLE "customer_service_prices" DROP CONSTRAINT IF EXISTS "customer_service_prices_customerId_serviceId_key";
ALTER TABLE "price_adjustments" DROP CONSTRAINT IF EXISTS "price_adjustments_businessId_name_key";
ALTER TABLE "tax_rules" DROP CONSTRAINT IF EXISTS "tax_rules_businessId_name_key";
ALTER TABLE "inventory_items" DROP CONSTRAINT IF EXISTS "inventory_items_businessId_name_key";
ALTER TABLE "inventory_items" DROP CONSTRAINT IF EXISTS "inventory_items_businessId_sku_key";

CREATE UNIQUE INDEX "customer_accounts_customerId_branchId_key" ON "customer_accounts"("customerId", "branchId");
CREATE UNIQUE INDEX "customer_accounts_shared_customerId_key" ON "customer_accounts"("customerId") WHERE "branchId" IS NULL;
CREATE UNIQUE INDEX "customer_service_prices_customerId_serviceId_branchId_key" ON "customer_service_prices"("customerId", "serviceId", "branchId");
CREATE UNIQUE INDEX "customer_service_prices_shared_customer_service_key" ON "customer_service_prices"("customerId", "serviceId") WHERE "branchId" IS NULL;
CREATE UNIQUE INDEX "price_adjustments_businessId_branchId_name_key" ON "price_adjustments"("businessId", "branchId", "name");
CREATE UNIQUE INDEX "price_adjustments_shared_business_name_key" ON "price_adjustments"("businessId", "name") WHERE "branchId" IS NULL;
CREATE UNIQUE INDEX "tax_rules_businessId_branchId_name_key" ON "tax_rules"("businessId", "branchId", "name");
CREATE UNIQUE INDEX "tax_rules_shared_business_name_key" ON "tax_rules"("businessId", "name") WHERE "branchId" IS NULL;
CREATE UNIQUE INDEX "inventory_items_businessId_ownerBranchId_name_key" ON "inventory_items"("businessId", "ownerBranchId", "name");
CREATE UNIQUE INDEX "inventory_items_shared_business_name_key" ON "inventory_items"("businessId", "name") WHERE "ownerBranchId" IS NULL;
CREATE UNIQUE INDEX "inventory_items_businessId_ownerBranchId_sku_key" ON "inventory_items"("businessId", "ownerBranchId", "sku");
CREATE UNIQUE INDEX "inventory_items_shared_business_sku_key" ON "inventory_items"("businessId", "sku") WHERE "ownerBranchId" IS NULL AND "sku" IS NOT NULL;

ALTER TABLE "customers" ADD CONSTRAINT "customers_ownerBranchId_fkey" FOREIGN KEY ("ownerBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "services" ADD CONSTRAINT "services_ownerBranchId_fkey" FOREIGN KEY ("ownerBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_service_prices" ADD CONSTRAINT "customer_service_prices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_ownerBranchId_fkey" FOREIGN KEY ("ownerBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "branch_resource_shares" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "ownerBranchId" TEXT NOT NULL,
  "targetBranchId" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "userId" TEXT,
  "accessLevel" TEXT NOT NULL DEFAULT 'READ',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "branch_resource_shares_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "branch_resource_shares" ADD CONSTRAINT "branch_resource_shares_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_resource_shares" ADD CONSTRAINT "branch_resource_shares_ownerBranchId_fkey" FOREIGN KEY ("ownerBranchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_resource_shares" ADD CONSTRAINT "branch_resource_shares_targetBranchId_fkey" FOREIGN KEY ("targetBranchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_resource_shares" ADD CONSTRAINT "branch_resource_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_resource_shares" ADD CONSTRAINT "branch_resource_shares_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "branch_resource_shares_businessId_targetBranchId_resourceType_idx" ON "branch_resource_shares"("businessId", "targetBranchId", "resourceType");
CREATE INDEX "branch_resource_shares_businessId_ownerBranchId_resourceType_idx" ON "branch_resource_shares"("businessId", "ownerBranchId", "resourceType");
CREATE INDEX "branch_resource_shares_businessId_userId_idx" ON "branch_resource_shares"("businessId", "userId");
CREATE UNIQUE INDEX "branch_resource_shares_scope_key" ON "branch_resource_shares"("businessId", "ownerBranchId", "targetBranchId", "resourceType", COALESCE("resourceId", ''), COALESCE("userId", ''));
