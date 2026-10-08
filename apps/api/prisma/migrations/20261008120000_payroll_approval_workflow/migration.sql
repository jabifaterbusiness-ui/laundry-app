-- Payroll approval workflow
CREATE TYPE "PayrollApprovalStatus" AS ENUM (
  'NOT_SUBMITTED',
  'PENDING',
  'APPROVED',
  'DECLINED'
);

ALTER TABLE "payroll_periods"
  ADD COLUMN "approvalStatus" "PayrollApprovalStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
  ADD COLUMN "approvalSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "approvalSubmittedById" TEXT,
  ADD COLUMN "approvalDecidedAt" TIMESTAMP(3),
  ADD COLUMN "approvalDecidedById" TEXT,
  ADD COLUMN "approvalReason" TEXT;

CREATE INDEX "payroll_periods_businessId_branchId_approvalStatus_idx"
  ON "payroll_periods"("businessId", "branchId", "approvalStatus");
