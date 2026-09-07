import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireRole } from "../../middleware/rbac.js";
import { enqueue, getOne, list } from "./sync.controller.js";

const SYNC_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
] as const;

export const syncRouter = Router();

syncRouter.use(
  requireAuth,
  requireBusinessContext,
  asyncHandler(requireBranchContext),
);

syncRouter.post(
  "/",
  requireRole(...SYNC_ROLES),
  requirePermission("orders.create"),
  asyncHandler(enqueue),
);

syncRouter.get(
  "/",
  requireRole(...SYNC_ROLES),
  requirePermission("orders.view"),
  asyncHandler(list),
);

syncRouter.get(
  "/:id",
  requireRole(...SYNC_ROLES),
  requirePermission("orders.view"),
  asyncHandler(getOne),
);
