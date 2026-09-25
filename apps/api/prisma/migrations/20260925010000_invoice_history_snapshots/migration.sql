CREATE TABLE "invoice_history" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_history_invoiceId_createdAt_idx"
ON "invoice_history"("invoiceId", "createdAt");

CREATE INDEX "invoice_history_businessId_expiresAt_idx"
ON "invoice_history"("businessId", "expiresAt");

CREATE INDEX "invoice_history_businessId_branchId_createdAt_idx"
ON "invoice_history"("businessId", "branchId", "createdAt");

ALTER TABLE "invoice_history"
ADD CONSTRAINT "invoice_history_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
