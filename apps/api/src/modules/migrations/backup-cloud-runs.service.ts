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
  recoverOAuthCloudArtifact,
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
  if (connection.provider === "ONEDRIVE") {
    throw new AppError("OneDrive is not an available business backup destination.", 403);
  }

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
  if (record.provider === "ONEDRIVE") {
    throw new AppError("OneDrive is not an available business backup destination.", 403);
  }

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
  } catch (error) {
    // Log only controlled AppError messages; never log provider response bodies,
    // OAuth credentials, access tokens, refresh tokens, or encrypted payloads.
    logger.warn({
      provider: record.provider,
      connectionId: record.id,
      errorType: error instanceof Error ? error.name : typeof error,
      ...(error instanceof AppError
        ? { statusCode: error.statusCode, diagnostic: error.message }
        : { diagnostic: "Unexpected provider verification error." }),
    }, "Cloud destination verification failed.");

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
  options: { trigger?: "MANUAL" | "SCHEDULED"; scheduledFor?: Date; scheduleId?: string; idempotencyKey?: string } = {},
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  if (!business) throw new AppError("Business not found.", 404);

  const connection = await prisma.backupCloudConnection.findFirst({
    where: { businessId, id: connectionId },
    select: { id: true, provider: true, credentialsCiphertext: true },
  });

  if (!connection) throw new AppError("Cloud connection not found.", 404);
  if (connection.provider === "ONEDRIVE") {
    throw new AppError("OneDrive is not an available business backup destination.", 403);
  }

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
  const idempotencyKey = trigger === "MANUAL" ? options.idempotencyKey : undefined;
  if (trigger === "MANUAL" && (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))) {
    throw new AppError("A valid idempotency key is required for a manual backup.", 422);
  }
  let scheduledFor: Date | undefined;
  let scheduleId: string | null = null;

  if (trigger === "SCHEDULED") {
    if (!options.scheduledFor) {
      throw new AppError("A scheduled backup requires a scheduled time.", 422);
    }
    scheduledFor = options.scheduledFor;

    if (options.scheduleId) {
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
    } else {
      const settings = await prisma.backupSettings.findFirst({
        where: { businessId, enabled: true, destinationConnectionId: connectionId },
        select: { businessId: true },
      });
      if (!settings) {
        throw new AppError("Automatic backup settings are unavailable for this destination.", 422);
      }
    }
  }

  const runData = {
    businessId,
    connectionId,
    scheduleId,
    trigger,
    status: "PENDING" as const,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(scheduledFor ? { scheduledFor } : {}),
  };
  const completedFields = {
    id: true, trigger: true, status: true, storageKey: true,
    checksumSha256: true, sizeBytes: true, startedAt: true,
    completedAt: true, createdAt: true,
  } as const;
  const existingRun = idempotencyKey
    ? await prisma.backupRun.findFirst({
        where: { businessId, idempotencyKey },
        select: { ...completedFields, errorMessage: true },
      })
    : null;

  if (existingRun?.status === "SUCCEEDED") {
    return { ...existingRun, sizeBytes: existingRun.sizeBytes?.toString() ?? null };
  }

  const historyPersistenceFailure =
    "The upload completed, but backup history could not confirm the result. Contact an administrator before retrying.";
  const staleRunningRun = existingRun?.status === "RUNNING" &&
    Date.now() - existingRun.startedAt.getTime() > 10 * 60 * 1000;
  if (
    (existingRun?.status === "FAILED" && existingRun.errorMessage === historyPersistenceFailure) ||
    staleRunningRun
  ) {
    if (connection.provider !== "GOOGLE_DRIVE" && connection.provider !== "DROPBOX") {
      throw new AppError("This backup upload needs provider reconciliation before it can be retried.", 409);
    }
    try {
      const recovered = await recoverOAuthCloudArtifact({
        businessId,
        connectionId,
        provider: connection.provider,
        credentialsCiphertext: connection.credentialsCiphertext,
        runId: existingRun.id,
        trigger: existingRun.trigger === "SCHEDULED" ? "SCHEDULED" : "MANUAL",
        businessTimezone: business.timezone,
        executionTime: existingRun.startedAt,
      });
      if (!recovered) {
        throw new AppError("The provider has not confirmed this upload yet. Retry after checking the destination.", 409);
      }
      const completed = await prisma.backupRun.update({
        where: { id: existingRun.id },
        data: {
          status: "SUCCEEDED",
          storageKey: recovered.storageKey,
          checksumSha256: recovered.checksumSha256,
          sizeBytes: BigInt(recovered.sizeBytes),
          completedAt: new Date(),
          errorMessage: null,
        },
        select: completedFields,
      });
      return { ...completed, sizeBytes: completed.sizeBytes?.toString() ?? null };
    } catch (error) {
      logger.warn({
        backupRunId: existingRun.id,
        provider: connection.provider,
        errorType: error instanceof Error ? error.name : typeof error,
      }, "Cloud backup provider reconciliation did not complete.");
      if (error instanceof AppError && error.statusCode === 409) throw error;
      throw new AppError("The previous cloud upload could not be reconciled. Retry after checking the destination.", 409);
    }
  }

  const safeToRetryFailureMessages = [
    "Backup generation failed before upload.",
    "The backup run could not be started or finalized.",
  ];
  let run: { id: string };
  if (existingRun && existingRun.status === "FAILED" && safeToRetryFailureMessages.includes(existingRun.errorMessage ?? "")) {
    const retry = await prisma.backupRun.updateMany({
      where: {
        id: existingRun.id,
        businessId,
        idempotencyKey: idempotencyKey!,
        status: "FAILED",
        errorMessage: { in: safeToRetryFailureMessages },
      },
      data: { status: "PENDING", errorMessage: null, completedAt: null },
    });
    if (!retry.count) {
      const latest = await prisma.backupRun.findFirst({
        where: { businessId, idempotencyKey: idempotencyKey! },
        select: { ...completedFields, errorMessage: true },
      });
      if (latest?.status === "SUCCEEDED") {
        return { ...latest, sizeBytes: latest.sizeBytes?.toString() ?? null };
      }
      throw new AppError("This backup request is already being processed. Check backup history before retrying.", 409);
    }
    run = { id: existingRun.id };
  } else if (existingRun) {
    throw new AppError(
      existingRun.status === "FAILED"
        ? "This backup attempt has an uncertain upload result. Check provider storage and backup history before starting another backup."
        : "This backup request is already being processed. Check backup history before retrying.",
      409,
    );
  } else if (trigger === "SCHEDULED") {
    run = await prisma.$transaction(async (tx) => {
        // Serialize all scheduled slots for this business destination, then
        // check the slot before inserting. This also protects legacy rows and
        // avoids a migration that could fail on historical duplicate records.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${businessId}), hashtext(${connectionId}))`;
        const existing = await tx.backupRun.findFirst({
          where: {
            businessId,
            connectionId,
            trigger: "SCHEDULED",
            scheduledFor: scheduledFor!,
          },
          select: { id: true },
        });
        if (existing) {
          throw Object.assign(new Error("Scheduled backup slot already exists."), { code: "P2002" });
        }
      return tx.backupRun.create({ data: runData, select: { id: true } });
    });
  } else {
    try {
      run = await prisma.backupRun.create({ data: runData, select: { id: true } });
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") throw error;
      const concurrentRun = await prisma.backupRun.findFirst({
        where: { businessId, idempotencyKey: idempotencyKey! },
        select: { ...completedFields, errorMessage: true },
      });
      if (concurrentRun?.status === "SUCCEEDED") {
        return { ...concurrentRun, sizeBytes: concurrentRun.sizeBytes?.toString() ?? null };
      }
      throw new AppError("This backup request is already being processed. Check backup history before retrying.", 409);
    }
  }

  let uploadedStorageKey: string | null = null;
  let failureStage = "mark_running";

  try {
    const executionTime = new Date();
    await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", startedAt: executionTime },
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
        trigger,
        businessTimezone: business.timezone,
        executionTime,
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
      select: completedFields,
    });

    // Preserve all historical Drive and Dropbox artifacts. Retention pruning
    // remains enabled only for providers outside this workstream.
    if (connection.provider !== "GOOGLE_DRIVE" && connection.provider !== "DROPBOX") {
      try {
        const retention = await pruneCloudBackupRuns(businessId, connectionId, scheduleId ?? undefined);
        if (retention.deleted > 0) {
          logger.info(
            `Cloud backup retention completed for business ${businessId}: deleted=${retention.deleted}.`,
          );
        }
      } catch (error) {
        // Keep the successful backup successful and preserve old object references.
        logger.error(
          error instanceof Error
            ? `Cloud backup retention cleanup failed for business ${businessId}, destination ${connectionId}: ${error.message}`
            : `Cloud backup retention cleanup failed for business ${businessId}, destination ${connectionId}.`,
        );
      }
    }

    return { ...completed, sizeBytes: completed.sizeBytes?.toString() ?? null };
  } catch (error) {
    const failureMessage = failureStage === "generate_artifact"
      ? "Backup generation failed before upload."
      : failureStage === "upload_artifact"
        ? "Cloud upload failed. Verify the destination connection and provider authorization."
        : failureStage === "persist_success"
          ? "The upload completed, but backup history could not confirm the result. Contact an administrator before retrying."
          : "The backup run could not be started or finalized.";
    logger.error({
      backupRunId: run.id,
      provider: connection.provider,
      trigger,
      stage: failureStage,
      errorType: error instanceof Error ? error.name : typeof error,
      ...(error instanceof AppError ? { statusCode: error.statusCode } : {}),
    }, "Cloud backup run failed.");

    try {
      // Keep a provider-confirmed upload if only history persistence failed.
      // It is safer to retain a recoverable backup than to delete the only
      // confirmed artifact while reporting that persistence was ambiguous.
      try {
        const candidateKey = failureStage === "persist_success" ? null : uploadedStorageKey ?? (
          connection.provider === "GOOGLE_DRIVE" || connection.provider === "DROPBOX"
            ? null
            : (await prisma.backupRun.findFirst({
                where: { id: run.id, businessId, connectionId },
                select: { storageKey: true },
              }))?.storageKey ?? null
        );
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
          errorMessage: failureMessage,
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
  if (destinationRecord.provider === "GOOGLE_DRIVE" || destinationRecord.provider === "DROPBOX") {
    return { deleted: 0 };
  }

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
