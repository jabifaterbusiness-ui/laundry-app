import type { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      // Identity, from a verified access token. Deliberately does NOT
      // include branchId - branch membership can change after a token
      // is issued (LOCKED decision #3/#6), so it must never be trusted
      // from a JWT claim alone. See branchId below and
      // src/middleware/branch-context.ts.
      user?: {
        id: string;
        role: Role;
        email: string;
        businessId: string | null;
      };

      // The caller's currently-selected/active branch for THIS request,
      // set only by requireBranchContext after re-validating membership
      // against the database (UserBranch) and confirming the branch
      // belongs to req.user.businessId. Absent until that middleware runs.
      branchId?: string;

      // Per-request correlation id, set by request-context middleware.
      // Echoed on the X-Request-Id response header and attached to any
      // audit log rows written during the request.
      correlationId?: string;
    }
  }
}

export {};
