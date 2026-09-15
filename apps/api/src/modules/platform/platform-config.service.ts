import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";

const PLATFORM_CONFIG_ID = "00000000-0000-4000-8000-000000000001";

export type PlatformConfig = {
  id: string;
  allowNewBusinessRegistration: boolean;
  maintenanceMode: boolean;
  whatsappMessagingEnabled: boolean;
  automatedNotificationsEnabled: boolean;
  offlineSyncEnabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type UpdatePlatformConfigInput = {
  allowNewBusinessRegistration?: boolean | undefined;
  maintenanceMode?: boolean | undefined;
  whatsappMessagingEnabled?: boolean | undefined;
  automatedNotificationsEnabled?: boolean | undefined;
  offlineSyncEnabled?: boolean | undefined;
  expectedVersion?: number | undefined;
};

async function ensurePlatformConfig(): Promise<PlatformConfig> {
  return prisma.platformConfig.upsert({
    where: { id: PLATFORM_CONFIG_ID },
    update: {},
    create: {
      id: PLATFORM_CONFIG_ID,
    },
  });
}

export async function getPlatformConfig(): Promise<PlatformConfig> {
  return ensurePlatformConfig();
}

export async function updatePlatformConfig(
  input: UpdatePlatformConfigInput,
  actorUserId: string,
  correlationId?: string,
): Promise<PlatformConfig> {
  const current = await ensurePlatformConfig();

  if (
    input.expectedVersion !== undefined &&
    input.expectedVersion !== current.version
  ) {
    throw new AppError(
      "Platform configuration has changed. Refresh the configuration and try again.",
      409,
    );
  }

  const updateData = {
    ...(input.allowNewBusinessRegistration !== undefined && {
      allowNewBusinessRegistration: input.allowNewBusinessRegistration,
    }),
    ...(input.maintenanceMode !== undefined && {
      maintenanceMode: input.maintenanceMode,
    }),
    ...(input.whatsappMessagingEnabled !== undefined && {
      whatsappMessagingEnabled: input.whatsappMessagingEnabled,
    }),
    ...(input.automatedNotificationsEnabled !== undefined && {
      automatedNotificationsEnabled: input.automatedNotificationsEnabled,
    }),
    ...(input.offlineSyncEnabled !== undefined && {
      offlineSyncEnabled: input.offlineSyncEnabled,
    }),
    version: current.version + 1,
  };

  const updated = await prisma.platformConfig.update({
    where: {
      id: PLATFORM_CONFIG_ID,
    },
    data: updateData,
  });

  await recordAuditEvent({
    action: "platform.configuration.updated",
    entityType: "PlatformConfig",
    entityId: updated.id,
    actorUserId,
    correlationId: correlationId ?? null,
    metadata: {
      previousVersion: current.version,
      newVersion: updated.version,
      changes: {
        ...(input.allowNewBusinessRegistration !== undefined && {
          allowNewBusinessRegistration: {
            from: current.allowNewBusinessRegistration,
            to: updated.allowNewBusinessRegistration,
          },
        }),
        ...(input.maintenanceMode !== undefined && {
          maintenanceMode: {
            from: current.maintenanceMode,
            to: updated.maintenanceMode,
          },
        }),
        ...(input.whatsappMessagingEnabled !== undefined && {
          whatsappMessagingEnabled: {
            from: current.whatsappMessagingEnabled,
            to: updated.whatsappMessagingEnabled,
          },
        }),
        ...(input.automatedNotificationsEnabled !== undefined && {
          automatedNotificationsEnabled: {
            from: current.automatedNotificationsEnabled,
            to: updated.automatedNotificationsEnabled,
          },
        }),
        ...(input.offlineSyncEnabled !== undefined && {
          offlineSyncEnabled: {
            from: current.offlineSyncEnabled,
            to: updated.offlineSyncEnabled,
          },
        }),
      },
    },
  });

  return updated;
}
