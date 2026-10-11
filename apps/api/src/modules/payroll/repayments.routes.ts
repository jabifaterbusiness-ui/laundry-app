import { Router } from "express";

import {
  createRepaymentController,
  getRepaymentController,
  listRepaymentsController,
  listRepaymentSourcesController,
  voidRepaymentController,
} from "./repayments.controller.js";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireBusinessContext } from "../../middleware/business-context.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../middleware/async-handler.js";

const router = Router();

router.use(requireAuth);
router.use(asyncHandler(requireBusinessContext));
router.use(asyncHandler(requireBranchContext));

router.post(
  "/",
  requirePermission("repayments.manage"),
  asyncHandler(createRepaymentController),
);

router.get(
  "/",
  requirePermission("repayments.view"),
  asyncHandler(listRepaymentsController),
);

router.get(
  "/sources",
  requirePermission("repayments.manage"),
  asyncHandler(listRepaymentSourcesController),
);

router.get(
  "/:id",
  requirePermission("repayments.view"),
  asyncHandler(getRepaymentController),
);

router.post(
  "/:id/void",
  requirePermission("repayments.void"),
  asyncHandler(voidRepaymentController),
);

export default router;
