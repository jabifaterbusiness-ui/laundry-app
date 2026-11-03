import { Router } from "express";
import { createAdjustment, createTax, list as listPricingRules, removeAdjustment, removeTax } from "./pricing-rules.controller.js";
import { list as listCustomerPrices, remove as removeCustomerPrice, save as saveCustomerPrice } from "./customer-pricing.controller.js";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  activate,
  create,
  deactivate,
  getOne,
  list,
  update,
} from "./services.controller.js";

// Services / Price List authorization:
//
// create        BUSINESS_OWNER, BRANCH_MANAGER, STAFF
// view          BUSINESS_OWNER, BRANCH_MANAGER, STAFF
// update        BUSINESS_OWNER, BRANCH_MANAGER, STAFF
// activate      BUSINESS_OWNER, BRANCH_MANAGER
// deactivate    BUSINESS_OWNER, BRANCH_MANAGER
//
// PLATFORM_ADMIN is excluded because service records are tenant-scoped.

export const servicesRouter = Router();

servicesRouter.use(requireAuth, requireBusinessContext);

// Price adjustments and tax rules are part of the Price List settings.
servicesRouter.get("/pricing-rules", requirePermission("services.view"), asyncHandler(listPricingRules));
servicesRouter.get("/customer-prices", requirePermission("services.view"), asyncHandler(listCustomerPrices));
servicesRouter.put("/customer-prices", requirePermission("services.update"), asyncHandler(saveCustomerPrice));
servicesRouter.delete("/customer-prices/:id", requirePermission("services.update"), asyncHandler(removeCustomerPrice));

servicesRouter.post("/price-adjustments", requirePermission("services.update"), asyncHandler(createAdjustment));
servicesRouter.delete("/price-adjustments/:id", requirePermission("services.update"), asyncHandler(removeAdjustment));
servicesRouter.post("/tax-rules", requirePermission("services.update"), asyncHandler(createTax));
servicesRouter.delete("/tax-rules/:id", requirePermission("services.update"), asyncHandler(removeTax));


servicesRouter.post(
  "/",
  requirePermission("services.create"),
  asyncHandler(create),
);

servicesRouter.get(
  "/",
  requirePermission("services.view"),
  asyncHandler(list),
);

servicesRouter.get(
  "/:id",
  requirePermission("services.view"),
  asyncHandler(getOne),
);

servicesRouter.patch(
  "/:id",
  requirePermission("services.update"),
  asyncHandler(update),
);

servicesRouter.post(
  "/:id/activate",
  requirePermission("services.change_status"),
  asyncHandler(activate),
);

servicesRouter.post(
  "/:id/deactivate",
  requirePermission("services.change_status"),
  asyncHandler(deactivate),
);
