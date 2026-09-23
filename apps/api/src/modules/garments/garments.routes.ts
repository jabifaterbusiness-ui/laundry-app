import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  createForOrder,
  getOne,
  list,
  updateStatus,
} from "./garments.controller.js";

export const garmentsRouter = Router();

garmentsRouter.use(
  requireAuth,
  requireBusinessContext,
  asyncHandler(requireBranchContext),
);

garmentsRouter.post(
  "/orders/:orderId/generate",
  requirePermission("garments.manage"),
  asyncHandler(createForOrder),
);

garmentsRouter.get(
  "/",
  requirePermission("garments.view"),
  asyncHandler(list),
);

garmentsRouter.get(
  "/:id",
  requirePermission("garments.view"),
  asyncHandler(getOne),
);

garmentsRouter.patch(
  "/:id/status",
  requirePermission("garments.manage"),
  asyncHandler(updateStatus),
);
