import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { requireActiveSubscription } from "./subscriptions.service.js";

export async function requireActiveBusinessSubscription(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    next(new AppError("Authentication required", 401));
    return;
  }

  // Platform administrators are not tenant-scoped and must retain access
  // to administrative/repair capabilities even when a tenant is expired.
  if (req.user.role === "PLATFORM_ADMIN") {
    next();
    return;
  }

  if (!req.user.businessId) {
    next(new AppError("This action requires an account scoped to a business", 403));
    return;
  }

  try {
    await requireActiveSubscription(req.user.businessId);
    next();
  } catch (error) {
    next(error);
  }
}
