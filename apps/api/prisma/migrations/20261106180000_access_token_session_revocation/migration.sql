ALTER TABLE "refresh_tokens"
  ADD COLUMN "sessionId" TEXT;

UPDATE "refresh_tokens"
SET "sessionId" = gen_random_uuid()::text
WHERE "sessionId" IS NULL;

ALTER TABLE "refresh_tokens"
  ALTER COLUMN "sessionId" SET NOT NULL,
  ALTER COLUMN "sessionId" SET DEFAULT gen_random_uuid()::text;

CREATE INDEX "refresh_tokens_sessionId_revokedAt_expiresAt_idx"
  ON "refresh_tokens"("sessionId", "revokedAt", "expiresAt");
