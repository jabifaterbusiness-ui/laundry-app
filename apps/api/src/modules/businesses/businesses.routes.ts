import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  getBranding,
  updateBranding,
} from "./businesses.controller.js";

const VIEW_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
] as const;

const OWNER_ONLY = [
  "BUSINESS_OWNER",
] as const;

export const businessesRouter = Router();

businessesRouter.use(
  requireAuth,
  requireBusinessContext,
);

businessesRouter.get(
  "/branding",
  requireRole(...VIEW_ROLES),
  asyncHandler(getBranding),
);

businessesRouter.patch(
  "/branding",
  requireRole(...OWNER_ONLY),
  asyncHandler(updateBranding),
);
