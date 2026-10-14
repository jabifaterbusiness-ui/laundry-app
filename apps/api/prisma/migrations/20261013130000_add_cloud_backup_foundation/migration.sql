-- Cloud backup configuration, provider connection metadata, and durable run history.
-- Provider credentials must be encrypted by application code before insertion.
-- Automatic scheduling remains disabled until provider and scheduler services are implemented.

CREATE TYPE "BackupScheduleFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "BackupCloudProvider" AS ENUM ('GOOGLE_DRIVE', 'DROPBOX', 'ONEDRIVE', 'S3_COMPATIBLE');
CREATE TYPE "BackupConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR');
CREATE TYPE "BackupRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "BackupRunTrigger" AS ENUM ('MANUAL', 'SCHEDULED');

CREATE TABLE "backup_cloud_connections" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "provider" "BackupCloudProvider" NOT NULL,
    "displayName" TEXT NOT NULL,
    "config" JSONB,
    "credentialsCiphertext" TEXT NOT NULL,
    "status" "BackupConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "backup_cloud_connections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "backup_cloud_connections_businessId_id_key" UNIQUE ("businessId", "id"),
    CONSTRAINT "backup_cloud_connections_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "backup_settings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "BackupScheduleFrequency" NOT NULL DEFAULT 'DAILY',
    "dayOfWeek" INTEGER NOT NULL DEFAULT 1,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "hour" INTEGER NOT NULL DEFAULT 2,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "retentionCount" INTEGER NOT NULL DEFAULT 7,
    "destinationConnectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "backup_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "backup_settings_businessId_key" UNIQUE ("businessId"),
    CONSTRAINT "backup_settings_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "backup_settings_destinationConnectionId_fkey"
      FOREIGN KEY ("businessId", "destinationConnectionId")
      REFERENCES "backup_cloud_connections"("businessId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "backup_runs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "connectionId" TEXT,
    "trigger" "BackupRunTrigger" NOT NULL,
    "status" "BackupRunStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "checksumSha256" TEXT,
    "sizeBytes" BIGINT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "backup_runs_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "backup_runs_businessId_connectionId_fkey"
      FOREIGN KEY ("businessId", "connectionId")
      REFERENCES "backup_cloud_connections"("businessId", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "backup_cloud_connections_businessId_provider_idx"
    ON "backup_cloud_connections"("businessId", "provider");
CREATE INDEX "backup_cloud_connections_businessId_status_idx"
    ON "backup_cloud_connections"("businessId", "status");
CREATE INDEX "backup_settings_enabled_frequency_hour_minute_idx"
    ON "backup_settings"("enabled", "frequency", "hour", "minute");
CREATE INDEX "backup_runs_businessId_createdAt_idx"
    ON "backup_runs"("businessId", "createdAt");
CREATE INDEX "backup_runs_businessId_status_createdAt_idx"
    ON "backup_runs"("businessId", "status", "createdAt");
CREATE INDEX "backup_runs_connectionId_status_idx"
    ON "backup_runs"("connectionId", "status");

-- Nullable schedule slot makes scheduled executions idempotent per business.
-- Manual runs keep scheduledFor=NULL and remain unrestricted.
ALTER TABLE "backup_runs" ADD COLUMN "scheduledFor" TIMESTAMP(3);
CREATE UNIQUE INDEX "backup_runs_businessId_scheduledFor_key"
  ON "backup_runs"("businessId", "scheduledFor");
