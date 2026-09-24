import type { NextFunction, Request, Response } from "express";
import { AppError } from "./error-handler.js";
import { hasPermission } from "../modules/permissions/permissions.service.js";

export function requirePermission(permissionCode: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AppError("Authentication required", 401));
      return;
    }

    void hasPermission(
      req.user.id,
      req.user.businessId,
      req.user.securityRole,
      permissionCode,
    )
      .then((allowed) => {
        if (!allowed) {
          next(new AppError("Insufficient permissions for this action", 403));
          return;
        }

        next();
      })
      .catch(next);
  };
}
