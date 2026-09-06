import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  createItem,
  updateItem,
  listItems,
  listStock,
  createMovement,
  adjustStock,
} from "./inventory.controller.js";

const VIEW_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
] as const;

const WRITE_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
] as const;

export const inventoryRouter = Router();

inventoryRouter.use(
  requireAuth,
  requireBusinessContext,
);

inventoryRouter.get(
  "/",
  requireRole(...VIEW_ROLES),
  requirePermission("inventory.view"),
  asyncHandler(listItems),
);

inventoryRouter.post(
  "/",
  requireRole(...WRITE_ROLES),
  requirePermission("inventory.manage"),
  asyncHandler(createItem),
);

inventoryRouter.patch(
  "/:id",
  requireRole(...WRITE_ROLES),
  requirePermission("inventory.manage"),
  asyncHandler(updateItem),
);

inventoryRouter.get(
  "/stock",
  requireRole(...VIEW_ROLES),
  requirePermission("inventory.view"),
  asyncHandler(requireBranchContext),
  asyncHandler(listStock),
);

inventoryRouter.post(
  "/movements",
  requireRole(...WRITE_ROLES),
  requirePermission("inventory.manage"),
  asyncHandler(requireBranchContext),
  asyncHandler(createMovement),
);

inventoryRouter.post(
  "/stock/adjust",
  requireRole(...WRITE_ROLES),
  requirePermission("inventory.manage"),
  asyncHandler(requireBranchContext),
  asyncHandler(adjustStock),
);
