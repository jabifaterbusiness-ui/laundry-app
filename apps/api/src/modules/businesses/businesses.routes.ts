import express, { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  getBranding,
  getLogo,
  removeLogo,
  updateBranding,
  uploadLogo,
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

businessesRouter.get(
  "/logo",
  requireRole(...VIEW_ROLES),
  asyncHandler(getLogo),
);

businessesRouter.post(
  "/logo",
  express.raw({
      type: ["image/png", "image/jpeg", "image/webp"],
      limit: "5mb",
  }),
  requireRole(...OWNER_ONLY),
  asyncHandler(uploadLogo),
);

businessesRouter.delete(
  "/logo",
  requireRole(...OWNER_ONLY),
  asyncHandler(removeLogo),
);
