-- Keep the database permission catalogue aligned with permissions.catalog.ts.
INSERT INTO "permissions" ("id", "code", "module", "action", "description")
VALUES (
  gen_random_uuid()::text,
  'orders.pickup_override',
  'orders',
  'pickup_override',
  'Authorize collection of orders with an outstanding balance; reason and audit record required'
)
ON CONFLICT ("code") DO UPDATE
SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "description" = EXCLUDED."description";
