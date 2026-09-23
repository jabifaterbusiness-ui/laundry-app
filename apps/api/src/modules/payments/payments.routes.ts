import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
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

export const paymentsRouter = Router();

paymentsRouter.use(
  requireAuth,
  requireBusinessContext,
  asyncHandler(requireBranchContext),
);

paymentsRouter.post(
  "/",
  requirePermission("payments.manage"),
  asyncHandler(create),
);

paymentsRouter.get(
  "/",
  requirePermission("payments.view"),
  asyncHandler(list),
);

paymentsRouter.get(
  "/invoice/:invoiceId/summary",
  requirePermission("payments.view"),
  asyncHandler(getInvoiceSummary),
);

paymentsRouter.patch(
  "/:id/void",
  requirePermission("payments.manage"),
  asyncHandler(voidPaymentController),
);

paymentsRouter.get(
  "/:id",
  requirePermission("payments.view"),
  asyncHandler(getOne),
);
