# Foundation architecture - locked decisions

This document is the source of truth for foundation-level architectural
decisions. Everything below is **approved and locked**, not an open
question. Business-module implementation (Customers, Orders, Garments,
Invoices, Payments, Inventory, Reports, Sync) starts only after this
foundation is in place, and must build on top of these decisions rather
than re-litigating them.

## 1. Tenant isolation - LOCKED

- One shared PostgreSQL database.
- Row-level tenant isolation: every tenant-scoped table carries a
  `businessId` column.
- Database-per-tenant and schema-per-tenant are explicitly rejected.
- Tenant context is always derived server-side from the authenticated
  user (`req.user.businessId`). A client-supplied `businessId` (body,
  query string, route param) is never trusted for authorization.
- Enforcement helper: `apps/api/src/lib/tenant-scope.ts`.

## 2. Audit trail - LOCKED as foundation infrastructure

- Generic `AuditLog` model (`apps/api/prisma/schema.prisma`) exists now.
- Write path: `apps/api/src/lib/audit.ts`'s `recordAuditEvent()`.
  Business modules call this rather than writing to `audit_logs` directly.
- Fields: id, timestamp, businessId, branchId, actorUserId, action,
  entityType, entityId, metadata, correlationId - all reference fields
  nullable with `onDelete: SetNull`, so an audit row outlives whatever it
  references.
- Passwords, raw access tokens, raw refresh tokens, and other secrets must
  never be stored in `metadata`. `recordAuditEvent()` runs
  `sanitizeAuditMetadata()` as a defensive backstop that strips
  secret-shaped keys recursively; callers are still responsible for not
  passing secrets in.
- Not every future business event is implemented yet - only the
  infrastructure, plus `user.login` / `user.logout` as a working example
  of a module calling into it.

## 3. User <-> Branch - LOCKED as many-to-many

- Users may belong to multiple branches within their business, via the
  `UserBranch` join table. The old single-`branchId`-per-user assumption
  has been removed from the schema entirely.
- Three distinct concepts, never conflated:
  1. **Business membership** - `User.businessId`, fixed at creation for
     v1.
  2. **Branch memberships** - rows in `UserBranch`; a user can have many.
  3. **Currently-selected/active branch** - request-scoped, not stored on
     the user. Sent by the client as an `X-Branch-Id` header and
     re-validated against `UserBranch` (and against the user's
     `businessId`) on every request that needs it by
     `apps/api/src/middleware/branch-context.ts`'s `requireBranchContext`.
     It is deliberately **not** embedded in the access token, so a branch
     membership revoked mid-session can't still grant access via a
     stale claim.
- A user can never select or access a branch belonging to a different
  business - enforced in `requireBranchContext` (defense in depth: checked
  even though `UserBranch` membership should already imply same-business).
- Workforce scheduling / other staff-management rules are explicitly out
  of scope for now.

## 4. Roles - LOCKED for v1

Fixed enum: `PLATFORM_ADMIN`, `BUSINESS_OWNER`, `BRANCH_MANAGER`, `STAFF`.
No custom/dynamic roles yet. Authorization code
(`apps/api/src/middleware/rbac.ts`) is kept separate from tenant-scope and
branch-context checks so a future permission-table model can replace the
enum without restructuring the other two.

## 5. Offline/sync - DEFERRED

Not implemented. No conflict-resolution algorithm chosen. No
Dexie/IndexedDB sync infrastructure added. The PWA foundation
(`vite-plugin-pwa`) remains in place; the sync architecture will be
designed deliberately as its own phase.

## 6. Authentication

- Argon2 password hashing (`argon2id`).
- Access/refresh token architecture; refresh tokens are stored server-side
  as hashes only (never raw) so they can be revoked.
- The access token JWT is treated as identity + relatively stable
  business membership, **not** as sufficient authorization on its own for
  anything that can change mid-session (branch membership - see #3).
  Server-side re-validation against the database is the source of truth
  for branch context.

## 7. What's still out of scope

Not implemented yet, by design: Customers, Orders, Garments, Invoices,
Payments, Inventory, Reports, Sync. Their module folders under
`apps/api/src/modules/` contain only placeholder READMEs.

## Status

Foundation is locked as of this document. See the verification report
delivered alongside this change for exact files touched and what could/
could not be verified in the sandbox (network access to the npm registry
is blocked here, so `npm install` and anything downstream of it -
`prisma generate`, `prisma migrate dev`, an actual `vitest` run - could
not be executed; see that report for the static verification that was
possible instead).

## Data migration and backup architecture

Data migration is a commercial platform capability. The API exposes a tenant-scoped migration job workflow that analyzes uploaded legacy data before import. Source-specific parsing is separated from target-domain services so future laundry systems can be supported through additional adapters.

The first adapter supports DBF/FoxPro-style sources, including ZIP archives containing DBF files, plus CSV, JSON and Excel files. The Customer adapter is the first target because Customer is currently implemented. Unsupported entities are surfaced as explicit migration issues rather than being silently ignored.

Application backups use a versioned, encrypted binary format with AES-256-GCM and password-derived keys. Restore is intentionally merge-only in the first version: it never deletes current tenant data and never overwrites staff credentials. As Orders, Garments, Invoices, Payments, Inventory and other modules are implemented, their records will be added to the versioned backup manifest and migration adapters.
