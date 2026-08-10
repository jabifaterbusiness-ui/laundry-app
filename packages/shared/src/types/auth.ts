// Mirrors the Prisma `Role` enum (apps/api/prisma/schema.prisma).
// Kept in sync manually for now since the frontend cannot import
// generated Prisma types directly. If this drifts, the API schema is
// the source of truth.
export const ROLES = ["PLATFORM_ADMIN", "BUSINESS_OWNER", "BRANCH_MANAGER", "STAFF"] as const;
export type Role = (typeof ROLES)[number];

// A branch the authenticated user is a member of. Membership (this list)
// and the currently-selected/active branch are distinct concepts (LOCKED
// decision - see apps/api/prisma/schema.prisma) - this type only
// represents membership.
export interface BranchMembership {
  id: string;
  name: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  businessId: string | null;
  branches: BranchMembership[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
