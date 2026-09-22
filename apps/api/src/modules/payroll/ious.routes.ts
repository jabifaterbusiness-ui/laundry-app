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
import { requirePermission } from "../../middleware/permissions.js";

const router = Router();

router.use(requireAuth);
router.use(requireBusinessContext);
router.use(requireBranchContext);

router.post(
  "/",
  requirePermission("ious.manage"),
  createIOUController,
);

router.get(
  "/",
  requirePermission("ious.view"),
  listIOUsController,
);

router.get(
  "/:id",
  requirePermission("ious.view"),
  getIOUController,
);

router.post(
  "/:id/approve",
  requirePermission("ious.approve"),
  approveIOUController,
);

router.post(
  "/:id/reject",
  requirePermission("ious.approve"),
  rejectIOUController,
);

router.post(
  "/:id/cancel",
  requirePermission("ious.cancel"),
  cancelIOUController,
);

export default router;
