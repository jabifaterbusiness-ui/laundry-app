import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import { dashboard } from "./reports.controller.js";

const REPORT_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
] as const;

export const reportsRouter = Router();

reportsRouter.use(
  requireAuth,
  requireBusinessContext,
  asyncHandler(requireBranchContext),
);

reportsRouter.get(
  "/dashboard",
  requireRole(...REPORT_ROLES),
  requirePermission("reports.view"),
  asyncHandler(dashboard),
);
