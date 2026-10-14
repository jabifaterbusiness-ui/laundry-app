import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { decryptBackupCredentials } from "./backup-crypto.service.js";
import { createScheduledBackupArtifact } from "./backup.service.js";
import {
  deleteS3CompatibleArtifact,
  uploadS3CompatibleArtifact,
  verifyS3CompatibleBucket,
  type S3CompatibleConfig,
  type S3CompatibleCredentials,
} from "./backup-s3.provider.js";

async function getS3Connection(businessId: string, connectionId: string) {
  const connection = await prisma.backupCloudConnection.findFirst({
    where: { businessId, id: connectionId },
    select: {
      id: true,
      provider: true,
      config: true,
      credentialsCiphertext: true,
    },
  });

  if (!connection) throw new AppError("Cloud connection not found.", 404);

  if (connection.provider !== "S3_COMPATIBLE") {
    throw new AppError(
      "This cloud provider is not implemented yet. Use an S3-compatible destination.",
      422,
    );
  }

  if (!connection.config || typeof connection.config !== "object" ||
      Array.isArray(connection.config)) {
    throw new AppError("The cloud destination configuration is incomplete.", 422);
  }

  let credentials: S3CompatibleCredentials;
  try {
    credentials = JSON.parse(
      decryptBackupCredentials(connection.credentialsCiphertext, businessId),
    ) as S3CompatibleCredentials;
  } catch {
    throw new AppError("Unable to decrypt the cloud destination credentials.", 503);
  }

  return {
    connection,
    config: connection.config as unknown as S3CompatibleConfig,
    credentials,
  };
}

export async function verifyBackupCloudConnection(
  businessId: string,
  connectionId: string,
) {
  const { connection, config, credentials } =
    await getS3Connection(businessId, connectionId);

  try {
    await verifyS3CompatibleBucket(config, credentials);
  } catch {
    try {
      await prisma.backupCloudConnection.update({
        where: { businessId_id: { businessId, id: connection.id } },
        data: {
          status: "ERROR",
          verifiedAt: null,
          lastError: "Provider verification failed.",
        },
      });
    } catch {
      // Preserve the provider verification failure if status persistence also fails.
    }

    throw new AppError(
      "Cloud destination verification failed. Check the endpoint, bucket permissions, and credentials.",
      422,
    );
  }

  return prisma.backupCloudConnection.update({
    where: { businessId_id: { businessId, id: connection.id } },
    data: { status: "CONNECTED", verifiedAt: new Date(), lastError: null },
    select: {
      id: true, provider: true, displayName: true, status: true,
      verifiedAt: true, lastError: true, createdAt: true, updatedAt: true,
    },
  });
}

export async function createCloudBackupRun(
  businessId: string,
  connectionId: string,
  options: { trigger?: "MANUAL" | "SCHEDULED"; scheduledFor?: Date } = {},
) {
  const { connection, config, credentials } =
    await getS3Connection(businessId, connectionId);

  const verified = await prisma.backupCloudConnection.findFirst({
    where: {
      id: connection.id,
      businessId,
      status: "CONNECTED",
      verifiedAt: { not: null },
    },
    select: { id: true },
  });

  if (!verified) {
    throw new AppError("Verify the cloud destination before creating a backup.", 422);
  }

  const trigger = options.trigger ?? "MANUAL";
  const run = await prisma.backupRun.create({
    data: {
      businessId,
      connectionId,
      trigger,
      status: "PENDING",
      ...(trigger === "SCHEDULED" && options.scheduledFor
        ? { scheduledFor: options.scheduledFor }
        : {}),
    },
    select: { id: true },
  });

  try {
    await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const artifact = await createScheduledBackupArtifact(businessId);
    const storageKey = `backups/${run.id}.enc`;

    await uploadS3CompatibleArtifact({
      config,
      credentials,
      storageKey,
      encryptedArtifact: artifact.encrypted,
    });

    const completed = await prisma.backupRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        storageKey,
        checksumSha256: artifact.checksumSha256,
        sizeBytes: BigInt(artifact.sizeBytes),
        completedAt: new Date(),
        errorMessage: null,
      },
      select: {
        id: true, trigger: true, status: true, storageKey: true,
        checksumSha256: true, sizeBytes: true, startedAt: true,
        completedAt: true, createdAt: true,
      },
    });

    // Retention runs after the new backup is safely uploaded. A cleanup error
    // must not turn a successfully stored backup into a failed backup run.
    try {
      await pruneCloudBackupRuns(businessId, connectionId);
    } catch {
      // Keep old objects and their database references if storage deletion fails.
      // A later successful backup will retry retention.
    }

    return { ...completed, sizeBytes: completed.sizeBytes?.toString() ?? null };
  } catch {
    try {
      await prisma.backupRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: "Backup generation or cloud upload failed.",
        },
      });
    } catch {
      // Preserve the sanitized backup failure if failure-state persistence also fails.
    }

    throw new AppError(
      "Backup failed. Check the destination configuration and server logs.",
      502,
    );
  }
}

/**
 * Keeps the newest successful backups for the selected destination. Database
 * history is retained; a storage key is cleared only after deletion succeeds.
 */
export async function pruneCloudBackupRuns(
  businessId: string,
  connectionId: string,
) {
  const settings = await prisma.backupSettings.findUnique({
    where: { businessId },
    select: { retentionCount: true, destinationConnectionId: true },
  });

  if (
    !settings ||
    settings.destinationConnectionId !== connectionId ||
    !Number.isInteger(settings.retentionCount) ||
    settings.retentionCount < 1
  ) {
    return { deleted: 0 };
  }

  const destination = await getS3Connection(businessId, connectionId);
  const successfulRuns = await prisma.backupRun.findMany({
    where: {
      businessId,
      connectionId,
      status: "SUCCEEDED",
      storageKey: { not: null },
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, storageKey: true },
  });

  let deleted = 0;
  for (const run of successfulRuns.slice(settings.retentionCount)) {
    if (!run.storageKey) continue;

    await deleteS3CompatibleArtifact({
      config: destination.config,
      credentials: destination.credentials,
      storageKey: run.storageKey,
    });

    await prisma.backupRun.updateMany({
      where: {
        id: run.id,
        businessId,
        connectionId,
        status: "SUCCEEDED",
        storageKey: run.storageKey,
      },
      data: { storageKey: null },
    });
    deleted += 1;
  }

  return { deleted };
}

export async function listCloudBackupRuns(businessId: string) {
  const runs = await prisma.backupRun.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, connectionId: true, trigger: true, status: true,
      storageKey: true, checksumSha256: true, sizeBytes: true,
      startedAt: true, scheduledFor: true, completedAt: true,
      errorMessage: true, createdAt: true,
    },
  });

  return runs.map((run) => ({
    ...run,
    sizeBytes: run.sizeBytes?.toString() ?? null,
  }));
}
