import { Router } from "express";
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
