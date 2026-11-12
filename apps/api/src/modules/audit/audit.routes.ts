import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { suspiciousActivity } from "./audit.controller.js";

export const auditRouter = Router();

auditRouter.use(requireAuth, requireBusinessContext, requireBranchContext);

auditRouter.get(
  "/suspicious-activity",
  requirePermission("security.suspicious_activity.view"),
  asyncHandler(suspiciousActivity),
);
