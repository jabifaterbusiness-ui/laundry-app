import { Router } from "express";

import {
  requireAuth,
  requireSensitiveAuthorization,
} from "../auth/auth.middleware.js";
import { requireBusinessContext } from "../../middleware/business-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { requirePermission } from "../../middleware/permissions.js";

import {
  approvePayrollController,
  createPayrollPeriodController,
  declinePayrollController,
  finalizePayrollController,
  generatePayrollController,
  getPayrollPeriodController,
  getPayrollStatusController,
  listPayrollPeriodsController,
  processPayrollDeductionsController,
  submitPayrollForApprovalController,
} from "./payroll.controller.js";

import {
  createPayrollPaymentController,
  getPayrollPaymentController,
  listPayrollPaymentsController,
  voidPayrollPaymentController,
} from "./payroll-payments.controller.js";

const router = Router();

router.use(asyncHandler(requireAuth));
router.use(asyncHandler(requireBusinessContext));
router.use(asyncHandler(requireBranchContext));

router.post(
  "/periods",
  asyncHandler(requirePermission("payroll.manage")),
  asyncHandler(createPayrollPeriodController),
);

router.get(
  "/periods",
  asyncHandler(requirePermission("payroll.view")),
  asyncHandler(listPayrollPeriodsController),
);

router.get(
  "/periods/:id",
  asyncHandler(requirePermission("payroll.view")),
  asyncHandler(getPayrollPeriodController),
);

router.get(
  "/periods/:id/status",
  asyncHandler(requirePermission("payroll.view")),
  asyncHandler(getPayrollStatusController),
);

router.post(
  "/periods/:id/generate",
  asyncHandler(requirePermission("payroll.manage")),
  asyncHandler(generatePayrollController),
);

router.post(
  "/periods/:id/submit",
  asyncHandler(requirePermission("payroll.manage")),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(submitPayrollForApprovalController),
);

router.post(
  "/periods/:id/approve",
  asyncHandler(requirePermission("payroll.approve")),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(approvePayrollController),
);

router.post(
  "/periods/:id/decline",
  asyncHandler(requirePermission("payroll.approve")),
  asyncHandler(requireSensitiveAuthorization),
  asyncHandler(declinePayrollController),
);

router.post(
  "/periods/:id/finalize",
  asyncHandler(requirePermission("payroll.manage")),
  asyncHandler(finalizePayrollController),
);

router.post(
  "/periods/:id/deductions/process",
  asyncHandler(requirePermission("payroll.manage")),
  asyncHandler(processPayrollDeductionsController),
);

router.post(
  "/payments",
  asyncHandler(requirePermission("payroll.manage")),
  asyncHandler(createPayrollPaymentController),
);

router.get(
  "/payments",
  asyncHandler(requirePermission("payroll.view")),
  asyncHandler(listPayrollPaymentsController),
);

router.get(
  "/payments/:id",
  asyncHandler(requirePermission("payroll.view")),
  asyncHandler(getPayrollPaymentController),
);

router.post(
  "/payments/:id/void",
  asyncHandler(requirePermission("payroll.manage")),
  asyncHandler(voidPayrollPaymentController),
);

export default router;
