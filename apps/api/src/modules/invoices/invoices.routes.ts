import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
  requireSensitiveAuthorization,
} from "../auth/auth.middleware.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  create,
  deleteInvoice,
  getByOrder,
  getOne,
  list,
  update,
  voidInvoice,
  transfer,
  history,
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

invoicesRouter.patch(
  "/:id",
  requirePermission("invoices.manage"),
  asyncHandler(update),
);

invoicesRouter.post(
  "/:id/void",
  requirePermission("invoices.manage"),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(voidInvoice),
);

invoicesRouter.delete(
  "/:id",
  requirePermission("invoices.manage"),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(deleteInvoice),
);

invoicesRouter.post(
  "/:id/transfer",
  requirePermission("invoices.manage"),
  asyncHandler(transfer),
);

invoicesRouter.get(
  "/:id/history",
  requirePermission("invoices.view"),
  asyncHandler(history),
);

invoicesRouter.get(
  "/:id",
  requirePermission("invoices.view"),
  asyncHandler(getOne),
);
