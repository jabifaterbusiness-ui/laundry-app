import type { NextFunction, Request, Response } from "express";
import { getPlatformConfig } from "./platform-config.service.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

export async function requirePlatformOperational(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  // Platform administrators must retain access to repair tenant state.
  if (req.user?.securityRole === "PLATFORM_ADMIN") {
    next();
    return;
  }

  // Access tokens can remain valid after an administrator deactivates or
  // suspends a business. Re-check the tenant record on every protected
  // operational request rather than trusting the token's businessId.
  if (req.user?.businessId) {
    const business = await prisma.business.findFirst({
      where: {
        id: req.user.businessId,
        isActive: true,
        archivedAt: null,
        OR: [
          { suspendedUntil: null },
          { suspendedUntil: { lte: new Date() } },
        ],
      },
      select: { id: true },
    });

    if (!business) {
      throw new AppError(
        "This business account is inactive, archived, or temporarily suspended. Contact the platform administrator.",
        403,
      );
    }
  }

  const platformConfig = await getPlatformConfig();

  if (!platformConfig.maintenanceMode) {
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
