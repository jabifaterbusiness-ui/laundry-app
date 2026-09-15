import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  auditLogs,
  businesses,
  businessDetails,
  renewBusinessSubscription,
  overview,
} from "./platform.controller.js";

export const platformRouter = Router();

platformRouter.use(requireAuth, requireRole("PLATFORM_ADMIN"));

platformRouter.get("/overview", asyncHandler(overview));
platformRouter.get("/businesses", asyncHandler(businesses));
platformRouter.get(
  "/businesses/:businessId",
  asyncHandler(businessDetails),
);
platformRouter.post(
  "/businesses/:businessId/subscription",
  asyncHandler(renewBusinessSubscription),
);
platformRouter.get("/audit-logs", asyncHandler(auditLogs));
