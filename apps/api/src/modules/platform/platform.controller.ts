import type { Request, Response } from "express";
import {
  getPlatformOverview,
  listPlatformAuditLogs,
  listPlatformBusinesses,
} from "./platform.service.js";

export async function overview(_req: Request, res: Response) {
  res.status(200).json(await getPlatformOverview());
}

export async function businesses(_req: Request, res: Response) {
  res.status(200).json(await listPlatformBusinesses());
}

export async function auditLogs(req: Request, res: Response) {
  const rawLimit = Number(req.query.limit ?? 100);
  const limit = Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 100;

  res.status(200).json(await listPlatformAuditLogs(limit));
}
