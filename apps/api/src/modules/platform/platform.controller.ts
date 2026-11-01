import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import {
  getPlatformOverview,
  getPlatformRevenueAnalytics,
  getPlatformGrowthAnalytics,
  getPlatformGlobalStatistics,
  getPlatformHealth,
  listPlatformAuditLogs,
  listPlatformBusinesses,
  getPlatformBusinessDetails,
  renewPlatformBusinessSubscription,
  setPlatformBusinessActiveStatus,
  cancelPlatformBusinessSubscription,
  suspendPlatformBusiness,
  clearPlatformBusinessSuspension,
  archivePlatformBusiness,
  createPlatformAnnouncement,
  listPlatformAnnouncements,
} from "./platform.service.js";
import { createSubscriptionSchema } from "../subscriptions/subscriptions.validation.js";
import { updatePlatformConfigSchema } from "./platform-config.validation.js";
import {
  getPlatformConfig,
  updatePlatformConfig,
} from "./platform-config.service.js";
import {
  listSubscriptionPrices,
  setSubscriptionPriceActive,
  deleteSubscriptionPrice,
  upsertSubscriptionPrice,
} from "../subscriptions/subscription-pricing.service.js";
import {
  subscriptionPricingSchema,
  subscriptionPriceStatusSchema,
} from "../subscriptions/subscription-pricing.validation.js";
import {
  listPaymentProviders,
  upsertPaymentProvider,
  setPaymentProviderActive,
  removePaymentProvider,
  listPaymentMethods,
  upsertPaymentMethod,
  setPaymentMethodActive,
  removePaymentMethod,
} from "./payment-config.service.js";
import {
  paymentProviderSchema,
  paymentProviderStatusSchema,
  paymentMethodSchema,
  paymentMethodStatusSchema,
} from "./payment-config.validation.js";

export async function health(_req: Request, res: Response) {
  const result = await getPlatformHealth();
  res.status(result.status === "healthy" ? 200 : 503).json(result);
}

export async function overview(_req: Request, res: Response) {
  res.status(200).json(await getPlatformOverview());
}

export async function revenue(_req: Request, res: Response) {
  res.status(200).json(await getPlatformRevenueAnalytics());
}

export async function growth(_req: Request, res: Response) {
  res.status(200).json(await getPlatformGrowthAnalytics());
}

export async function globalStatistics(_req: Request, res: Response) {
  res.status(200).json(await getPlatformGlobalStatistics());
}

export async function businesses(_req: Request, res: Response) {
  res.status(200).json(await listPlatformBusinesses());
}

export async function auditLogs(req: Request, res: Response) {
  const rawLimit = Number(req.query.limit ?? 100);
  const limit = Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 100;

  res.status(200).json(await listPlatformAuditLogs(limit));
}


export async function businessDetails(req: Request, res: Response) {
  const businessId = req.params.businessId;

  if (!businessId) {
    res.status(400).json({ message: "Business ID is required" });
    return;
  }

  res.status(200).json(await getPlatformBusinessDetails(businessId));
}

export async function activateBusiness(req: Request, res: Response) {
  const businessId = req.params.businessId;

  if (!businessId) {
    res.status(400).json({ message: "Business ID is required" });
    return;
  }

  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  res.status(200).json(
    await setPlatformBusinessActiveStatus(
      businessId,
      true,
      req.user.id,
      req.correlationId,
    ),
  );
}

export async function deactivateBusiness(req: Request, res: Response) {
  const businessId = req.params.businessId;

  if (!businessId) {
    res.status(400).json({ message: "Business ID is required" });
    return;
  }

  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  res.status(200).json(
    await setPlatformBusinessActiveStatus(
      businessId,
      false,
      req.user.id,
      req.correlationId,
    ),
  );
}


export async function renewBusinessSubscription(req: Request, res: Response) {
  const businessId = req.params.businessId;

  if (!businessId) {
    res.status(400).json({ message: "Business ID is required" });
    return;
  }

  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const input = createSubscriptionSchema.parse(req.body);

  res.status(200).json(
    await renewPlatformBusinessSubscription(
      businessId,
      input,
      req.user.id,
      req.correlationId,
    ),
  );
}


