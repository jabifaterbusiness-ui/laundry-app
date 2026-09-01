import { Router } from "express";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireBusinessContext } from "../../middleware/business-context.js";
import { requireRole } from "../../middleware/rbac.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  createCompensationController,
  getCompensationController,
  getCurrentCompensationController,
  listCompensationController,
} from "./compensation.controller.js";

const router = Router();

const FINANCE_ROLES = ["BUSINESS_OWNER", "BRANCH_MANAGER"] as const;

router.use(asyncHandler(requireAuth));
router.use(asyncHandler(requireBusinessContext));

router.post(
  "/",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(createCompensationController),
);

router.get(
  "/",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(listCompensationController),
);

router.get(
  "/current/:employeeId",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(getCurrentCompensationController),
);

router.get(
  "/:id",
  asyncHandler(requireRole(...FINANCE_ROLES)),
  asyncHandler(getCompensationController),
);

export default router;
