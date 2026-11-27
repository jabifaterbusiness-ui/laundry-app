ALTER TABLE "businesses" ADD COLUMN "backupRestorePasswordCiphertext" TEXT;

INSERT INTO "permissions" ("id", "code", "module", "action", "description", "createdAt") VALUES
  (gen_random_uuid()::text, 'backups.view', 'backups', 'view', 'See the cloud backup section and its access guidance', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'backups.connections.view', 'backups', 'connections_view', 'View backup destinations', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'backups.connections.manage', 'backups', 'connections_manage', 'Connect and remove backup destinations', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'backups.connections.verify', 'backups', 'connections_verify', 'Verify backup destinations', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'backups.history.view', 'backups', 'history_view', 'View cloud backup history', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'backups.schedules.view', 'backups', 'schedules_view', 'View backup schedules', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'backups.schedules.manage', 'backups', 'schedules_manage', 'Create and manage backup schedules', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'backups.run', 'backups', 'run', 'Run an on-demand cloud backup', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'backups.settings.view', 'backups', 'settings_view', 'View automatic backup settings', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'backups.settings.manage', 'backups', 'settings_manage', 'Change automatic backup settings', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'backups.restore', 'backups', 'restore', 'Restore business backups', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'backups.restore_password.view', 'backups', 'restore_password_view', 'Review and copy the business backup restoration password', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'backups.restore_password.manage', 'backups', 'restore_password_manage', 'Set or change the business backup restoration password', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "description" = EXCLUDED."description";