export async function configuration(req: Request, res: Response) {
  res.status(200).json(await getPlatformConfig());
}

export async function updateConfiguration(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const input = updatePlatformConfigSchema.parse(req.body);

  res.status(200).json(
    await updatePlatformConfig(
      input,
      req.user.id,
      req.correlationId,
    ),
  );
}

export async function subscriptionPrices(_req: Request, res: Response) {
  res.status(200).json(await listSubscriptionPrices());
}

export async function upsertSubscriptionPriceController(
  req: Request,
  res: Response,
) {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const input = subscriptionPricingSchema.parse(req.body);

  res.status(200).json(
    await upsertSubscriptionPrice(
      input,
      req.user.id,
      req.correlationId,
    ),
  );
}

export async function updateSubscriptionPriceStatus(
  req: Request,
  res: Response,
) {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const priceId = req.params.id;

  if (!priceId) {
    res.status(400).json({ message: "Subscription price ID is required" });
    return;
  }

  const input = subscriptionPriceStatusSchema.parse(req.body);

  res.status(200).json(
    await setSubscriptionPriceActive(
      priceId,
      input.isActive,
      req.user.id,
      req.correlationId,
    ),
  );
}



export async function deleteSubscriptionPriceController(
  req: Request,
  res: Response,
) {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const priceId = req.params.id;

  if (!priceId) {
    res.status(400).json({ message: "Subscription price ID is required" });
    return;
  }

  res.status(200).json(
    await deleteSubscriptionPrice(
      priceId,
      req.user.id,
      req.correlationId,
    ),
  );
}


export async function paymentProviders(_req: Request, res: Response) {
  res.status(200).json(await listPaymentProviders());
}

export async function upsertPaymentProviderController(
  req: Request,
  res: Response,
) {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const input = paymentProviderSchema.parse(req.body);

  res.status(200).json(
    await upsertPaymentProvider(
      input,
      req.user.id,
      req.correlationId,
    ),
  );
}

export async function updatePaymentProviderStatus(
  req: Request,
  res: Response,
) {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const id = req.params.id;

  if (!id) {
    res.status(400).json({ message: "Payment provider ID is required" });
    return;
  }

  const input = paymentProviderStatusSchema.parse(req.body);

  res.status(200).json(
    await setPaymentProviderActive(
      id,
      input.enabled,
      req.user.id,
      req.correlationId,
    ),
  );
}

export async function deletePaymentProvider(
  req: Request,
  res: Response,
) {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const id = req.params.id;

  if (!id) {
    res.status(400).json({ message: "Payment provider ID is required" });
    return;
  }

  res.status(200).json(
    await removePaymentProvider(
      id,
      req.user.id,
      req.correlationId,
    ),
  );
}

export async function paymentMethods(_req: Request, res: Response) {
  res.status(200).json(await listPaymentMethods());
}

export async function upsertPaymentMethodController(
  req: Request,
  res: Response,
) {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const input = paymentMethodSchema.parse(req.body);

  res.status(200).json(
    await upsertPaymentMethod(
      input,
      req.user.id,
      req.correlationId,
    ),
  );
}

export async function updatePaymentMethodStatus(
  req: Request,
  res: Response,
) {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const id = req.params.id;

  if (!id) {
    res.status(400).json({ message: "Payment method ID is required" });
    return;
  }

  const input = paymentMethodStatusSchema.parse(req.body);

  res.status(200).json(
    await setPaymentMethodActive(
      id,
      input.enabled,
      req.user.id,
      req.correlationId,
    ),
  );
}

export async function deletePaymentMethod(
  req: Request,
  res: Response,
) {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const id = req.params.id;

  if (!id) {
    res.status(400).json({ message: "Payment method ID is required" });
    return;
  }

  res.status(200).json(
    await removePaymentMethod(
      id,
      req.user.id,
      req.correlationId,
    ),
  );
}


