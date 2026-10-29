import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
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
import {
  deleteOAuthCloudArtifact,
  uploadOAuthCloudArtifact,
  verifyOAuthCloudDestination,
} from "./backup-cloud-oauth-provider.service.js";

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
  const record = await prisma.backupCloudConnection.findFirst({
    where: { businessId, id: connectionId },
    select: { id: true, provider: true, credentialsCiphertext: true },
  });

  if (!record) throw new AppError("Cloud connection not found.", 404);

  try {
    if (record.provider === "S3_COMPATIBLE") {
      const destination = await getS3Connection(businessId, connectionId);
      await verifyS3CompatibleBucket(destination.config, destination.credentials);
    } else {
      await verifyOAuthCloudDestination({
        businessId,
        connectionId,
        provider: record.provider,
        credentialsCiphertext: record.credentialsCiphertext,
      });
    }
  } catch {
    try {
      await prisma.backupCloudConnection.update({
        where: { businessId_id: { businessId, id: record.id } },
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
      "Cloud destination verification failed. Check the destination settings and authorization.",
      422,
    );
  }

  return prisma.backupCloudConnection.update({
    where: { businessId_id: { businessId, id: record.id } },
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
  options: { trigger?: "MANUAL" | "SCHEDULED"; scheduledFor?: Date; scheduleId?: string } = {},
) {
  const connection = await prisma.backupCloudConnection.findFirst({
    where: { businessId, id: connectionId },
    select: { id: true, provider: true, credentialsCiphertext: true },
  });

  if (!connection) throw new AppError("Cloud connection not found.", 404);

  const s3Destination = connection.provider === "S3_COMPATIBLE"
    ? await getS3Connection(businessId, connectionId)
    : null;

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
  let scheduleId: string | null = null;

  if (trigger === "SCHEDULED") {
    if (!options.scheduleId || !options.scheduledFor) {
      throw new AppError("A scheduled backup requires a schedule and scheduled time.", 422);
    }

    const schedule = await prisma.backupSchedule.findFirst({
      where: {
        id: options.scheduleId,
        businessId,
        enabled: true,
        destinationConnectionId: connectionId,
      },
      select: { id: true },
    });

    if (!schedule) {
      throw new AppError("The backup schedule is unavailable for this destination.", 422);
    }

    scheduleId = schedule.id;
  }

  const run = await prisma.backupRun.create({
    data: {
      businessId,
      connectionId,
      scheduleId,
      trigger,
      status: "PENDING",
      ...(trigger === "SCHEDULED" ? { scheduledFor: options.scheduledFor } : {}),
    },
    select: { id: true },
  });

  let uploadedStorageKey: string | null = null;
  let failureStage = "mark_running";

  try {
    await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    failureStage = "generate_artifact";
    const artifact = await createScheduledBackupArtifact(businessId);
    let storageKey: string;

    failureStage = "upload_artifact";
    if (s3Destination) {
      storageKey = `backups/${run.id}.enc`;
      await uploadS3CompatibleArtifact({
        config: s3Destination.config,
        credentials: s3Destination.credentials,
        storageKey,
        encryptedArtifact: artifact.encrypted,
      });
    } else {
      storageKey = await uploadOAuthCloudArtifact({
        businessId,
        connectionId,
        provider: connection.provider,
        credentialsCiphertext: connection.credentialsCiphertext,
        runId: run.id,
        encryptedArtifact: artifact.encrypted,
      });
    }

    uploadedStorageKey = storageKey;

    failureStage = "persist_success";
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
      const retention = await pruneCloudBackupRuns(businessId, connectionId, scheduleId ?? undefined);
      if (retention.deleted > 0) {
        logger.info(
          `Cloud backup retention completed for business ${businessId}: deleted=${retention.deleted}.`,
        );
      }
    } catch (error) {
      // Keep the successful backup successful and preserve references to old objects.
      // The next successful backup on this destination will retry retention.
      logger.error(
        error instanceof Error
          ? `Cloud backup retention cleanup failed for business ${businessId}, destination ${connectionId}: ${error.message}`
          : `Cloud backup retention cleanup failed for business ${businessId}, destination ${connectionId}.`,
      );
    }

    return { ...completed, sizeBytes: completed.sizeBytes?.toString() ?? null };
  } catch (error) {
    logger.error({
      backupRunId: run.id,
      provider: connection.provider,
      trigger,
      stage: failureStage,
      errorType: error instanceof Error ? error.name : typeof error,
      ...(error instanceof AppError ? { statusCode: error.statusCode } : {}),
    }, "Cloud backup run failed.");

    try {
      // If upload succeeded but recording the run failed, avoid leaving an
      // untracked remote artifact where its provider reference is available.
      // Cleanup failure must not hide the original sanitized backup error.
      try {
        const candidateKey = uploadedStorageKey ?? (
          await prisma.backupRun.findFirst({
            where: { id: run.id, businessId, connectionId },
            select: { storageKey: true },
          })
        )?.storageKey;
        if (candidateKey) {
          if (s3Destination) {
            await deleteS3CompatibleArtifact({
              config: s3Destination.config,
              credentials: s3Destination.credentials,
              storageKey: candidateKey,
            });
          } else {
            await deleteOAuthCloudArtifact({
              businessId,
              connectionId,
              provider: connection.provider,
              credentialsCiphertext: connection.credentialsCiphertext,
              storageKey: candidateKey,
            });
          }
        }
      } catch (cleanupError) {
        logger.error({
          backupRunId: run.id,
          provider: connection.provider,
          stage: "cleanup_uploaded_artifact",
          errorType: cleanupError instanceof Error ? cleanupError.name : typeof cleanupError,
        }, "Cloud backup artifact cleanup failed.");
        // Keep the sanitized backup failure; never clear an unconfirmed reference.
      }

      failureStage = "persist_failure";
      await prisma.backupRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: "Backup generation or cloud upload failed.",
        },
      });
    } catch (persistenceError) {
      logger.error({
        backupRunId: run.id,
        provider: connection.provider,
        stage: failureStage,
        errorType: persistenceError instanceof Error ? persistenceError.name : typeof persistenceError,
      }, "Failed to persist cloud backup failure status.");
      // Preserve the sanitized backup failure if failure-state persistence also fails.
    }

    throw new AppError(
      "Backup failed. Check the destination configuration and server logs.",
      502,
    );
  }
}

