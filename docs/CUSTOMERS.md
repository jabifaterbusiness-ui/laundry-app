# Customers module

First business module built on the locked foundation (see
docs/ARCHITECTURE.md). Scope: Customer CRUD + activate/deactivate only.
No Orders/Garments/Invoices/Payments/Inventory/Reports/Sync.

## A. Data model

`Customer` (prisma/schema.prisma):

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| businessId | string | tenant scope - see section F |
| name | string | required, 1-120 chars |
| phone | string | required, stored normalized (digits only, optional leading `+`) |
| email | string? | optional |
| address | string? | optional |
| notes | string? | optional, up to 2000 chars |
| isActive | boolean | default true; changed only via activate/deactivate endpoints |
| createdAt / updatedAt | datetime | |

Indexes: `businessId`, `(businessId, phone)`, `(businessId, name)` -
support tenant-scoped lookups, duplicate-phone checks, and name search/sort
without a full scan.

## B. API endpoints

All under `/api/v1/customers`, all require `requireAuth` +
`requireBusinessContext` (see auth matrix in section C for per-route
roles).

| Method | Path | Purpose |
|---|---|---|
| POST | `/customers` | Create. 409 with `duplicates` if a likely match exists and `confirmDuplicate` wasn't set (section E). |
| GET | `/customers` | List. Query: `page` (default 1), `pageSize` (default 25, max 100), `search` (matches name contains, or phone contains once normalized), `status` (`active` default \| `inactive` \| `all`). |
| GET | `/customers/:id` | Get one. 404 if not found OR belongs to another business (section F). |
| PATCH | `/customers/:id` | Update `name`/`phone`/`email`/`address`/`notes`. Does not change `isActive`. |
| POST | `/customers/:id/activate` | Set `isActive: true`. |
| POST | `/customers/:id/deactivate` | Set `isActive: false`. |

None of these endpoints ever return `passwordHash`, tokens, or any
other tenant's data - responses are the `Customer` row (or list) only.

## C. Authorization matrix

| Action | PLATFORM_ADMIN | BUSINESS_OWNER | BRANCH_MANAGER | STAFF |
|---|---|---|---|---|
| Create | - | Y | Y | Y |
| View (list/get) | - | Y | Y | Y |
| Update | - | Y | Y | Y |
| Activate/Deactivate | - | Y | Y | - |

Rationale:
- Front-line staff routinely register and correct customer contact
  details during normal laundry drop-off/pickup, so create/view/update
  are open to `STAFF`.
- Activate/deactivate is a more consequential, less frequent
  administrative action (e.g. removing a customer who asked to be
  delisted), so it's restricted to `BUSINESS_OWNER`/`BRANCH_MANAGER`.
- `PLATFORM_ADMIN` has no `businessId` (LOCKED foundation decision), so
  `requireBusinessContext` excludes it before role checks even run.
  There is no tenant-admin bypass for Customers - platform-level support
  tooling, if ever needed, is a separate, explicitly-scoped concern, not
  an implicit side effect of the `PLATFORM_ADMIN` role.
- Enforced entirely server-side in `customers.routes.ts` via
  `requireRole(...)`; the frontend hiding a button is not a
  substitute for this and isn't relied upon anywhere here.

## D. Validation rules

(`customers.validation.ts`, Zod)

- `name`: required, trimmed, 1-120 chars.
- `phone`: required. Input accepts common human formatting (spaces,
  dashes, parens, one leading `+`); rejected if it doesn't match that
  shape or normalizes to fewer than 7 or more than 15 digits. Stored
  normalized.
- `email`: optional, must be a valid email if provided, max 254 chars.
  An empty string is treated as "not provided."
- `address`: optional, max 300 chars.
- `notes`: optional, max 2000 chars.
- `isActive`: not accepted on create/update at all - only changed via
  the dedicated activate/deactivate endpoints, so status changes always
  get their own audit event and can't hide inside a generic update.
- Update requires at least one field.

Malformed input is rejected with `422` and field-level details (existing
`ZodError` handling in `error-handler.ts`) - nothing is silently
accepted or coerced beyond the normalization described above.

## E. Duplicate-handling decision

**Soft detection + explicit override, not a hard uniqueness
constraint.**

