import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { createOrRenew, getSubscription } from "./subscriptions.controller.js";

export const subscriptionsRouter = Router();

subscriptionsRouter.use(requireAuth, requireBusinessContext);

subscriptionsRouter.get("/", asyncHandler(getSubscription));

subscriptionsRouter.post(
  "/",
  requireRole("BUSINESS_OWNER"),
  asyncHandler(createOrRenew),
);
