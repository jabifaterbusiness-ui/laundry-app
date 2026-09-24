import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config/index.js";
import { AppError } from "../../middleware/error-handler.js";
import type { Role } from "@prisma/client";

interface AccessTokenPayload {
  sub: string;
  email: string;
  securityRole: Role;
  businessId: string | null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw new AppError("Missing or malformed Authorization header", 401);
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, config.auth.accessTokenSecret) as AccessTokenPayload;
    // No branchId here by design - see AccessTokenPayload / auth.service.ts.
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: "",
      securityRole: payload.securityRole,
      businessId: payload.businessId,
    };
    next();
  } catch {
    throw new AppError("Invalid or expired access token", 401);
  }
}

/**
 * Guards routes that require the caller to be scoped to a business
 * (i.e. NOT a platform-level admin operating tenant-free). Must run
 * after requireAuth. This is the enforcement point for tenant isolation
 * at the request layer - business-domain modules should rely on
 * req.user.businessId (never a client-supplied businessId) when scoping
 * queries. See src/lib/tenant-scope.ts.
 */
export function requireBusinessContext(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    throw new AppError("Authentication required", 401);
  }

  if (!req.user.businessId) {
    throw new AppError("This action requires an account scoped to a business", 403);
  }

  next();
}
