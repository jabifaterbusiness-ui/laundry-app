import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "./error-handler.js";

const BRANCH_HEADER = "x-branch-id";

/**
 * Resolves and validates the caller's currently-selected/active branch
 * for this request (LOCKED decision #3: business membership, branch
 * memberships, and active branch context are three distinct things).
 *
 * Must run after requireAuth (and typically requireBusinessContext).
 * The branch id is read from the X-Branch-Id header - NOT from a JWT
 * claim (see decision #6: membership can change after a token is
 * issued, so it's re-checked against the database on every request) and
 * NOT trusted from a request body/query param, which would let a caller
 * assert membership in a branch they don't belong to.
 *
 * On success sets req.branchId. Denies (403) if:
 *   - no X-Branch-Id header was sent
 *   - the user has no UserBranch row for that branch (not a member)
 *   - the branch is inactive
 *   - the branch belongs to a different business than req.user.businessId
 */
export async function requireBranchContext(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    throw new AppError("Authentication required", 401);
  }

  if (!req.user.businessId) {
    throw new AppError("This action requires an account scoped to a business", 403);
  }

  const branchId = req.headers[BRANCH_HEADER];

  if (typeof branchId !== "string" || branchId.length === 0) {
    throw new AppError("Missing X-Branch-Id header", 400);
  }

  const membership = await prisma.userBranch.findUnique({
    where: { userId_branchId: { userId: req.user.id, branchId } },
    include: { branch: true },
  });

  if (!membership) {
    throw new AppError("You do not have access to this branch", 403);
  }

  if (membership.branch.isActive === false || membership.branch.businessId !== req.user.businessId) {
    throw new AppError("You do not have access to this branch", 403);
  }

  req.branchId = branchId;
  next();
}
