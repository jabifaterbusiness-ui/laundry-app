import { Router } from "express";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireBusinessContext } from "../../middleware/business-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { requireRole } from "../../middleware/rbac.js";

import {
  createPayrollPeriodController,
  generatePayrollController,
  getPayrollPeriodController,
  listPayrollPeriodsController,
  processPayrollDeductionsController,
} from "./payroll.controller.js";

const router = Router();

const FINANCE_ROLES = ["BUSINESS_OWNER", "BRANCH_MANAGER"] as const;

router.use(asyncHandler(requireAuth));
router.use(asyncHandler(requireBusinessContext));
router.use(asyncHandler(requireBranchContext));

router.post(
  "/periods",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(createPayrollPeriodController),
);

router.get(
  "/periods",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(listPayrollPeriodsController),
);

router.get(
  "/periods/:id",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(getPayrollPeriodController),
);

router.post(
  "/periods/:id/generate",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(generatePayrollController),
);

router.post(
  "/periods/:id/deductions/process",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(processPayrollDeductionsController),
);

export default router;
