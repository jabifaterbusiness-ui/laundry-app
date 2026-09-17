-- AlterTable
ALTER TABLE "subscription_payments" ADD COLUMN     "confirmationEmailLastError" TEXT,
ADD COLUMN     "confirmationEmailProviderMessageId" TEXT,
ADD COLUMN     "confirmationEmailSentAt" TIMESTAMP(3);
