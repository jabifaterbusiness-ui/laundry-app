CREATE TYPE "CustomerAccountSharingMode" AS ENUM ('SHARED', 'SEPARATE');

ALTER TABLE "branch_resource_shares"
  ADD COLUMN "customerAccountMode" "CustomerAccountSharingMode" NOT NULL DEFAULT 'SHARED';
