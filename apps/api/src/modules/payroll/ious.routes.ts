import { Router } from "express";
import {
  approveIOUController,
  cancelIOUController,
  createIOUController,
  getIOUController,
  listIOUsController,
  rejectIOUController,
} from "./ious.controller.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireBusinessContext } from "../../middleware/business-context.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { requireRole } from "../../middleware/rbac.js";

const router = Router();

router.use(requireAuth);
router.use(requireBusinessContext);
router.use(requireBranchContext);

const FINANCE_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
] as const;

router.post(
  "/",
  requireRole(...FINANCE_ROLES),
  createIOUController,
);

router.get(
  "/",
  requireRole(...FINANCE_ROLES),
  listIOUsController,
);

router.get(
  "/:id",
  requireRole(...FINANCE_ROLES),
  getIOUController,
);

router.post(
  "/:id/approve",
  requireRole("BUSINESS_OWNER"),
  approveIOUController,
);

router.post(
  "/:id/reject",
  requireRole("BUSINESS_OWNER"),
  rejectIOUController,
);

router.post(
  "/:id/cancel",
  requireRole("BUSINESS_OWNER"),
  cancelIOUController,
);

export default router;
