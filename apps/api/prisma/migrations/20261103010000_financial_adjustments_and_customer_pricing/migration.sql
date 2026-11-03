ALTER TABLE "invoices"
  ADD COLUMN "subtotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "adjustedSubtotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "adjustmentTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "additiveTaxTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "withholdingTaxTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "appliedAdjustments" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "appliedTaxes" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE "price_adjustments" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "percentage" DOUBLE PRECISION NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "price_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "price_adjustments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "price_adjustments_businessId_name_key" ON "price_adjustments"("businessId", "name");
CREATE INDEX "price_adjustments_businessId_isActive_idx" ON "price_adjustments"("businessId", "isActive");

CREATE TABLE "tax_rules" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "treatment" TEXT NOT NULL,
  "enabledByDefault" BOOLEAN NOT NULL DEFAULT false,
  "allowWithOtherTaxes" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_rules_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "tax_rules_businessId_name_key" ON "tax_rules"("businessId", "name");
CREATE INDEX "tax_rules_businessId_isActive_enabledByDefault_idx" ON "tax_rules"("businessId", "isActive", "enabledByDefault");

CREATE TABLE "customer_service_prices" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_service_prices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_service_prices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_service_prices_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_service_prices_customerId_serviceId_key" ON "customer_service_prices"("customerId", "serviceId");
CREATE INDEX "customer_service_prices_businessId_customerId_idx" ON "customer_service_prices"("businessId", "customerId");
CREATE INDEX "customer_service_prices_businessId_serviceId_idx" ON "customer_service_prices"("businessId", "serviceId");
