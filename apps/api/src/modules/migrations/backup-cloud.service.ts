import { Prisma, type BackupCloudProvider, type BackupScheduleFrequency } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { encryptBackupCredentials } from "./backup-crypto.service.js";

const connectionSelect = {
  id: true,
  provider: true,
  displayName: true,
  config: true,
  status: true,
  verifiedAt: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BackupCloudConnectionSelect;

function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new AppError("A valid IANA timezone is required.", 422);
  }
}

function assertNoCredentialLikeKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoCredentialLikeKeys(item);
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (/(token|secret|password|credential|private.?key|client.?key|access.?key)/i.test(key)) {
      throw new AppError("Provider secrets must be supplied in the encrypted credentials field, not provider configuration.", 422);
    }
    assertNoCredentialLikeKeys(nested);
  }
}

export async function listBackupConnections(businessId: string) {
  return prisma.backupCloudConnection.findMany({
    where: { businessId },
    select: connectionSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function createBackupConnection(input: {
  businessId: string;
  provider: BackupCloudProvider;
  displayName: string;
  credentials: Record<string, unknown>;
  config?: Record<string, unknown>;
}) {
  if (input.provider !== "S3_COMPATIBLE") {
    throw new AppError(
      "Only S3-compatible cloud backups are currently supported.",
      422,
    );
  }

  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 100) {
    throw new AppError("Connection name must be between 1 and 100 characters.", 422);
  }
  if (!input.credentials || Array.isArray(input.credentials) || Object.keys(input.credentials).length === 0) {
    throw new AppError("Provider credentials are required.", 422);
  }
  if (input.config) assertNoCredentialLikeKeys(input.config);

  let credentialsJson: string;
  try {
    credentialsJson = JSON.stringify(input.credentials);
  } catch {
    throw new AppError("Invalid provider credentials.", 422);
  }

  let credentialsCiphertext: string;
  try {
    credentialsCiphertext = encryptBackupCredentials(credentialsJson, input.businessId);
  } catch {
    throw new AppError("Cloud credential encryption is unavailable. Check BACKUP_ENCRYPTION_KEY configuration.", 503);
  }

  const connection = await prisma.backupCloudConnection.create({
    data: {
      businessId: input.businessId,
      provider: input.provider,
      displayName,
      credentialsCiphertext,
      config: input.config ? input.config as Prisma.InputJsonValue : Prisma.JsonNull,
      status: "PENDING",
    },
    select: connectionSelect,
  });

  return connection;
}

export async function deleteBackupConnection(businessId: string, connectionId: string) {
  const connection = await prisma.backupCloudConnection.findFirst({
    where: { id: connectionId, businessId },
    select: { id: true },
  });
  if (!connection) throw new AppError("Cloud connection not found.", 404);

  const selected = await prisma.backupSettings.findFirst({
    where: { businessId, destinationConnectionId: connectionId },
    select: { id: true },
  });
  if (selected) {
    throw new AppError("Choose another backup destination before deleting this connection.", 409);
  }

  const runs = await prisma.backupRun.findFirst({
    where: { businessId, connectionId },
    select: { id: true },
  });
  if (runs) {
    throw new AppError("This connection has backup history and cannot be deleted.", 409);
  }

  await prisma.backupCloudConnection.delete({
    where: { businessId_id: { businessId, id: connectionId } },
  });
  return { deleted: true };
}

export async function getBackupSettings(businessId: string) {
  return prisma.backupSettings.upsert({
    where: { businessId },
    create: { businessId },
    update: {},
    select: {
      id: true,
      enabled: true,
      frequency: true,
      dayOfWeek: true,
      dayOfMonth: true,
      hour: true,
      minute: true,
      timezone: true,
      retentionCount: true,
      destinationConnectionId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function saveBackupSettings(input: {
  businessId: string;
  enabled: boolean;
  frequency: BackupScheduleFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  timezone: string;
  retentionCount: number;
  destinationConnectionId: string | null;
}) {
  if (input.enabled) {
    throw new AppError(
      "Scheduled cloud backups are not available yet. Disable scheduling and use manual backups.",
      422,
    );
  }

  const integerRanges: Array<[string, number, number, number]> = [
    ["dayOfWeek", input.dayOfWeek, 0, 6],
    ["dayOfMonth", input.dayOfMonth, 1, 31],
    ["hour", input.hour, 0, 23],
    ["minute", input.minute, 0, 59],
    ["retentionCount", input.retentionCount, 1, 365],
  ];
  for (const [field, value, min, max] of integerRanges) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new AppError(`${field} must be an integer between ${min} and ${max}.`, 422);
    }
  }
  validateTimezone(input.timezone);

  if (input.enabled && !input.destinationConnectionId) {
    throw new AppError("Select a verified cloud destination before enabling scheduled backups.", 422);
  }

  if (input.destinationConnectionId) {
    const destination = await prisma.backupCloudConnection.findFirst({
      where: {
        id: input.destinationConnectionId,
        businessId: input.businessId,
        status: "CONNECTED",
        verifiedAt: { not: null },
      },
      select: { id: true },
    });
    if (!destination && input.enabled) {
      throw new AppError("The selected cloud destination has not been verified.", 422);
    }
    if (!destination) {
      const owned = await prisma.backupCloudConnection.findFirst({
        where: { id: input.destinationConnectionId, businessId: input.businessId },
        select: { id: true },
      });
      if (!owned) throw new AppError("Cloud connection not found for this business.", 404);
    }
  }

  return prisma.backupSettings.upsert({
    where: { businessId: input.businessId },
    create: {
      businessId: input.businessId,
      enabled: input.enabled,
      frequency: input.frequency,
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      hour: input.hour,
      minute: input.minute,
      timezone: input.timezone,
      retentionCount: input.retentionCount,
      destinationConnectionId: input.destinationConnectionId,
    },
    update: {
      enabled: input.enabled,
      frequency: input.frequency,
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      hour: input.hour,
      minute: input.minute,
      timezone: input.timezone,
      retentionCount: input.retentionCount,
      destinationConnectionId: input.destinationConnectionId,
    },
    select: {
      id: true,
      enabled: true,
      frequency: true,
      dayOfWeek: true,
      dayOfMonth: true,
      hour: true,
      minute: true,
      timezone: true,
      retentionCount: true,
      destinationConnectionId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
