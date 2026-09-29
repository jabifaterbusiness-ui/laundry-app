import { Router } from "express";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireRole } from "../../middleware/rbac.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { analyze, exportBackup, getJob, importJob, restoreBackup } from "./migrations.controller.js";

const ADMIN_ROLES = ["BUSINESS_OWNER", "BRANCH_MANAGER"] as const;
const OWNER_ONLY = ["BUSINESS_OWNER"] as const;

export const migrationsRouter = Router();
migrationsRouter.use(requireAuth, requireBusinessContext);

migrationsRouter.post(
  "/jobs/analyze",
  requireRole(...ADMIN_ROLES),
  requirePermission("migrations.view"),
  asyncHandler(analyze),
);
migrationsRouter.get(
  "/jobs/:id",
  requireRole(...ADMIN_ROLES),
  requirePermission("migrations.view"),
  asyncHandler(getJob),
);
migrationsRouter.post(
  "/jobs/:id/import",
  requireRole(...ADMIN_ROLES),
  requirePermission("migrations.manage"),
  asyncHandler(importJob),
);
migrationsRouter.post(
  "/backup/export",
  requireRole(...OWNER_ONLY),
  requirePermission("migrations.view"),
  asyncHandler(exportBackup),
);
migrationsRouter.post(
  "/backup/restore",
  requireRole(...OWNER_ONLY),
  requirePermission("migrations.manage"),
  asyncHandler(restoreBackup),
);
