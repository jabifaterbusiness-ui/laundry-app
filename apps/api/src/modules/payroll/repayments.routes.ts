import { Router } from "express";

import {
  createRepaymentController,
  getRepaymentController,
  listRepaymentsController,
  voidRepaymentController,
} from "./repayments.controller.js";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireBusinessContext } from "../../middleware/business-context.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { requireRole } from "../../middleware/rbac.js";
import { asyncHandler } from "../../middleware/async-handler.js";

const router = Router();

router.use(requireAuth);
router.use(asyncHandler(requireBusinessContext));
router.use(asyncHandler(requireBranchContext));

const FINANCE_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
] as const;

router.post(
  "/",
  requireRole(...FINANCE_ROLES),
  asyncHandler(createRepaymentController),
);

router.get(
  "/",
  requireRole(...FINANCE_ROLES),
  asyncHandler(listRepaymentsController),
);

router.get(
  "/:id",
  requireRole(...FINANCE_ROLES),
  asyncHandler(getRepaymentController),
);

router.post(
  "/:id/void",
  requireRole("BUSINESS_OWNER"),
  asyncHandler(voidRepaymentController),
);

export default router;
