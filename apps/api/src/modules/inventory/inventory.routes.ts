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
  createTransfer,
  receiveTransfer,
  listTransfers,
  createStocktake,
  applyStocktake,
  submitStocktake,
  listStocktakes,
  approveStocktake,
  createReservation,
  listReservations,
  releaseReservation,
  reorderRecommendations,
  inventoryReports,
  inventoryBranchComparison,
} from "./inventory.controller.js";

export const inventoryRouter = Router();

inventoryRouter.use(
  requireAuth,
  requireBusinessContext,
);

inventoryRouter.get(
  "/",
  requirePermission("inventory.view"),
  asyncHandler(requireBranchContext),
  asyncHandler(listItems),
);

inventoryRouter.post(
  "/",
  requirePermission("inventory.manage"),
  asyncHandler(requireBranchContext),
  asyncHandler(createItem),
);

inventoryRouter.patch(
  "/:id",
  requirePermission("inventory.manage"),
  asyncHandler(requireBranchContext),
  asyncHandler(updateItem),
);

inventoryRouter.get(
  "/stock",
  requirePermission("inventory.view"),
  asyncHandler(requireBranchContext),
  asyncHandler(listStock),
);

inventoryRouter.get(
  "/movements",
  requirePermission("inventory.view"),
  asyncHandler(requireBranchContext),
  asyncHandler(listMovements),
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


inventoryRouter.get("/transfers", requirePermission("inventory.view"), asyncHandler(requireBranchContext), asyncHandler(listTransfers));
inventoryRouter.post("/transfers", requirePermission("inventory.manage"), asyncHandler(requireBranchContext), asyncHandler(createTransfer));
inventoryRouter.post("/transfers/:id/receive", requirePermission("inventory.manage"), asyncHandler(requireBranchContext), asyncHandler(receiveTransfer));
inventoryRouter.get("/stocktakes", requirePermission("inventory.view"), asyncHandler(requireBranchContext), asyncHandler(listStocktakes));
inventoryRouter.post("/stocktakes", requirePermission("inventory.manage"), asyncHandler(requireBranchContext), asyncHandler(createStocktake));
inventoryRouter.post("/stocktakes/:id/submit", requirePermission("inventory.manage"), asyncHandler(requireBranchContext), asyncHandler(submitStocktake));
inventoryRouter.post("/stocktakes/:id/approve", requirePermission("inventory.approve"), asyncHandler(requireBranchContext), asyncHandler(approveStocktake));
inventoryRouter.post("/stocktakes/:id/apply", requirePermission("inventory.manage"), asyncHandler(requireBranchContext), asyncHandler(applyStocktake));
inventoryRouter.get("/reservations", requirePermission("inventory.view"), asyncHandler(requireBranchContext), asyncHandler(listReservations));
inventoryRouter.post("/reservations", requirePermission("inventory.manage"), asyncHandler(requireBranchContext), asyncHandler(createReservation));
inventoryRouter.post("/reservations/:id/release", requirePermission("inventory.manage"), asyncHandler(requireBranchContext), asyncHandler(releaseReservation));
inventoryRouter.get("/reorder-recommendations", requirePermission("inventory.view"), asyncHandler(requireBranchContext), asyncHandler(reorderRecommendations));

inventoryRouter.get("/reports", requirePermission("inventory.view"), asyncHandler(requireBranchContext), asyncHandler(inventoryReports));
inventoryRouter.get("/reports/branch-comparison", requirePermission("inventory.reports_all_branches"), asyncHandler(inventoryBranchComparison));
