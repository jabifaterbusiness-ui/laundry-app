import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { listSuspiciousActivity } from "./audit.service.js";

export async function suspiciousActivity(req: Request, res: Response) {
  if (!req.user?.businessId) {
    throw new AppError("Business context required", 400);
  }

  const rawLimit = Number(req.query.limit ?? 100);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 100;

  res.status(200).json(
    await listSuspiciousActivity(req.user.businessId, limit),
  );
}
