CREATE TABLE "backup_cloud_oauth_states" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "BackupCloudProvider" NOT NULL,
  "displayName" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "verifierCiphertext" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "backup_cloud_oauth_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "backup_cloud_oauth_states_stateHash_key"
  ON "backup_cloud_oauth_states"("stateHash");
CREATE INDEX "backup_cloud_oauth_states_expiresAt_idx"
  ON "backup_cloud_oauth_states"("expiresAt");
CREATE INDEX "backup_cloud_oauth_states_businessId_createdAt_idx"
  ON "backup_cloud_oauth_states"("businessId", "createdAt");
