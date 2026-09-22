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
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../middleware/async-handler.js";

const router = Router();

router.use(requireAuth);
router.use(asyncHandler(requireBusinessContext));
router.use(asyncHandler(requireBranchContext));

router.post("/", requirePermission("loans.manage"), asyncHandler(createLoanController));
router.get("/", requirePermission("loans.view"), asyncHandler(listLoansController));
router.get("/:id", requirePermission("loans.view"), asyncHandler(getLoanController));
router.post("/:id/approve", requirePermission("loans.approve"), asyncHandler(approveLoanController));
router.post("/:id/reject", requirePermission("loans.approve"), asyncHandler(rejectLoanController));
router.post("/:id/cancel", requirePermission("loans.cancel"), asyncHandler(cancelLoanController));

export default router;
