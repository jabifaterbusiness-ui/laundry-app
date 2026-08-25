import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  create,
  getOne,
  list,
  updateStatus,
} from "./orders.controller.js";

// Order authorization:
// create/view/status update:
// BUSINESS_OWNER, BRANCH_MANAGER, STAFF
//
// PLATFORM_ADMIN is excluded because orders are tenant-scoped.
//
// Branch context is mandatory because orders are operationally tied
// to a physical branch.

const ORDER_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
] as const;

const ORDER_STATUS_UPDATE_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
] as const;

export const ordersRouter = Router();

ordersRouter.use(
  requireAuth,
  requireBusinessContext,
  asyncHandler(requireBranchContext),
);

ordersRouter.post(
  "/",
  requireRole(...ORDER_ROLES),
  asyncHandler(create),
);

ordersRouter.get(
  "/",
  requireRole(...ORDER_ROLES),
  asyncHandler(list),
);

ordersRouter.get(
  "/:id",
  requireRole(...ORDER_ROLES),
  asyncHandler(getOne),
);

ordersRouter.patch(
  "/:id/status",
  requireRole(...ORDER_STATUS_UPDATE_ROLES),
  asyncHandler(updateStatus),
);
