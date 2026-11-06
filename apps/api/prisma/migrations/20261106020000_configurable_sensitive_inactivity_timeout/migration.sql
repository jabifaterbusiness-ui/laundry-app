ALTER TABLE "businesses"
  ADD COLUMN "sessionInactivityTimeoutMinutes" INTEGER NOT NULL DEFAULT 3;
