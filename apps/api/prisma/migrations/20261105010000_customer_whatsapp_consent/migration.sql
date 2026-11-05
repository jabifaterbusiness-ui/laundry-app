ALTER TABLE "customers"
ADD COLUMN "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "whatsappOptInAt" TIMESTAMP(3),
ADD COLUMN "whatsappOptInSource" TEXT,
ADD COLUMN "whatsappOptOutAt" TIMESTAMP(3);
