import { Router } from "express";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { asyncHandler } from "../../middleware/async-handler.js";
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

const STATUS_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
] as const;

export const servicesRouter = Router();

servicesRouter.use(requireAuth, requireBusinessContext);

servicesRouter.post(
  "/",
  requireRole(...WRITE_ROLES),
  asyncHandler(create),
);

servicesRouter.get(
  "/",
  requireRole(...VIEW_ROLES),
  asyncHandler(list),
);

servicesRouter.get(
  "/:id",
  requireRole(...VIEW_ROLES),
  asyncHandler(getOne),
);

servicesRouter.patch(
  "/:id",
  requireRole(...WRITE_ROLES),
  asyncHandler(update),
);

servicesRouter.post(
  "/:id/activate",
  requireRole(...STATUS_ROLES),
  asyncHandler(activate),
);

servicesRouter.post(
  "/:id/deactivate",
  requireRole(...STATUS_ROLES),
  asyncHandler(deactivate),
);
