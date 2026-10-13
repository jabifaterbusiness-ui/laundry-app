-- Ensure subscription permissions exist in databases that already applied
-- the earlier permission-catalogue synchronization migration.
-- Existing permission IDs and user/business-role overrides are preserved.

INSERT INTO "permissions" ("id", "code", "module", "action", "description")
VALUES
    (
        gen_random_uuid(),
        'subscriptions.view',
        'subscriptions',
        'view',
        'View business subscription status and period'
    ),
    (
        gen_random_uuid(),
        'subscriptions.manage',
        'subscriptions',
        'manage',
        'Manage business subscription renewal and payments'
    )
ON CONFLICT ("code") DO UPDATE
SET
    "module" = EXCLUDED."module",
    "action" = EXCLUDED."action",
    "description" = EXCLUDED."description";
