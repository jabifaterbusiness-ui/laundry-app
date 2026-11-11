import express, { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  getBranding,
  getLogo,
  removeLogo,
  updateBranding,
  uploadLogo,
  getSecuritySettings,
  updateSecuritySettings,
} from "./businesses.controller.js";

export const businessesRouter = Router();

businessesRouter.use(
  requireAuth,
  requireBusinessContext,
);

businessesRouter.get(
  "/branding",
  requirePermission("business.view"),
  asyncHandler(getBranding),
);

businessesRouter.patch(
  "/branding",
  requirePermission("business.update"),
  asyncHandler(updateBranding),
);

businessesRouter.get(
  "/security-settings",
  requirePermission("business.view"),
  asyncHandler(getSecuritySettings),
);

businessesRouter.patch(
  "/security-settings",
  requirePermission("business.update"),
  asyncHandler(updateSecuritySettings),
);

businessesRouter.get(
  "/logo",
  requirePermission("business.view"),
  asyncHandler(getLogo),
);

businessesRouter.post(
  "/logo",
  express.raw({
    type: ["image/png", "image/jpeg", "image/webp"],
    limit: "5mb",
  }),
  requirePermission("business.update"),
  asyncHandler(uploadLogo),
);

businessesRouter.delete(
  "/logo",
  requirePermission("business.update"),
  asyncHandler(removeLogo),
);
