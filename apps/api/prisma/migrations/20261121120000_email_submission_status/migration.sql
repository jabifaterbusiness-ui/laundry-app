ALTER TYPE "FinancialStatementDeliveryStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';

ALTER TABLE "financial_statement_deliveries"
ADD COLUMN "retryable" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "financial_statement_deliveries"
SET "retryable" = FALSE
WHERE "status" = 'SENT';
