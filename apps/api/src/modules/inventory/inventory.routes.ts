import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
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
  listMovements,
  createSupplier,
  listSuppliers,
  createPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrder,
} from "./inventory.controller.js";

export const inventoryRouter = Router();

inventoryRouter.use(
  requireAuth,
  requireBusinessContext,
);

inventoryRouter.get(
  "/",
  requirePermission("inventory.view"),
  asyncHandler(listItems),
);

inventoryRouter.post(
  "/",
  requirePermission("inventory.manage"),
  asyncHandler(createItem),
);

inventoryRouter.patch(
  "/:id",
  requirePermission("inventory.manage"),
  asyncHandler(updateItem),
);

inventoryRouter.get(
  "/stock",
  requirePermission("inventory.view"),
  asyncHandler(requireBranchContext),
  asyncHandler(listStock),
);

inventoryRouter.post(
  "/movements",
  requirePermission("inventory.manage"),
  asyncHandler(requireBranchContext),
  asyncHandler(createMovement),
);

inventoryRouter.post(
  "/stock/adjust",
  requirePermission("inventory.manage"),
  asyncHandler(requireBranchContext),
  asyncHandler(adjustStock),
);


inventoryRouter.get("/suppliers", requirePermission("inventory.view"), asyncHandler(listSuppliers));
inventoryRouter.post("/suppliers", requirePermission("inventory.manage"), asyncHandler(createSupplier));
inventoryRouter.get("/purchase-orders", requirePermission("inventory.view"), asyncHandler(requireBranchContext), asyncHandler(listPurchaseOrders));
inventoryRouter.post("/purchase-orders", requirePermission("inventory.manage"), asyncHandler(requireBranchContext), asyncHandler(createPurchaseOrder));
inventoryRouter.post("/purchase-orders/:id/receive", requirePermission("inventory.manage"), asyncHandler(requireBranchContext), asyncHandler(receivePurchaseOrder));
