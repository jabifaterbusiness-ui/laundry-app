import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  auditLogs,
  businesses,
  businessDetails,
  renewBusinessSubscription,
  activateBusiness,
  deactivateBusiness,
  overview,
  revenue,
  growth,
  globalStatistics,
  health,
  configuration,
  updateConfiguration,
} from "./platform.controller.js";

export const platformRouter = Router();

platformRouter.use(requireAuth, requireRole("PLATFORM_ADMIN"));

platformRouter.get("/health", asyncHandler(health));
platformRouter.get("/configuration", asyncHandler(configuration));
platformRouter.patch(
  "/configuration",
  asyncHandler(updateConfiguration),
);
platformRouter.get("/overview", asyncHandler(overview));
platformRouter.get("/revenue", asyncHandler(revenue));
platformRouter.get("/growth", asyncHandler(growth));
platformRouter.get("/global-statistics", asyncHandler(globalStatistics));
platformRouter.get("/businesses", asyncHandler(businesses));
platformRouter.get(
  "/businesses/:businessId",
  asyncHandler(businessDetails),
);
platformRouter.post(
  "/businesses/:businessId/subscription",
  asyncHandler(renewBusinessSubscription),
);
platformRouter.post(
  "/businesses/:businessId/activate",
  asyncHandler(activateBusiness),
);
platformRouter.post(
  "/businesses/:businessId/deactivate",
  asyncHandler(deactivateBusiness),
);
platformRouter.get("/audit-logs", asyncHandler(auditLogs));
