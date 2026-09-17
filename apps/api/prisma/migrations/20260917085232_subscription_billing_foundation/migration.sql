-- CreateEnum
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('CREATED', 'PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'EXPIRED', 'REQUIRES_VERIFICATION');

-- CreateEnum
CREATE TYPE "PaymentIntentOrigin" AS ENUM ('ONLINE', 'OFFLINE', 'PLATFORM_OWNER');

-- CreateTable
CREATE TABLE "business_payment_identities" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "paymentCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_payment_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_prices" (
    "id" TEXT NOT NULL,
    "platformConfigId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "countryCode" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_provider_configs" (
    "id" TEXT NOT NULL,
    "platformConfigId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "supportedCountries" JSONB NOT NULL,
    "supportedCurrencies" JSONB NOT NULL,
    "supportedMethods" JSONB NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_method_configs" (
    "id" TEXT NOT NULL,
    "platformConfigId" TEXT NOT NULL,
    "methodKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "providerKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "supportedCountries" JSONB NOT NULL,
    "supportedCurrencies" JSONB NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_method_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payment_intents" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "origin" "PaymentIntentOrigin" NOT NULL,
    "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "providerKey" TEXT,
    "paymentMethodKey" TEXT,
    "providerCheckoutReference" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "intentId" TEXT NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "providerKey" TEXT NOT NULL,
    "paymentMethodKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "status" "SubscriptionPaymentStatus" NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "providerKey" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_payment_identities_businessId_key" ON "business_payment_identities"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "business_payment_identities_paymentCode_key" ON "business_payment_identities"("paymentCode");

-- CreateIndex
CREATE INDEX "subscription_plan_prices_countryCode_currencyCode_isActive_idx" ON "subscription_plan_prices"("countryCode", "currencyCode", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plan_prices_plan_countryCode_currencyCode_key" ON "subscription_plan_prices"("plan", "countryCode", "currencyCode");

-- CreateIndex
CREATE INDEX "payment_provider_configs_enabled_displayOrder_idx" ON "payment_provider_configs"("enabled", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_configs_platformConfigId_providerKey_key" ON "payment_provider_configs"("platformConfigId", "providerKey");

-- CreateIndex
CREATE INDEX "payment_method_configs_enabled_displayOrder_idx" ON "payment_method_configs"("enabled", "displayOrder");

-- CreateIndex
CREATE INDEX "payment_method_configs_providerKey_enabled_idx" ON "payment_method_configs"("providerKey", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "payment_method_configs_platformConfigId_methodKey_key" ON "payment_method_configs"("platformConfigId", "methodKey");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_intents_paymentReference_key" ON "subscription_payment_intents"("paymentReference");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payment_intents_idempotencyKey_key" ON "subscription_payment_intents"("idempotencyKey");

-- CreateIndex
CREATE INDEX "subscription_payment_intents_businessId_status_createdAt_idx" ON "subscription_payment_intents"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "subscription_payment_intents_businessId_plan_createdAt_idx" ON "subscription_payment_intents"("businessId", "plan", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_intentId_key" ON "subscription_payments"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_paymentReference_key" ON "subscription_payments"("paymentReference");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_idempotencyKey_key" ON "subscription_payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "subscription_payments_businessId_status_createdAt_idx" ON "subscription_payments"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "subscription_payments_businessId_paymentReference_idx" ON "subscription_payments"("businessId", "paymentReference");

-- CreateIndex
CREATE INDEX "subscription_payments_providerKey_status_createdAt_idx" ON "subscription_payments"("providerKey", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_providerKey_providerTransactionId_key" ON "subscription_payments"("providerKey", "providerTransactionId");

-- CreateIndex
CREATE INDEX "payment_webhook_events_businessId_createdAt_idx" ON "payment_webhook_events"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_webhook_events_providerKey_processed_createdAt_idx" ON "payment_webhook_events"("providerKey", "processed", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_providerKey_providerEventId_key" ON "payment_webhook_events"("providerKey", "providerEventId");

-- AddForeignKey
ALTER TABLE "business_payment_identities" ADD CONSTRAINT "business_payment_identities_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_plan_prices" ADD CONSTRAINT "subscription_plan_prices_platformConfigId_fkey" FOREIGN KEY ("platformConfigId") REFERENCES "platform_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_provider_configs" ADD CONSTRAINT "payment_provider_configs_platformConfigId_fkey" FOREIGN KEY ("platformConfigId") REFERENCES "platform_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method_configs" ADD CONSTRAINT "payment_method_configs_platformConfigId_fkey" FOREIGN KEY ("platformConfigId") REFERENCES "platform_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payment_intents" ADD CONSTRAINT "subscription_payment_intents_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "subscription_payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