export async function cancelBusinessSubscription(req: Request, res: Response) {
  const businessId = req.params.businessId;
  if (!businessId) {
    res.status(400).json({ message: "Business ID is required" });
    return;
  }
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const body = req.body as { when?: unknown; reason?: unknown };
  if (body.when !== "IMMEDIATE" && body.when !== "PERIOD_END") {
    res.status(422).json({ message: "Cancellation timing must be IMMEDIATE or PERIOD_END" });
    return;
  }
  if (typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.trim().length > 1000) {
    res.status(422).json({ message: "A cancellation reason between 3 and 1000 characters is required" });
    return;
  }

  res.status(200).json(await cancelPlatformBusinessSubscription(
    businessId,
    body.when,
    body.reason.trim(),
    req.user.id,
    req.correlationId,
  ));
}


export async function suspendBusiness(req: Request, res: Response) {
  const businessId = req.params.businessId;
  if (!businessId) { res.status(400).json({ message: "Business ID is required" }); return; }
  if (!req.user) { res.status(401).json({ message: "Authentication required" }); return; }
  const body = req.body as { durationDays?: unknown; reason?: unknown };
  if (typeof body.durationDays !== "number" || !Number.isInteger(body.durationDays) || body.durationDays < 1 || body.durationDays > 365) { res.status(422).json({ message: "Suspension duration must be a whole number from 1 to 365 days" }); return; }
  if (typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.trim().length > 1000) { res.status(422).json({ message: "A suspension reason between 3 and 1000 characters is required" }); return; }
  const until = new Date(Date.now() + body.durationDays * 86400000);
  res.status(200).json(await suspendPlatformBusiness(businessId, until, body.reason.trim(), req.user.id, req.correlationId));
}

export async function clearBusinessSuspension(req: Request, res: Response) {
  const businessId = req.params.businessId;
  if (!businessId) { res.status(400).json({ message: "Business ID is required" }); return; }
  if (!req.user) { res.status(401).json({ message: "Authentication required" }); return; }
  res.status(200).json(await clearPlatformBusinessSuspension(businessId, req.user.id, req.correlationId));
}

 
export async function createPlatformMessage(req: Request, res: Response) {
  if (!req.user) throw new AppError("Authentication required", 401);
  const body = req.body as { title?: unknown; body?: unknown; businessId?: unknown; publishedAt?: unknown; expiresAt?: unknown; displayDurationMinutes?: unknown };
  if (typeof body.title !== "string" || body.title.trim().length < 3 || body.title.trim().length > 160) throw new AppError("Message title must be between 3 and 160 characters", 422);
  if (typeof body.body !== "string" || body.body.trim().length < 3 || body.body.trim().length > 5000) throw new AppError("Message body must be between 3 and 5000 characters", 422);
  if (body.businessId !== undefined && (typeof body.businessId !== "string" || !body.businessId.trim())) throw new AppError("Business ID must be a non-empty string when provided", 422);
  const duration = body.displayDurationMinutes ?? 10;
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 1 || duration > 60) throw new AppError("Popup duration must be a whole number from 1 to 60 minutes", 422);
  const publishedAt = body.publishedAt === undefined ? new Date() : new Date(String(body.publishedAt));
  if (!Number.isFinite(publishedAt.getTime())) throw new AppError("A valid publication date is required", 422);
  const expiresAt = body.expiresAt === undefined || body.expiresAt === null ? null : new Date(String(body.expiresAt));
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= publishedAt)) throw new AppError("Expiry must be a valid date after publication", 422);
  const result = await createPlatformAnnouncement({
    title: body.title.trim(), body: body.body.trim(),
    businessId: typeof body.businessId === "string" ? body.businessId : null,
    publishedAt, expiresAt, displayDurationMinutes: duration,
    actorUserId: req.user.id, correlationId: req.correlationId,
  });
  res.status(201).json(result);
}

export async function listPlatformMessages(_req: Request, res: Response) {
  res.status(200).json(await listPlatformAnnouncements());
}


export async function archiveBusiness(req: Request, res: Response) {
  const businessId = req.params.businessId;
  if (!businessId) throw new AppError("Business ID is required", 400);
  if (!req.user) throw new AppError("Authentication required", 401);
  res.status(200).json(await archivePlatformBusiness(businessId, req.user.id, req.correlationId));
}
