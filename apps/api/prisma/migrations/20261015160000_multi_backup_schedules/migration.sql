-- Give every legacy business schedule its own persistent schedule record.
CREATE TABLE "backup_schedules" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Backup schedule',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "frequency" "BackupScheduleFrequency" NOT NULL DEFAULT 'DAILY',
  "dayOfWeek" INTEGER NOT NULL DEFAULT 1,
  "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
  "hour" INTEGER NOT NULL DEFAULT 2,
  "minute" INTEGER NOT NULL DEFAULT 0,
  "clockFormat" TEXT NOT NULL DEFAULT '12H',
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
  "retentionCount" INTEGER NOT NULL DEFAULT 30,
  "destinationConnectionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "backup_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "backup_schedules_businessId_id_key"
  ON "backup_schedules"("businessId", "id");
CREATE INDEX "backup_schedules_businessId_enabled_frequency_hour_minute_idx"
  ON "backup_schedules"("businessId", "enabled", "frequency", "hour", "minute");
CREATE INDEX "backup_schedules_businessId_destinationConnectionId_idx"
  ON "backup_schedules"("businessId", "destinationConnectionId");

ALTER TABLE "backup_schedules"
  ADD CONSTRAINT "backup_schedules_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "backup_schedules"
  ADD CONSTRAINT "backup_schedules_businessId_destinationConnectionId_fkey"
  FOREIGN KEY ("businessId", "destinationConnectionId")
  REFERENCES "backup_cloud_connections"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve each business's current schedule using its existing settings ID.
INSERT INTO "backup_schedules" (
  "id", "businessId", "enabled", "frequency", "dayOfWeek", "dayOfMonth",
  "hour", "minute", "timezone", "retentionCount", "destinationConnectionId",
  "createdAt", "updatedAt"
)
SELECT
  "id", "businessId", "enabled", "frequency", "dayOfWeek", "dayOfMonth",
  "hour", "minute", "timezone", "retentionCount", "destinationConnectionId",
  "createdAt", "updatedAt"
FROM "backup_settings";

ALTER TABLE "backup_runs" ADD COLUMN "scheduleId" TEXT;

-- Associate legacy scheduled history with the migrated schedule for its business.
UPDATE "backup_runs" AS runs
SET "scheduleId" = schedules."id"
FROM "backup_schedules" AS schedules
WHERE runs."businessId" = schedules."businessId"
  AND runs."trigger" = 'SCHEDULED'
  AND runs."scheduledFor" IS NOT NULL;

DROP INDEX "backup_runs_businessId_scheduledFor_key";

CREATE UNIQUE INDEX "backup_runs_scheduleId_scheduledFor_key"
  ON "backup_runs"("scheduleId", "scheduledFor");
CREATE INDEX "backup_runs_businessId_scheduleId_createdAt_idx"
  ON "backup_runs"("businessId", "scheduleId", "createdAt");

ALTER TABLE "backup_runs"
  ADD CONSTRAINT "backup_runs_businessId_scheduleId_fkey"
  FOREIGN KEY ("businessId", "scheduleId")
  REFERENCES "backup_schedules"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
