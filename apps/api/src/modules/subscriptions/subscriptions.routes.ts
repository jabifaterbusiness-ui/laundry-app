import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  createPaymentIntent,
  getPaymentIntent,
  reconcilePayment,
  initializePayment,
  verifyPayment,
  getSubscription,
  getSubscriptionPrices,
  getPaymentOptions,
} from "./subscriptions.controller.js";

export const subscriptionsRouter = Router();

subscriptionsRouter.use(requireAuth, requireBusinessContext);

subscriptionsRouter.get("/", asyncHandler(requirePermission("subscriptions.view")), asyncHandler(getSubscription));

subscriptionsRouter.get(
  "/prices",
  asyncHandler(requirePermission("subscriptions.manage")),
  asyncHandler(getSubscriptionPrices),
);

subscriptionsRouter.get(
  "/payment-options",
  asyncHandler(requirePermission("subscriptions.manage")),
  asyncHandler(getPaymentOptions),
);
subscriptionsRouter.post(
  "/payment-intents",
  asyncHandler(requirePermission("subscriptions.manage")),
  asyncHandler(createPaymentIntent),
);


subscriptionsRouter.get(
  "/payment-intents/:intentId",
  asyncHandler(requirePermission("subscriptions.manage")),
  asyncHandler(getPaymentIntent),
);

subscriptionsRouter.post(
  "/payment-reconcile",
  asyncHandler(requirePermission("subscriptions.manage")),
  asyncHandler(reconcilePayment),
);


subscriptionsRouter.post(
  "/payment-initialize",
  asyncHandler(requirePermission("subscriptions.manage")),
  asyncHandler(initializePayment),
);


subscriptionsRouter.post(
  "/payment-verify",
  asyncHandler(requirePermission("subscriptions.manage")),
  asyncHandler(verifyPayment),
);
