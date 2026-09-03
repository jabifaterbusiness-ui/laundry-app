-- CreateEnum
CREATE TYPE "FinancialRepaymentType" AS ENUM ('IOU', 'LOAN');

-- CreateEnum
CREATE TYPE "FinancialRepaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'POS');

-- CreateEnum
CREATE TYPE "FinancialRepaymentStatus" AS ENUM ('POSTED', 'VOID');

-- CreateTable
CREATE TABLE "financial_repayments" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "FinancialRepaymentType" NOT NULL,
    "iouId" TEXT,
    "loanId" TEXT,
    "amount" INTEGER NOT NULL,
    "method" "FinancialRepaymentMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "status" "FinancialRepaymentStatus" NOT NULL DEFAULT 'POSTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_repayments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_repayments_businessId_branchId_createdAt_idx" ON "financial_repayments"("businessId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "financial_repayments_businessId_employeeId_createdAt_idx" ON "financial_repayments"("businessId", "employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "financial_repayments_iouId_idx" ON "financial_repayments"("iouId");

-- CreateIndex
CREATE INDEX "financial_repayments_loanId_idx" ON "financial_repayments"("loanId");

-- CreateIndex
CREATE INDEX "financial_repayments_createdById_idx" ON "financial_repayments"("createdById");

-- AddForeignKey
ALTER TABLE "financial_repayments" ADD CONSTRAINT "financial_repayments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_repayments" ADD CONSTRAINT "financial_repayments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_repayments" ADD CONSTRAINT "financial_repayments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_repayments" ADD CONSTRAINT "financial_repayments_iouId_fkey" FOREIGN KEY ("iouId") REFERENCES "ious"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_repayments" ADD CONSTRAINT "financial_repayments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_repayments" ADD CONSTRAINT "financial_repayments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
