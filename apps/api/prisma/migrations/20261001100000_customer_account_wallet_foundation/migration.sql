-- CreateEnum
CREATE TYPE "CustomerAccountTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "customer_accounts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_account_transactions" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "CustomerAccountTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "invoiceId" TEXT,
    "referenceTransactionId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_account_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_accounts_businessId_idx"
ON "customer_accounts"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounts_customerId_key"
ON "customer_accounts"("customerId");

-- CreateIndex
CREATE INDEX "customer_account_transactions_businessId_createdAt_idx"
ON "customer_account_transactions"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_account_transactions_businessId_customerAccountId_createdAt_idx"
ON "customer_account_transactions"("businessId", "customerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_account_transactions_businessId_branchId_createdAt_idx"
ON "customer_account_transactions"("businessId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_account_transactions_customerAccountId_createdAt_idx"
ON "customer_account_transactions"("customerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_account_transactions_invoiceId_idx"
ON "customer_account_transactions"("invoiceId");

-- CreateIndex
CREATE INDEX "customer_account_transactions_referenceTransactionId_idx"
ON "customer_account_transactions"("referenceTransactionId");

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'PAY_FROM_ACCOUNT';

-- AlterTable
ALTER TABLE "payments"
ADD COLUMN "customerAccountTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_customerAccountTransactionId_key"
ON "payments"("customerAccountTransactionId");

-- AddForeignKey
ALTER TABLE "customer_accounts"
ADD CONSTRAINT "customer_accounts_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_accounts"
ADD CONSTRAINT "customer_accounts_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "customers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_account_transactions"
ADD CONSTRAINT "customer_account_transactions_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_account_transactions"
ADD CONSTRAINT "customer_account_transactions_customerAccountId_fkey"
FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_account_transactions"
ADD CONSTRAINT "customer_account_transactions_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_account_transactions"
ADD CONSTRAINT "customer_account_transactions_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_account_transactions"
ADD CONSTRAINT "customer_account_transactions_referenceTransactionId_fkey"
FOREIGN KEY ("referenceTransactionId") REFERENCES "customer_account_transactions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments"
ADD CONSTRAINT "payments_customerAccountTransactionId_fkey"
FOREIGN KEY ("customerAccountTransactionId") REFERENCES "customer_account_transactions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
