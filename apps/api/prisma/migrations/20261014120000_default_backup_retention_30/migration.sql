-- Default new backup settings to retain 30 successful backups.
-- Existing rows and their configured retentionCount values are unchanged.
ALTER TABLE "backup_settings"
  ALTER COLUMN "retentionCount" SET DEFAULT 30;
