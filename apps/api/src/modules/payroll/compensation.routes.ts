import { Router } from "express";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireBusinessContext } from "../../middleware/business-context.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  createCompensationController,
  getCompensationController,
  getCurrentCompensationController,
  listCompensationController,
} from "./compensation.controller.js";

const router = Router();

router.use(asyncHandler(requireAuth));
router.use(asyncHandler(requireBusinessContext));

router.post(
  "/",
  asyncHandler(requirePermission("compensation.manage")),
  asyncHandler(createCompensationController),
);

router.get(
  "/",
  asyncHandler(requirePermission("compensation.view")),
  asyncHandler(listCompensationController),
);

router.get(
  "/current/:employeeId",
  asyncHandler(requirePermission("compensation.view")),
  asyncHandler(getCurrentCompensationController),
);

router.get(
  "/:id",
  asyncHandler(requirePermission("compensation.view")),
  asyncHandler(getCompensationController),
);

export default router;
