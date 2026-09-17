import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  createPaymentIntent,
  initializePayment,
  verifyPayment,
  getSubscription,
  getSubscriptionPrices,
  getPaymentOptions,
} from "./subscriptions.controller.js";

export const subscriptionsRouter = Router();

subscriptionsRouter.use(requireAuth, requireBusinessContext);

subscriptionsRouter.get("/", asyncHandler(getSubscription));

subscriptionsRouter.get(
  "/prices",
  requireRole("BUSINESS_OWNER"),
  asyncHandler(getSubscriptionPrices),
);

subscriptionsRouter.get(
  "/payment-options",
  requireRole("BUSINESS_OWNER"),
  asyncHandler(getPaymentOptions),
);
subscriptionsRouter.post(
  "/payment-intents",
  requireRole("BUSINESS_OWNER"),
  asyncHandler(createPaymentIntent),
);


subscriptionsRouter.post(
  "/payment-initialize",
  requireRole("BUSINESS_OWNER"),
  asyncHandler(initializePayment),
);


subscriptionsRouter.post(
  "/payment-verify",
  requireRole("BUSINESS_OWNER"),
  asyncHandler(verifyPayment),
);
