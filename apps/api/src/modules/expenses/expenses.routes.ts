import { Router } from "express";

import {
  approveExpenseController,
  createExpenseController,
  getExpenseController,
  listExpensesController,
  recognizeExpenseController,
  rejectExpenseController,
  voidExpenseController,
} from "./expenses.controller.js";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireBusinessContext } from "../../middleware/business-context.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../middleware/async-handler.js";

const router = Router();

router.use(asyncHandler(requireAuth));
router.use(asyncHandler(requireBusinessContext));
router.use(asyncHandler(requireBranchContext));

router.post(
  "/",
  asyncHandler(requirePermission("expenses.manage")),
  asyncHandler(createExpenseController),
);

router.get(
  "/",
  asyncHandler(requirePermission("expenses.view")),
  asyncHandler(listExpensesController),
);

router.get(
  "/:id",
  asyncHandler(requirePermission("expenses.view")),
  asyncHandler(getExpenseController),
);

router.post(
  "/:id/approve",
  asyncHandler(requirePermission("expenses.approve")),
  asyncHandler(approveExpenseController),
);

router.post(
  "/:id/reject",
  asyncHandler(requirePermission("expenses.approve")),
  asyncHandler(rejectExpenseController),
);

router.post(
  "/:id/recognize",
  asyncHandler(requirePermission("expenses.recognize")),
  asyncHandler(recognizeExpenseController),
);

router.post(
  "/:id/void",
  asyncHandler(requirePermission("expenses.void")),
  asyncHandler(voidExpenseController),
);

export default router;
