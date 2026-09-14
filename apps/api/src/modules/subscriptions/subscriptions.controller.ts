import type { Request, Response } from "express";
import {
  createOrRenewSubscription,
  getBusinessSubscription,
} from "./subscriptions.service.js";
import { createSubscriptionSchema } from "./subscriptions.validation.js";

export async function getSubscription(req: Request, res: Response) {
  if (!req.user?.businessId) {
    res.status(403).json({ message: "Business context required" });
    return;
  }

  res.status(200).json(
    await getBusinessSubscription(req.user.businessId),
  );
}

export async function createOrRenew(req: Request, res: Response) {
  if (!req.user?.businessId) {
    res.status(403).json({ message: "Business context required" });
    return;
  }

  const input = createSubscriptionSchema.parse(req.body);

  res.status(200).json(
    await createOrRenewSubscription(req.user.businessId, input),
  );
}
