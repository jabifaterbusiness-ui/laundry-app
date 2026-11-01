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
  cancelBusinessSubscription,
  suspendBusiness,
  clearBusinessSuspension,
  archiveBusiness,
  permanentlyDeleteBusiness,
  createPlatformMessage,
  listPlatformMessages,
  overview,
  revenue,
  growth,
  globalStatistics,
  health,
  configuration,
  updateConfiguration,
  subscriptionPrices,
  upsertSubscriptionPriceController,
  updateSubscriptionPriceStatus,
  deleteSubscriptionPriceController,
  paymentProviders,
  upsertPaymentProviderController,
  updatePaymentProviderStatus,
  deletePaymentProvider,
  paymentMethods,
  upsertPaymentMethodController,
  updatePaymentMethodStatus,
  deletePaymentMethod,
} from "./platform.controller.js";

export const platformRouter = Router();

platformRouter.use(requireAuth, requireRole("PLATFORM_ADMIN"));

platformRouter.get("/health", asyncHandler(health));
platformRouter.get("/configuration", asyncHandler(configuration));
platformRouter.patch(
  "/configuration",
  asyncHandler(updateConfiguration),
);
platformRouter.get(
  "/subscription-prices",
  asyncHandler(subscriptionPrices),
);
platformRouter.post(
  "/subscription-prices",
  asyncHandler(upsertSubscriptionPriceController),
);
platformRouter.patch(
  "/subscription-prices/:id/status",
  asyncHandler(updateSubscriptionPriceStatus),
);
platformRouter.delete(
  "/subscription-prices/:id",
  asyncHandler(deleteSubscriptionPriceController),
);

platformRouter.get(
  "/payment-providers",
  asyncHandler(paymentProviders),
);
platformRouter.post(
  "/payment-providers",
  asyncHandler(upsertPaymentProviderController),
);
platformRouter.patch(
  "/payment-providers/:id/status",
  asyncHandler(updatePaymentProviderStatus),
);
platformRouter.delete(
  "/payment-providers/:id",
  asyncHandler(deletePaymentProvider),
);
platformRouter.get(
  "/payment-methods",
  asyncHandler(paymentMethods),
);
platformRouter.post(
  "/payment-methods",
  asyncHandler(upsertPaymentMethodController),
);
platformRouter.patch(
  "/payment-methods/:id/status",
  asyncHandler(updatePaymentMethodStatus),
);
platformRouter.delete(
  "/payment-methods/:id",
  asyncHandler(deletePaymentMethod),
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
  "/businesses/:businessId/subscription/cancel",
  asyncHandler(cancelBusinessSubscription),
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

platformRouter.post("/businesses/:businessId/suspend", asyncHandler(suspendBusiness));
platformRouter.post("/businesses/:businessId/suspension/clear", asyncHandler(clearBusinessSuspension));

platformRouter.get("/messages", asyncHandler(listPlatformMessages));
platformRouter.post("/messages", asyncHandler(createPlatformMessage));

platformRouter.post("/businesses/:businessId/archive", asyncHandler(archiveBusiness));

platformRouter.delete("/businesses/:businessId/permanent", asyncHandler(permanentlyDeleteBusiness));
