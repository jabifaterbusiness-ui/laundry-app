-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'VOID');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SALARY', 'RENT', 'UTILITIES', 'INVENTORY', 'TRANSPORT', 'MAINTENANCE', 'FINANCE_CHARGE', 'TAX', 'EMPLOYEE_REIMBURSEMENT', 'MISCELLANEOUS', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialStatementChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "FinancialStatementDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "recognizedAt" TIMESTAMP(3),
    "recognizedById" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_statement_configs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "hour" INTEGER NOT NULL DEFAULT 8,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_statement_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_statement_recipients" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "whatsappNumber" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_statement_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_statements" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "grossRevenue" INTEGER NOT NULL,
    "refundAmount" INTEGER NOT NULL,
    "netRevenue" INTEGER NOT NULL,
    "explicitExpenses" INTEGER NOT NULL,
    "salaryExpense" INTEGER NOT NULL,
    "totalExpenses" INTEGER NOT NULL,
    "profitOrLoss" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_statement_deliveries" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" "FinancialStatementChannel" NOT NULL,
    "status" "FinancialStatementDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "destination" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_statement_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_businessId_branchId_incurredAt_idx" ON "expenses"("businessId", "branchId", "incurredAt");

-- CreateIndex
CREATE INDEX "expenses_businessId_branchId_status_idx" ON "expenses"("businessId", "branchId", "status");

-- CreateIndex
CREATE INDEX "expenses_businessId_recognizedAt_idx" ON "expenses"("businessId", "recognizedAt");

-- CreateIndex
CREATE INDEX "expenses_businessId_category_recognizedAt_idx" ON "expenses"("businessId", "category", "recognizedAt");

-- CreateIndex
CREATE INDEX "expenses_createdById_idx" ON "expenses"("createdById");

-- CreateIndex
CREATE INDEX "expenses_approvedById_idx" ON "expenses"("approvedById");

-- CreateIndex
CREATE INDEX "expenses_recognizedById_idx" ON "expenses"("recognizedById");

-- CreateIndex
CREATE UNIQUE INDEX "financial_statement_configs_businessId_key" ON "financial_statement_configs"("businessId");

-- CreateIndex
CREATE INDEX "financial_statement_recipients_businessId_enabled_idx" ON "financial_statement_recipients"("businessId", "enabled");

-- CreateIndex
CREATE INDEX "financial_statement_recipients_userId_idx" ON "financial_statement_recipients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_statement_recipients_businessId_userId_key" ON "financial_statement_recipients"("businessId", "userId");

-- CreateIndex
CREATE INDEX "financial_statements_businessId_periodStart_periodEnd_idx" ON "financial_statements"("businessId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "financial_statements_businessId_periodStart_periodEnd_key" ON "financial_statements"("businessId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "financial_statement_deliveries_statementId_status_idx" ON "financial_statement_deliveries"("statementId", "status");

-- CreateIndex
CREATE INDEX "financial_statement_deliveries_recipientId_status_idx" ON "financial_statement_deliveries"("recipientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "financial_statement_deliveries_statementId_recipientId_chan_key" ON "financial_statement_deliveries"("statementId", "recipientId", "channel");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recognizedById_fkey" FOREIGN KEY ("recognizedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statement_configs" ADD CONSTRAINT "financial_statement_configs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statement_recipients" ADD CONSTRAINT "financial_statement_recipients_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statement_recipients" ADD CONSTRAINT "financial_statement_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statement_deliveries" ADD CONSTRAINT "financial_statement_deliveries_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "financial_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statement_deliveries" ADD CONSTRAINT "financial_statement_deliveries_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "financial_statement_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
