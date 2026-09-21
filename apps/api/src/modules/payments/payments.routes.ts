import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  create,
  getInvoiceSummary,
  getOne,
  list,
  voidPaymentController,
} from "./payments.controller.js";

const PAYMENT_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
] as const;

export const paymentsRouter = Router();

paymentsRouter.use(
  requireAuth,
  requireBusinessContext,
  asyncHandler(requireBranchContext),
);

paymentsRouter.post(
  "/",
  requireRole(...PAYMENT_ROLES),
  requirePermission("payments.manage"),
  asyncHandler(create),
);

paymentsRouter.get(
  "/",
  requireRole(...PAYMENT_ROLES),
  requirePermission("payments.view"),
  asyncHandler(list),
);

paymentsRouter.get(
  "/invoice/:invoiceId/summary",
  requireRole(...PAYMENT_ROLES),
  requirePermission("payments.view"),
  asyncHandler(getInvoiceSummary),
);

paymentsRouter.patch(
  "/:id/void",
  requireRole("BUSINESS_OWNER", "BRANCH_MANAGER"),
  requirePermission("payments.manage"),
  asyncHandler(voidPaymentController),
);

paymentsRouter.get(
  "/:id",
  requireRole(...PAYMENT_ROLES),
  requirePermission("payments.view"),
  asyncHandler(getOne),
);
