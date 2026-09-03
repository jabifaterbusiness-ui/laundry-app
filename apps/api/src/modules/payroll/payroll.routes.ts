import { Router } from "express";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireBusinessContext } from "../../middleware/business-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { requireRole } from "../../middleware/rbac.js";

import {
  createPayrollPeriodController,
  finalizePayrollController,
  generatePayrollController,
  getPayrollPeriodController,
  getPayrollStatusController,
  listPayrollPeriodsController,
  processPayrollDeductionsController,
} from "./payroll.controller.js";

import {
  createPayrollPaymentController,
  getPayrollPaymentController,
  listPayrollPaymentsController,
  voidPayrollPaymentController,
} from "./payroll-payments.controller.js";

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

router.get(
  "/periods/:id/status",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(getPayrollStatusController),
);

router.post(
  "/periods/:id/generate",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(generatePayrollController),
);

router.post(
  "/periods/:id/finalize",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(finalizePayrollController),
);

router.post(
  "/periods/:id/deductions/process",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(processPayrollDeductionsController),
);

router.post(
  "/payments",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(createPayrollPaymentController),
);

router.get(
  "/payments",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(listPayrollPaymentsController),
);

router.get(
  "/payments/:id",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(getPayrollPaymentController),
);

router.post(
  "/payments/:id/void",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(voidPayrollPaymentController),
);

export default router;
