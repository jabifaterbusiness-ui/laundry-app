-- AlterTable
ALTER TABLE "financial_statement_configs"
ADD COLUMN "dailyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "dailyHour" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN "dailyMinute" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dailyEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "dailyWhatsappEnabled" BOOLEAN NOT NULL DEFAULT false;
