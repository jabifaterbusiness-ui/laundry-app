import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireRole } from "../../middleware/rbac.js";
import { requireOfflineSyncEnabled } from "../platform/platform-controls.middleware.js";
import { enqueue, getOne, list, replay } from "./sync.controller.js";

const SYNC_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
] as const;

export const syncRouter = Router();

syncRouter.use(
  requireAuth,
  asyncHandler(requireOfflineSyncEnabled),
  requireBusinessContext,
  asyncHandler(requireBranchContext),
);

syncRouter.post(
  "/",
  requireRole(...SYNC_ROLES),
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


syncRouter.post(
  "/:id/replay",
  requireRole(...SYNC_ROLES),
  asyncHandler(replay),
);
