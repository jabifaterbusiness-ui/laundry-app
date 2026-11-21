ALTER TABLE "subscription_payments"
ADD COLUMN "confirmationEmailAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "confirmationEmailLastAttemptAt" TIMESTAMP(3),
ADD COLUMN "confirmationEmailRetryable" BOOLEAN NOT NULL DEFAULT FALSE;
