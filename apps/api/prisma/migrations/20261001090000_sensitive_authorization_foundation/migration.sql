CREATE TABLE "sensitive_authorizations" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensitive_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sensitive_authorizations_tokenHash_key"
ON "sensitive_authorizations"("tokenHash");

CREATE INDEX "sensitive_authorizations_userId_expiresAt_idx"
ON "sensitive_authorizations"("userId", "expiresAt");

CREATE INDEX "sensitive_authorizations_businessId_expiresAt_idx"
ON "sensitive_authorizations"("businessId", "expiresAt");

ALTER TABLE "sensitive_authorizations"
ADD CONSTRAINT "sensitive_authorizations_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sensitive_authorizations"
ADD CONSTRAINT "sensitive_authorizations_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
