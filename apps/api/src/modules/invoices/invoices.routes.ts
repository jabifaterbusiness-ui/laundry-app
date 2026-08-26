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
  getByOrder,
  getOne,
  list,
} from "./invoices.controller.js";

const INVOICE_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
] as const;

export const invoicesRouter = Router();

invoicesRouter.use(
  requireAuth,
  requireBusinessContext,
  asyncHandler(requireBranchContext),
);

invoicesRouter.post(
  "/",
  requireRole(...INVOICE_ROLES),
  asyncHandler(create),
);

invoicesRouter.get(
  "/",
  requireRole(...INVOICE_ROLES),
  asyncHandler(list),
);

invoicesRouter.get(
  "/order/:orderId",
  requireRole(...INVOICE_ROLES),
  asyncHandler(getByOrder),
);

invoicesRouter.get(
  "/:id",
  requireRole(...INVOICE_ROLES),
  asyncHandler(getOne),
);
