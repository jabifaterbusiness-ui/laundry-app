-- CreateEnum
CREATE TYPE "OfflineSyncStatus" AS ENUM ('PENDING', 'PROCESSING', 'APPLIED', 'CONFLICT', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "OfflineSyncOperationType" AS ENUM ('ORDER_CREATE', 'ORDER_UPDATE', 'CUSTOMER_CREATE', 'CUSTOMER_UPDATE');

-- CreateTable
CREATE TABLE "offline_sync_operations" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "operationType" "OfflineSyncOperationType" NOT NULL,
    "status" "OfflineSyncStatus" NOT NULL DEFAULT 'PENDING',
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "conflictReason" TEXT,
    "lastError" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_sync_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offline_sync_operations_businessId_branchId_status_createdA_idx" ON "offline_sync_operations"("businessId", "branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "offline_sync_operations_businessId_status_createdAt_idx" ON "offline_sync_operations"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "offline_sync_operations_businessId_actorUserId_createdAt_idx" ON "offline_sync_operations"("businessId", "actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "offline_sync_operations_correlationId_idx" ON "offline_sync_operations"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "offline_sync_operations_businessId_clientOperationId_key" ON "offline_sync_operations"("businessId", "clientOperationId");

-- AddForeignKey
ALTER TABLE "offline_sync_operations" ADD CONSTRAINT "offline_sync_operations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sync_operations" ADD CONSTRAINT "offline_sync_operations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sync_operations" ADD CONSTRAINT "offline_sync_operations_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
