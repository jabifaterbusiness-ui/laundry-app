import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  createForOrder,
  getOne,
  list,
  updateStatus,
} from "./garments.controller.js";

const VIEW_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
] as const;

const WRITE_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
] as const;

export const garmentsRouter = Router();

garmentsRouter.use(
  requireAuth,
  requireBusinessContext,
  asyncHandler(requireBranchContext),
);

garmentsRouter.post(
  "/orders/:orderId/generate",
  requireRole(...WRITE_ROLES),
  asyncHandler(createForOrder),
);

garmentsRouter.get(
  "/",
  requireRole(...VIEW_ROLES),
  asyncHandler(list),
);

garmentsRouter.get(
  "/:id",
  requireRole(...VIEW_ROLES),
  asyncHandler(getOne),
);

garmentsRouter.patch(
  "/:id/status",
  requireRole(...WRITE_ROLES),
  asyncHandler(updateStatus),
);
