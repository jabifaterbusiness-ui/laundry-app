import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
  requireSensitiveAuthorization,
} from "../auth/auth.middleware.js";
import { requireAnyPermission, requirePermission } from "../../middleware/permissions.js";
import { requireRole } from "../../middleware/rbac.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { analyze, exportBackup, getJob, importJob, restoreBackup, getRestorePassword, setRestorePassword } from "./migrations.controller.js";
import {
  createCloudConnectionController,
  deleteCloudConnectionController,
  getCloudBackupSettingsController,
  listCloudConnectionsController,
  saveCloudBackupSettingsController,
  verifyCloudConnectionController,
  createCloudBackupRunController,
  listCloudBackupRunsController,
  startCloudOAuthController,
  listCloudBackupSchedulesController,
  createCloudBackupScheduleController,
  updateCloudBackupScheduleController,
  deleteCloudBackupScheduleController,
} from "./backup-cloud.controller.js";

const ADMIN_ROLES = ["BUSINESS_OWNER", "BRANCH_MANAGER"] as const;

export const migrationsRouter = Router();
migrationsRouter.use(requireAuth, requireBusinessContext);

migrationsRouter.post("/jobs/analyze", requireRole(...ADMIN_ROLES), requirePermission("migrations.view"), asyncHandler(analyze));
migrationsRouter.get("/jobs/:id", requireRole(...ADMIN_ROLES), requirePermission("migrations.view"), asyncHandler(getJob));
migrationsRouter.post("/jobs/:id/import", requireRole(...ADMIN_ROLES), requirePermission("migrations.manage"), asyncHandler(importJob));
migrationsRouter.post("/backup/export", requirePermission("migrations.view"), asyncHandler(exportBackup));
migrationsRouter.post(
  "/backup/restore",
  requirePermission("backups.restore"),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(restoreBackup),
);
migrationsRouter.get("/backup/restore-password", requirePermission("backups.restore_password.view"), asyncHandler(getRestorePassword));
migrationsRouter.put("/backup/restore-password", requirePermission("backups.restore_password.manage"), asyncHandler(setRestorePassword));

migrationsRouter.post(
  "/backup/cloud/oauth/start",
  requirePermission("backups.connections.manage"),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(startCloudOAuthController),
);

migrationsRouter.get(
  "/backup/cloud/connections",
  requireAnyPermission(["backups.connections.view", "backups.connections.manage", "backups.connections.verify", "backups.run", "backups.schedules.view", "backups.schedules.manage", "backups.settings.view", "backups.settings.manage"]),
  asyncHandler(listCloudConnectionsController),
);
migrationsRouter.post(
  "/backup/cloud/connections",
  requirePermission("backups.connections.manage"),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(createCloudConnectionController),
);
migrationsRouter.delete(
  "/backup/cloud/connections/:id",
  requirePermission("backups.connections.manage"),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(deleteCloudConnectionController),
);
migrationsRouter.get(
  "/backup/cloud/settings",
  requireAnyPermission(["backups.settings.view", "backups.settings.manage"]),
  asyncHandler(getCloudBackupSettingsController),
);
migrationsRouter.put(
  "/backup/cloud/settings",
  requirePermission("backups.settings.manage"),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(saveCloudBackupSettingsController),
);


migrationsRouter.get(
  "/backup/cloud/schedules",
  requireAnyPermission(["backups.schedules.view", "backups.schedules.manage"]),
  asyncHandler(listCloudBackupSchedulesController),
);
migrationsRouter.post(
  "/backup/cloud/schedules",
  requirePermission("backups.schedules.manage"),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(createCloudBackupScheduleController),
);
migrationsRouter.patch(
  "/backup/cloud/schedules/:id",
  requirePermission("backups.schedules.manage"),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(updateCloudBackupScheduleController),
);
migrationsRouter.delete(
  "/backup/cloud/schedules/:id",
  requirePermission("backups.schedules.manage"),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(deleteCloudBackupScheduleController),
);

migrationsRouter.get(
  "/backup/cloud/runs",
  requirePermission("backups.history.view"),
  asyncHandler(listCloudBackupRunsController),
);
migrationsRouter.post(
  "/backup/cloud/connections/:id/verify",
  requirePermission("backups.connections.verify"),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(verifyCloudConnectionController),
);
migrationsRouter.post(
  "/backup/cloud/runs",
  requirePermission("backups.run"),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(createCloudBackupRunController),
);
