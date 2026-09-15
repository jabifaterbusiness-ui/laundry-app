import type { Request, Response } from "express";
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
} from "./platform.service.js";
import { createSubscriptionSchema } from "../subscriptions/subscriptions.validation.js";

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
