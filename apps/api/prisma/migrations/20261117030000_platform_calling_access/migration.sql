CREATE TABLE "platform_calling_config" (
  "id" TEXT NOT NULL,
  "globallyEnabled" BOOLEAN NOT NULL DEFAULT false,
  "grantNewBusinesses" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_calling_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_calling_access" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "granted" BOOLEAN NOT NULL DEFAULT false,
  "grantedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_calling_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_calling_access_businessId_key" ON "business_calling_access"("businessId");
CREATE INDEX "business_calling_access_granted_updatedAt_idx" ON "business_calling_access"("granted", "updatedAt");
ALTER TABLE "business_calling_access" ADD CONSTRAINT "business_calling_access_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "platform_calling_config" ("id", "globallyEnabled", "grantNewBusinesses", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000002', false, false, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
