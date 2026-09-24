BEGIN;

-- Preserve the existing security semantics in a dedicated internal field.
ALTER TABLE "users"
ADD COLUMN "securityRole" "Role" NOT NULL DEFAULT 'STAFF';

-- Existing role values are the authoritative source for the initial
-- internal security role.
UPDATE "users"
SET "securityRole" = "role";

-- The visible role is now a management-defined job title, not a
-- security/access-control enum.
ALTER TABLE "users"
ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "users"
ALTER COLUMN "role" TYPE TEXT
USING "role"::text;

ALTER TABLE "users"
ALTER COLUMN "role" SET DEFAULT 'Staff';

-- Preserve meaningful visible titles for existing accounts.
UPDATE "users"
SET "role" = CASE "role"
  WHEN 'PLATFORM_ADMIN' THEN 'Platform Administrator'
  WHEN 'BUSINESS_OWNER' THEN 'Business Owner'
  WHEN 'BRANCH_MANAGER' THEN 'Branch Manager'
  WHEN 'STAFF' THEN 'Staff'
  ELSE "role"
END;

-- Position was superseded by the single customizable Role/job-title field.
ALTER TABLE "users"
DROP COLUMN IF EXISTS "position";

COMMIT;
