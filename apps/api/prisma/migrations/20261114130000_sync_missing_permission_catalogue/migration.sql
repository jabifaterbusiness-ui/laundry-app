-- Keep the database permission catalogue aligned with permissions.catalog.ts.
-- The two inventory permissions were introduced in application code but were
-- not inserted into existing production databases.
INSERT INTO "permissions" ("id", "code", "module", "action", "description")
VALUES
  (gen_random_uuid()::text, 'inventory.approve', 'inventory', 'approve', 'Approve stocktake adjustments'),
  (gen_random_uuid()::text, 'inventory.reports_all_branches', 'inventory', 'reports_all_branches', 'View inventory comparisons across all business branches')
ON CONFLICT ("code") DO UPDATE
SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "description" = EXCLUDED."description";
