import type { Request, Response } from "express";
import { getBusinessSubscription } from "./subscriptions.service.js";
import { getBusinessSubscriptionPrices } from "./subscription-pricing.service.js";
import { getSubscriptionPaymentOptions } from "./subscription-payment-options.service.js";
import { createSubscriptionSchema } from "./subscriptions.validation.js";
import { createSubscriptionPaymentIntent } from "./subscription-payment-intent.service.js";
import { createSubscriptionPaymentIntentSchema } from "./subscription-payment-intent.validation.js";
import { initializeSubscriptionPayment } from "./subscription-payment-initialization.service.js";
import { initializeSubscriptionPaymentSchema } from "./subscription-payment-initialization.validation.js";
import { verifySubscriptionPayment } from "./subscription-payment-verification.service.js";
import { verifySubscriptionPaymentSchema } from "./subscription-payment-verification.validation.js";

export async function getSubscription(req: Request, res: Response) {
  if (!req.user?.businessId) {
    res.status(403).json({ message: "Business context required" });
    return;
  }

  res.status(200).json(
    await getBusinessSubscription(req.user.businessId),
  );
}

export async function getSubscriptionPrices(req: Request, res: Response) {
  if (!req.user?.businessId) {
    res.status(403).json({ message: "Business context required" });
    return;
  }

  res.status(200).json(
    await getBusinessSubscriptionPrices(req.user.businessId),
  );
}

export async function getPaymentOptions(req: Request, res: Response) {
  if (!req.user?.businessId) {
    res.status(403).json({ message: "Business context required" });
    return;
  }

  res.status(200).json(
    await getSubscriptionPaymentOptions(req.user.businessId),
  );
}

export async function createPaymentIntent(req: Request, res: Response) {
  if (!req.user?.businessId) {
    res.status(403).json({ message: "Business context required" });
    return;
  }

  const input = createSubscriptionPaymentIntentSchema.parse(req.body);

  res.status(201).json(
    await createSubscriptionPaymentIntent(
      req.user.businessId,
      input,
      req.user.id,
      req.correlationId ?? null,
    ),
  );
}


export async function initializePayment(req: Request, res: Response) {
  if (!req.user?.businessId) {
    res.status(403).json({ message: "Business context required" });
    return;
  }

  const input = initializeSubscriptionPaymentSchema.parse(req.body);

  res.status(200).json(
    await initializeSubscriptionPayment(
      req.user.businessId,
      input.intentId,
      req.user.id,
      req.correlationId ?? null,
    ),
  );
}


export async function verifyPayment(req: Request, res: Response) {
  if (!req.user?.businessId) {
    res.status(403).json({ message: "Business context required" });
    return;
  }

  const input = verifySubscriptionPaymentSchema.parse(req.body);

  res.status(200).json(
    await verifySubscriptionPayment(
      req.user.businessId,
      input.intentId,
      req.user.id,
      req.correlationId ?? null,
    ),
  );
}
