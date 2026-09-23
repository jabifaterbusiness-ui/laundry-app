import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  create,
  getByOrder,
  getOne,
  list,
} from "./invoices.controller.js";
import {
  customerReceipt,
  companyReceipt,
} from "./receipts.controller.js";

export const invoicesRouter = Router();

invoicesRouter.use(
  requireAuth,
  requireBusinessContext,
  asyncHandler(requireBranchContext),
);

invoicesRouter.post(
  "/",
  requirePermission("invoices.manage"),
  asyncHandler(create),
);

invoicesRouter.get(
  "/",
  requirePermission("invoices.view"),
  asyncHandler(list),
);

invoicesRouter.get(
  "/order/:orderId",
  requirePermission("invoices.view"),
  asyncHandler(getByOrder),
);

invoicesRouter.get(
  "/:id/receipt/customer",
  requirePermission("invoices.view"),
  asyncHandler(customerReceipt),
);

invoicesRouter.get(
  "/:id/receipt/company",
  requirePermission("invoices.view"),
  asyncHandler(companyReceipt),
);

invoicesRouter.get(
  "/:id",
  requirePermission("invoices.view"),
  asyncHandler(getOne),
);
