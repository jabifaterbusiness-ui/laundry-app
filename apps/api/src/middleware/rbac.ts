import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { AppError } from "./error-handler.js";

/**
 * Restricts a route to the given roles. Must run AFTER requireAuth,
 * which is responsible for populating req.user.
 *
 * NOTE: this checks role only, not tenant scope. Routes that operate on
 * business data must ALSO enforce that the resource's businessId matches
 * req.user.businessId (and requireBusinessContext, where relevant) -
 * role check and tenant-isolation check are separate concerns.
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      throw new AppError("Authentication required", 401);
    }

    if (!allowedRoles.includes(user.role)) {
      throw new AppError("Insufficient permissions for this action", 403);
    }

    next();
  };
}
