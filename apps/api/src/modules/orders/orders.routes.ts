import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireSensitiveAuthorization } from "../auth/auth.middleware.js";
import {
  create,
  editInvoice,
  getOne,
  list,
  transfer,
  updateStatus,
  statusHistory,
} from "./orders.controller.js";

// Order authorization:
// create/view/status update:
// BUSINESS_OWNER, BRANCH_MANAGER, STAFF
//
// PLATFORM_ADMIN is excluded because orders are tenant-scoped.
//
// Branch context is mandatory because orders are operationally tied
// to a physical branch.

export const ordersRouter = Router();

ordersRouter.use(
  requireAuth,
  requireBusinessContext,
  asyncHandler(requireBranchContext),
);

ordersRouter.post(
  "/",
  requirePermission("orders.create"),
  asyncHandler(create),
);

ordersRouter.get(
  "/",
  requirePermission("orders.view"),
  asyncHandler(list),
);

ordersRouter.get(
  "/:id",
  requirePermission("orders.view"),
  asyncHandler(getOne),
);

ordersRouter.get(
  "/:id/status-history",
  requirePermission("orders.view"),
  asyncHandler(statusHistory),
);

ordersRouter.patch(
  "/:id/transfer",
  requirePermission("orders.update"),
  asyncHandler(transfer),
);

ordersRouter.patch(
  "/:id",
  requirePermission("orders.update"),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(editInvoice),
);

ordersRouter.patch(
  "/:id/status",
  requirePermission("orders.change_status"),
  asyncHandler(updateStatus),
);
