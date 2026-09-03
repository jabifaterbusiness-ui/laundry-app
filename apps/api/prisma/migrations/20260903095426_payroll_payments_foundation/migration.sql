-- CreateEnum
CREATE TYPE "PayrollPaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'POS');

-- CreateEnum
CREATE TYPE "PayrollPaymentStatus" AS ENUM ('POSTED', 'VOID');

-- CreateTable
CREATE TABLE "payroll_payments" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "payrollRecordId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PayrollPaymentMethod" NOT NULL,
    "status" "PayrollPaymentStatus" NOT NULL DEFAULT 'POSTED',
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_payments_businessId_createdAt_idx" ON "payroll_payments"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "payroll_payments_businessId_branchId_createdAt_idx" ON "payroll_payments"("businessId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "payroll_payments_businessId_payrollRecordId_createdAt_idx" ON "payroll_payments"("businessId", "payrollRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "payroll_payments_businessId_employeeId_createdAt_idx" ON "payroll_payments"("businessId", "employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "payroll_payments_payrollRecordId_idx" ON "payroll_payments"("payrollRecordId");

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_payrollRecordId_fkey" FOREIGN KEY ("payrollRecordId") REFERENCES "payroll_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
