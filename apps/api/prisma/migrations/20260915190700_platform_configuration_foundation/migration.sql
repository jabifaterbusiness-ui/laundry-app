-- CreateTable
CREATE TABLE "platform_config" (
    "id" TEXT NOT NULL,
    "allowNewBusinessRegistration" BOOLEAN NOT NULL DEFAULT true,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "whatsappMessagingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "automatedNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "offlineSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);
