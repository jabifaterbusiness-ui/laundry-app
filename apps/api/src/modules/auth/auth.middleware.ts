import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config/index.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { requireSensitiveAuthorization as requireSensitiveAuthorizationToken } from "./sensitive-authorization.service.js";
import type { Role } from "@prisma/client";

interface AccessTokenPayload {
  sub: string;
  email: string;
  username?: string | null;
  securityRole: Role;
  businessId: string | null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return next(new AppError("Missing or malformed Authorization header", 401));
  }

  const token = header.slice("Bearer ".length);
  let payload: AccessTokenPayload;

  try {
    payload = jwt.verify(token, config.auth.accessTokenSecret) as AccessTokenPayload;
  } catch {
    return next(new AppError("Invalid or expired access token", 401));
  }

  if (typeof payload.sub !== "string" || !payload.sub.trim()) {
    return next(new AppError("Invalid or expired access token", 401));
  }

  let account: { isActive: boolean; deletedAt: Date | null } | null;

  try {
    account = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true, deletedAt: true },
    });
  } catch (error) {
    return next(error);
  }

  if (!account || !account.isActive || account.deletedAt) {
    return next(new AppError("Invalid or expired access token", 401));
  }

  // No branchId here by design - see AccessTokenPayload / auth.service.ts.
  req.user = {
    id: payload.sub,
    email: payload.email,
    role: "",
    securityRole: payload.securityRole,
    businessId: payload.businessId,
  };
  return next();
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


/**
 * Requires a recently password-reauthorized sensitive authorization.
 * Must run after requireAuth and, for business-scoped operations,
 * after requireBusinessContext.
 */
export async function requireSensitiveAuthorization(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user?.id) {
    throw new AppError("Authentication is required", 401);
  }

  const token = req.headers["x-sensitive-authorization"];

  if (typeof token !== "string" || !token.trim()) {
    throw new AppError("Sensitive authorization is required", 403);
  }

  await requireSensitiveAuthorizationToken({
    token: token.trim(),
    userId: req.user.id,
    businessId: req.user.businessId,
  });

  next();
}