/**
 * Keeps the newest successful backups for a destination or an individual schedule.
 * Database history is retained; a storage key is cleared only after deletion succeeds.
 */
export async function pruneCloudBackupRuns(
  businessId: string,
  connectionId: string,
  scheduleId?: string,
) {
  let retentionCount: number;

  if (scheduleId) {
    const schedule = await prisma.backupSchedule.findFirst({
      where: { id: scheduleId, businessId, destinationConnectionId: connectionId },
      select: { id: true, retentionCount: true },
    });

    if (
      !schedule ||
      !Number.isInteger(schedule.retentionCount) ||
      schedule.retentionCount < 1
    ) {
      return { deleted: 0 };
    }

    retentionCount = schedule.retentionCount;
  } else {
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

    retentionCount = settings.retentionCount;
  }

  const destinationRecord = await prisma.backupCloudConnection.findFirst({
    where: { businessId, id: connectionId },
    select: { id: true, provider: true, credentialsCiphertext: true },
  });

  if (!destinationRecord) throw new AppError("Cloud connection not found.", 404);

  const s3Destination = destinationRecord.provider === "S3_COMPATIBLE"
    ? await getS3Connection(businessId, connectionId)
    : null;

  const successfulRuns = await prisma.backupRun.findMany({
    where: {
      businessId,
      connectionId,
      scheduleId: scheduleId ?? null,
      status: "SUCCEEDED",
      storageKey: { not: null },
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, storageKey: true },
  });

  let deleted = 0;
  for (const run of successfulRuns.slice(retentionCount)) {
    if (!run.storageKey) continue;

    if (s3Destination) {
      await deleteS3CompatibleArtifact({
        config: s3Destination.config,
        credentials: s3Destination.credentials,
        storageKey: run.storageKey,
      });
    } else {
      await deleteOAuthCloudArtifact({
        businessId,
        connectionId,
        provider: destinationRecord.provider,
        credentialsCiphertext: destinationRecord.credentialsCiphertext,
        storageKey: run.storageKey,
      });
    }

    await prisma.backupRun.updateMany({
      where: {
        id: run.id,
        businessId,
        connectionId,
        scheduleId: scheduleId ?? null,
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
      id: true, scheduleId: true, connectionId: true, trigger: true, status: true,
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
