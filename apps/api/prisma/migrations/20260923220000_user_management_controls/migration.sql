ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "position" TEXT,
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "users_businessId_deletedAt_idx"
ON "users"("businessId", "deletedAt");

INSERT INTO "permissions" ("id", "code", "module", "action", "description")
SELECT gen_random_uuid(), 'users.delete', 'users', 'delete', 'Delete users while preserving history'
WHERE NOT EXISTS (
  SELECT 1
  FROM "permissions"
  WHERE "code" = 'users.delete'
);
