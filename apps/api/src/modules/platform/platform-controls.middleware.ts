import type { NextFunction, Request, Response } from "express";
import { getPlatformConfig } from "./platform-config.service.js";
import { AppError } from "../../middleware/error-handler.js";

export async function requirePlatformOperational(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const platformConfig = await getPlatformConfig();

  if (!platformConfig.maintenanceMode) {
    next();
    return;
  }

  // Platform administrators must retain access so maintenance can be
  // disabled from the Platform Owner control center.
  if (req.user?.securityRole === "PLATFORM_ADMIN") {
    next();
    return;
  }

  throw new AppError(
    "LaundryAngel is currently in maintenance mode. Please try again later.",
    503,
  );
}

export async function requireOfflineSyncEnabled(
  _req: Request,
  _res: Response,
  next: NextFunction,
) {
  const platformConfig = await getPlatformConfig();

  if (!platformConfig.offlineSyncEnabled) {
    throw new AppError(
      "Offline synchronization is currently disabled by the platform administrator.",
      503,
    );
  }

  next();
}

export async function assertWhatsAppMessagingEnabled() {
  const platformConfig = await getPlatformConfig();

  if (!platformConfig.whatsappMessagingEnabled) {
    throw new AppError(
      "WhatsApp messaging is currently disabled by the platform administrator.",
      503,
    );
  }
}

export async function isAutomatedNotificationsEnabled() {
  const platformConfig = await getPlatformConfig();
  return platformConfig.automatedNotificationsEnabled;
}
