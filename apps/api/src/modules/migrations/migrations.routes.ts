import { Router } from "express";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { analyze, exportBackup, getJob, importJob, restoreBackup } from "./migrations.controller.js";

const ADMIN_ROLES = ["BUSINESS_OWNER", "BRANCH_MANAGER"] as const;
const OWNER_ONLY = ["BUSINESS_OWNER"] as const;

export const migrationsRouter = Router();
migrationsRouter.use(requireAuth, requireBusinessContext);

migrationsRouter.post("/jobs/analyze", requireRole(...ADMIN_ROLES), analyze);
migrationsRouter.get("/jobs/:id", requireRole(...ADMIN_ROLES), getJob);
migrationsRouter.post("/jobs/:id/import", requireRole(...ADMIN_ROLES), importJob);
migrationsRouter.post("/backup/export", requireRole(...OWNER_ONLY), exportBackup);
migrationsRouter.post("/backup/restore", requireRole(...OWNER_ONLY), restoreBackup);