A hard `@@unique([businessId, phone])` was rejected: a shared household
or business phone number legitimately belongs to more than one customer
record (e.g. a family, or a corporate client with several contacts),
and rejecting that at the database level would block real, valid data
entry with no recourse.

Both `POST /customers` and `PATCH /customers/:id` (when the request
includes a `phone`) apply the identical policy:
1. Normalize the submitted phone the same way stored numbers are
   normalized.
2. Look up active customers in the same business with that exact
   normalized phone (`findPossibleDuplicates`). On update, the customer
   being edited is excluded from this lookup (`excludeId`) - a
   customer's own existing phone is never flagged as a duplicate of
   itself.
3. If any are found and the request didn't set `confirmDuplicate: true`,
   respond `409` with the matching customers (id/name/phone only) so the
   UI can show "this looks like an existing customer" and let staff
   either open the existing record or resubmit with
   `confirmDuplicate: true` to proceed anyway. **No write happens on a
   409** - update requests that get blocked this way leave the record
   completely unchanged, and do not generate a `customer.updated` audit
   event (see section G).

This is deliberately a warning, not a block - staff always retain the
ability to create or update a customer to a phone number that another,
genuinely-distinct customer already has. `confirmDuplicate` is
request-only: it's accepted by both Zod schemas but is never persisted
as a `Customer` field, and the duplicate lookup itself is always scoped
by `req.user.businessId` - never a client-supplied one - so it can't be
used to probe or leak another business's customers.

## F. Tenant/branch scoping

- **Tenant (business) scoping**: every query in `customers.service.ts`
  includes `businessId` from `req.user.businessId` (never from the
  request body/query/params) in the same query as the lookup - e.g.
  `findFirst({ where: { id, businessId } })` and
  `updateMany({ where: { id, businessId }, ... })` - rather than
  fetching by id and checking ownership as a separate step. A
  cross-business `GET /customers/:id` or `PATCH /customers/:id`
  therefore returns a plain `404`, identical to a nonexistent id - it
  never reveals that a record exists in another business.
- **Branch scoping decision**: `Customer` is business-level, not
  branch-level (see the DECISION comment in `prisma/schema.prisma` right
  above the `Customer` model). A customer served at more than one
  branch within the same business is still a single `Customer` row -
  which branch handled a particular visit is activity data that belongs
  on `Order` once that module is built, not on `Customer` itself.
  Consequently, Customers routes require `requireBusinessContext` but
  deliberately do **not** require `requireBranchContext` - there is no
  branch-level customer list to filter by branch membership. This was
  chosen over per-branch customer records because nothing in the
  approved requirements calls for branch-exclusive customer lists, and
  fragmenting one customer's contact info/history across branch-specific
  rows would be a real cost for no corresponding benefit right now.

## G. Audit events

Via the existing `recordAuditEvent()` (no second audit mechanism):

| Action | entityType | metadata |
|---|---|---|
| `customer.created` | `Customer` | `{ name }` |
| `customer.updated` | `Customer` | `{ fields: [...changed field names] }` (excludes `confirmDuplicate` - it's a request flag, not a changed field) |
| `customer.activated` | `Customer` | - |
| `customer.deactivated` | `Customer` | - |

Every event includes `businessId`, `actorUserId` (from `req.user`), and
`correlationId` (from `req.correlationId`). No password/token/secret
data is ever passed into `metadata` here, and `recordAuditEvent`'s
sanitizer would strip it even if it were.

A `PATCH` blocked by the duplicate-phone check (409, section E) writes
**no audit event at all** - `customer.updated` would be misleading since
no update occurred. The event is only written after the update actually
succeeds.

## H. Frontend

`apps/web/src/pages/customers/CustomersPage.tsx` (+ `customers-api.ts`,
`CustomerFormDialog.tsx`) - list with search + pagination, create,
view/edit details, activate/deactivate, loading/empty/validation/API
error states. Uses the existing React Query + Zustand architecture; no
new dependencies. See section H of the implementation report for exact
files.

## I. What's still out of scope

Orders, Garments, Invoices, Payments, Inventory, Reports, Sync -
untouched, still placeholder-only READMEs. Offline sync for Customers -
not implemented; this module uses the normal online API.
