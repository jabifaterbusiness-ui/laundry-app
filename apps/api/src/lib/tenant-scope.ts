import type { Request } from "express";
import { AppError } from "../middleware/error-handler.js";

/**
 * Enforces row-level tenant isolation (LOCKED decision #1). Future
 * business modules must call this - or scope their Prisma queries by
 * `req.user.businessId` directly - before returning or mutating any
 * tenant-scoped record. `req.user.businessId` is the only trusted source
 * of tenant context; a businessId read from the request body, query
 * string, or route params must never be used for authorization.
 *
 * Throws a 403 AppError (never a generic Error) so it's always handled
 * consistently by the centralized error handler.
 */
export function assertTenantMatch(req: Request, resourceBusinessId: string | null): void {
  if (!req.user?.businessId) {
    throw new AppError("This action requires an account scoped to a business", 403);
  }

  if (resourceBusinessId !== req.user.businessId) {
    throw new AppError("Resource does not belong to your business", 403);
  }
}
