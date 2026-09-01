import { Router } from "express";

import {
  approveLoanController,
  cancelLoanController,
  createLoanController,
  getLoanController,
  listLoansController,
  rejectLoanController,
} from "./loans.controller.js";

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

router.post("/", requireRole(...FINANCE_ROLES), asyncHandler(createLoanController));
router.get("/", requireRole(...FINANCE_ROLES), asyncHandler(listLoansController));
router.get("/:id", requireRole(...FINANCE_ROLES), asyncHandler(getLoanController));
router.post("/:id/approve", requireRole("BUSINESS_OWNER"), asyncHandler(approveLoanController));
router.post("/:id/reject", requireRole("BUSINESS_OWNER"), asyncHandler(rejectLoanController));
router.post("/:id/cancel", requireRole("BUSINESS_OWNER"), asyncHandler(cancelLoanController));

export default router;
