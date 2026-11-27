import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  backupSettingsFindUnique,
  backupScheduleFindFirst,
  connectionFindFirst,
  backupRunFindMany,
  backupRunUpdateMany,
  backupRunCreate,
  backupRunUpdate,
  backupRunFindFirst,
  createArtifact,
  deleteArtifact,
  deleteOAuthArtifact,
  loggerInfo,
  loggerError,
  loggerWarn,
  backupCloudConnectionUpdate,
  verifyOAuthCloudDestination,
  uploadOAuthArtifact,
  recoverOAuthArtifact,
} = vi.hoisted(() => ({
  backupSettingsFindUnique: vi.fn(),
  backupScheduleFindFirst: vi.fn(),
  connectionFindFirst: vi.fn(),
  backupRunFindMany: vi.fn(),
  backupRunUpdateMany: vi.fn(),
  backupRunCreate: vi.fn(),
  backupRunUpdate: vi.fn(),
  backupRunFindFirst: vi.fn(),
  createArtifact: vi.fn(),
  deleteArtifact: vi.fn(),
  deleteOAuthArtifact: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  backupCloudConnectionUpdate: vi.fn(),
  verifyOAuthCloudDestination: vi.fn(),
  uploadOAuthArtifact: vi.fn(),
  recoverOAuthArtifact: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn().mockResolvedValue({ timezone: "Africa/Lagos" }) },
    backupSettings: { findUnique: backupSettingsFindUnique },
    backupSchedule: { findFirst: backupScheduleFindFirst },
    backupCloudConnection: {
      findFirst: connectionFindFirst,
      update: backupCloudConnectionUpdate,
    },
    backupRun: {
      findMany: backupRunFindMany,
      updateMany: backupRunUpdateMany,
      create: backupRunCreate,
      update: backupRunUpdate,
      findFirst: backupRunFindFirst,
    },
  },
}));

vi.mock("../../src/lib/logger.js", () => ({
  logger: { info: loggerInfo, error: loggerError, warn: loggerWarn },
}));

vi.mock("../../src/modules/migrations/backup-crypto.service.js", () => ({
  decryptBackupCredentials: vi.fn(() => JSON.stringify({
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
  })),
}));

vi.mock("../../src/modules/migrations/backup-s3.provider.js", () => ({
  deleteS3CompatibleArtifact: deleteArtifact,
  uploadS3CompatibleArtifact: vi.fn(),
  verifyS3CompatibleBucket: vi.fn(),
}));

vi.mock("../../src/modules/migrations/backup-cloud-oauth-provider.service.js", () => ({
  deleteOAuthCloudArtifact: deleteOAuthArtifact,
  uploadOAuthCloudArtifact: uploadOAuthArtifact,
  recoverOAuthCloudArtifact: recoverOAuthArtifact,
  verifyOAuthCloudDestination,
}));

vi.mock("../../src/modules/migrations/backup.service.js", () => ({
  createScheduledBackupArtifact: createArtifact,
}));

import {
  createCloudBackupRun,
  pruneCloudBackupRuns,
  verifyBackupCloudConnection,
} from "../../src/modules/migrations/backup-cloud-runs.service.js";

const settings = {
  retentionCount: 2,
  destinationConnectionId: "connection-1",
};
const manualIdempotencyKey = "7b74a7c2-4f3d-4c56-9c19-0dd626520026";

const connection = {
  id: "connection-1",
  provider: "S3_COMPATIBLE",
  config: {
    endpoint: "https://storage.example.com",
    region: "test-region",
    bucket: "test-backups",
  },
  credentialsCiphertext: "encrypted-test-credentials",
};


describe("createCloudBackupRun diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backupRunCreate.mockResolvedValue({ id: "run-1" });
    backupRunUpdate.mockResolvedValue({});
    backupRunFindFirst.mockResolvedValue(null);
    createArtifact.mockRejectedValue(new Error("internal detail must not be logged"));
    connectionFindFirst
      .mockResolvedValueOnce({ id: "connection-1", provider: "GOOGLE_DRIVE", credentialsCiphertext: "encrypted-test-credentials" })
      .mockResolvedValueOnce({ id: "connection-1" });
  });

  it("logs the failing stage without logging raw error messages", async () => {
    await expect(
      createCloudBackupRun("business-1", "connection-1", { idempotencyKey: manualIdempotencyKey }),
    ).rejects.toThrow("Backup failed. Check the destination configuration and server logs.");

    expect(loggerError).toHaveBeenCalledWith({
      backupRunId: "run-1",
      provider: "GOOGLE_DRIVE",
      trigger: "MANUAL",
      stage: "generate_artifact",
      errorType: "Error",
    }, "Cloud backup run failed.");
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain("internal detail must not be logged");
    expect(backupRunUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: "FAILED",
          errorMessage: "Backup generation failed before upload.",
      }),
    }));
  });

  it("rejects a stale OneDrive connection before verifying or creating a run", async () => {
    connectionFindFirst.mockReset().mockResolvedValue({
      id: "connection-1", provider: "ONEDRIVE", credentialsCiphertext: "legacy-ciphertext",
    });
    await expect(createCloudBackupRun("business-1", "connection-1", { idempotencyKey: manualIdempotencyKey }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(backupRunCreate).not.toHaveBeenCalled();
    expect(createArtifact).not.toHaveBeenCalled();
    expect(uploadOAuthArtifact).not.toHaveBeenCalled();
  });

  it("records the provider-confirmed artifact key, checksum, and encrypted size only after upload succeeds", async () => {
    createArtifact.mockResolvedValue({
      encrypted: Buffer.from("encrypted bytes"),
      checksumSha256: "c".repeat(64),
      sizeBytes: 15,
    });
    uploadOAuthArtifact.mockResolvedValue("google:provider-confirmed-file-id");
    backupRunUpdate.mockResolvedValueOnce({}).mockResolvedValueOnce({
      id: "run-1", trigger: "MANUAL", status: "SUCCEEDED",
      storageKey: "google:provider-confirmed-file-id", checksumSha256: "c".repeat(64),
      sizeBytes: 15n, startedAt: new Date(), completedAt: new Date(), createdAt: new Date(),
    });

    await expect(createCloudBackupRun("business-1", "connection-1", { idempotencyKey: manualIdempotencyKey })).resolves.toMatchObject({
      id: "run-1", status: "SUCCEEDED", storageKey: "google:provider-confirmed-file-id",
      checksumSha256: "c".repeat(64), sizeBytes: "15",
    });
    expect(uploadOAuthArtifact).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-1", encryptedArtifact: Buffer.from("encrypted bytes"),
    }));
    expect(backupRunUpdate.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      data: expect.objectContaining({
        status: "SUCCEEDED", storageKey: "google:provider-confirmed-file-id",
        checksumSha256: "c".repeat(64), sizeBytes: 15n,
      }),
    }));
  });

  it("does not delete a provider-confirmed upload when success history persistence fails", async () => {
    createArtifact.mockResolvedValue({ encrypted: Buffer.from("encrypted bytes"), checksumSha256: "d".repeat(64), sizeBytes: 15 });
    uploadOAuthArtifact.mockResolvedValue("google:provider-confirmed-file-id");
    backupRunUpdate.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("history unavailable")).mockResolvedValueOnce({});

    await expect(createCloudBackupRun("business-1", "connection-1", { idempotencyKey: manualIdempotencyKey })).rejects.toThrow("Backup failed.");
    expect(deleteOAuthArtifact).not.toHaveBeenCalled();
    expect(backupRunUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED", errorMessage: expect.stringContaining("upload completed") }),
    }));
  });

  it("returns the completed run for a duplicate manual submission without uploading again", async () => {
    const completed = {
      id: "run-previous", trigger: "MANUAL", status: "SUCCEEDED",
      storageKey: "google:existing-file", checksumSha256: "a".repeat(64),
      sizeBytes: 15n, startedAt: new Date(), completedAt: new Date(), createdAt: new Date(),
      errorMessage: null,
    };
    backupRunFindFirst.mockResolvedValue(completed);

    await expect(createCloudBackupRun("business-1", "connection-1", { idempotencyKey: manualIdempotencyKey }))
      .resolves.toMatchObject({ id: "run-previous", status: "SUCCEEDED", storageKey: "google:existing-file", sizeBytes: "15" });

    expect(backupRunCreate).not.toHaveBeenCalled();
    expect(createArtifact).not.toHaveBeenCalled();
    expect(uploadOAuthArtifact).not.toHaveBeenCalled();
  });

  it("rejects a concurrent duplicate insert before artifact generation or upload", async () => {
    backupRunCreate.mockRejectedValueOnce({ code: "P2002" });
    backupRunFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "run-concurrent", trigger: "MANUAL", status: "RUNNING", errorMessage: null });

    await expect(createCloudBackupRun("business-1", "connection-1", { idempotencyKey: manualIdempotencyKey }))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(backupRunCreate).toHaveBeenCalledOnce();
    expect(createArtifact).not.toHaveBeenCalled();
    expect(uploadOAuthArtifact).not.toHaveBeenCalled();
  });

  it("fails closed for an uncertain upload result instead of starting a duplicate upload", async () => {
    backupRunFindFirst.mockResolvedValue({
      id: "run-previous", trigger: "MANUAL", status: "FAILED", errorMessage: "Cloud upload failed. Verify the destination connection and provider authorization.",
    });

    await expect(createCloudBackupRun("business-1", "connection-1", { idempotencyKey: manualIdempotencyKey }))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(backupRunCreate).not.toHaveBeenCalled();
    expect(createArtifact).not.toHaveBeenCalled();
    expect(uploadOAuthArtifact).not.toHaveBeenCalled();
  });

  it("recovers provider-confirmed history after a success persistence failure without uploading again", async () => {
    const startedAt = new Date(Date.now() - 60_000);
    const existingRun = {
      id: "run-previous", trigger: "MANUAL", status: "FAILED", startedAt,
      errorMessage: "The upload completed, but backup history could not confirm the result. Contact an administrator before retrying.",
    };
    backupRunFindFirst.mockResolvedValue(existingRun);
    recoverOAuthArtifact.mockResolvedValue({
      storageKey: "google:recovered-file-id", checksumSha256: "e".repeat(64), sizeBytes: 23,
    });
    backupRunUpdate.mockResolvedValueOnce({
      id: existingRun.id, trigger: "MANUAL", status: "SUCCEEDED",
      storageKey: "google:recovered-file-id", checksumSha256: "e".repeat(64),
      sizeBytes: 23n, startedAt, completedAt: new Date(), createdAt: startedAt,
    });

    await expect(createCloudBackupRun("business-1", "connection-1", { idempotencyKey: manualIdempotencyKey }))
      .resolves.toMatchObject({
        id: "run-previous", status: "SUCCEEDED", storageKey: "google:recovered-file-id",
        checksumSha256: "e".repeat(64), sizeBytes: "23",
      });

    expect(recoverOAuthArtifact).toHaveBeenCalledWith(expect.objectContaining({
      provider: "GOOGLE_DRIVE", runId: existingRun.id, executionTime: startedAt,
    }));
    expect(backupRunUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: existingRun.id },
      data: expect.objectContaining({ status: "SUCCEEDED", storageKey: "google:recovered-file-id", sizeBytes: 23n }),
    }));
    expect(backupRunCreate).not.toHaveBeenCalled();
    expect(createArtifact).not.toHaveBeenCalled();
    expect(uploadOAuthArtifact).not.toHaveBeenCalled();
  });

  it("reconciles a stale running operation without creating a second upload", async () => {
    const startedAt = new Date(Date.now() - 11 * 60 * 1000);
    backupRunFindFirst.mockResolvedValue({
      id: "run-stale", trigger: "MANUAL", status: "RUNNING", startedAt, errorMessage: null,
    });
    recoverOAuthArtifact.mockResolvedValue({
      storageKey: "dropbox:/laundry angels backup/recovered.enc", checksumSha256: "f".repeat(64), sizeBytes: 9,
    });
    backupRunUpdate.mockResolvedValueOnce({
      id: "run-stale", trigger: "MANUAL", status: "SUCCEEDED",
      storageKey: "dropbox:/laundry angels backup/recovered.enc", checksumSha256: "f".repeat(64),
      sizeBytes: 9n, startedAt, completedAt: new Date(), createdAt: startedAt,
    });
    connectionFindFirst.mockReset()
      .mockResolvedValueOnce({ id: "connection-1", provider: "DROPBOX", credentialsCiphertext: "encrypted-test-credentials" })
      .mockResolvedValueOnce({ id: "connection-1" });

    await expect(createCloudBackupRun("business-1", "connection-1", { idempotencyKey: manualIdempotencyKey }))
      .resolves.toMatchObject({ id: "run-stale", status: "SUCCEEDED", sizeBytes: "9" });

    expect(recoverOAuthArtifact).toHaveBeenCalledWith(expect.objectContaining({ provider: "DROPBOX", runId: "run-stale" }));
    expect(backupRunCreate).not.toHaveBeenCalled();
    expect(uploadOAuthArtifact).not.toHaveBeenCalled();
  });
});

describe("verifyBackupCloudConnection diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectionFindFirst.mockResolvedValue({
      id: "connection-1",
      provider: "GOOGLE_DRIVE",
      credentialsCiphertext: "encrypted-test-credentials",
    });
    verifyOAuthCloudDestination.mockRejectedValue(
      new Error("sensitive provider response and token details"),
    );
    backupCloudConnectionUpdate.mockResolvedValue({});
  });

  it("logs a safe diagnostic without exposing unexpected provider errors", async () => {
    await expect(
      verifyBackupCloudConnection("business-1", "connection-1"),
    ).rejects.toThrow(
      "Cloud destination verification failed. Check the destination settings and authorization.",
    );

    expect(loggerWarn).toHaveBeenCalledWith({
      provider: "GOOGLE_DRIVE",
      connectionId: "connection-1",
      errorType: "Error",
      diagnostic: "Unexpected provider verification error.",
    }, "Cloud destination verification failed.");

    expect(JSON.stringify(loggerWarn.mock.calls)).not.toContain(
      "sensitive provider response and token details",
    );
    expect(backupCloudConnectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId_id: { businessId: "business-1", id: "connection-1" } },
        data: {
          status: "ERROR",
          verifiedAt: null,
          lastError: "Provider verification failed.",
        },
      }),
    );
  });
});

describe("pruneCloudBackupRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backupSettingsFindUnique.mockResolvedValue(settings);
    backupScheduleFindFirst.mockResolvedValue({ id: "schedule-1", retentionCount: 2 });
    connectionFindFirst.mockResolvedValue(connection);
    backupRunUpdateMany.mockResolvedValue({ count: 1 });
    backupRunCreate.mockResolvedValue({ id: "run-1" });
    backupRunUpdate.mockResolvedValue({});
    backupRunFindFirst.mockResolvedValue(null);
    createArtifact.mockResolvedValue({ encrypted: Buffer.from("encrypted"), checksumSha256: "a".repeat(64), sizeBytes: 10 });
    deleteArtifact.mockResolvedValue(undefined);
    deleteOAuthArtifact.mockResolvedValue(undefined);
  });

  it("never prunes existing Google Drive backup artifacts", async () => {
    connectionFindFirst.mockResolvedValue({
      ...connection,
      provider: "GOOGLE_DRIVE",
    });
    backupRunFindMany.mockResolvedValue([
      { id: "newest-1", storageKey: "google:newest-file-id" },
      { id: "newest-2", storageKey: "google:second-file-id" },
      { id: "oldest", storageKey: "google:oldest-file-id" },
    ]);

    await expect(pruneCloudBackupRuns("business-1", "connection-1"))
      .resolves.toEqual({ deleted: 0 });

    expect(deleteOAuthArtifact).not.toHaveBeenCalled();
    expect(deleteArtifact).not.toHaveBeenCalled();
    expect(backupRunUpdateMany).not.toHaveBeenCalled();
    expect(backupRunFindMany).not.toHaveBeenCalled();
  });

  it("never prunes existing Dropbox backup artifacts", async () => {
    connectionFindFirst.mockResolvedValue({ ...connection, provider: "DROPBOX" });
    await expect(pruneCloudBackupRuns("business-1", "connection-1"))
      .resolves.toEqual({ deleted: 0 });
    expect(deleteOAuthArtifact).not.toHaveBeenCalled();
    expect(backupRunUpdateMany).not.toHaveBeenCalled();
  });

  it("isolates retention to the selected schedule", async () => {
    backupScheduleFindFirst.mockResolvedValue({ id: "schedule-2", retentionCount: 1 });
    backupRunFindMany.mockResolvedValue([
      { id: "schedule-2-newest", storageKey: "backups/schedule-2-newest.enc" },
      { id: "schedule-2-oldest", storageKey: "backups/schedule-2-oldest.enc" },
    ]);

    await expect(
      pruneCloudBackupRuns("business-1", "connection-1", "schedule-2"),
    ).resolves.toEqual({ deleted: 1 });

    expect(backupScheduleFindFirst).toHaveBeenCalledWith({
      where: {
        id: "schedule-2",
        businessId: "business-1",
        destinationConnectionId: "connection-1",
      },
      select: { id: true, retentionCount: true },
    });
    expect(backupSettingsFindUnique).not.toHaveBeenCalled();
    expect(backupRunFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business-1",
        connectionId: "connection-1",
        scheduleId: "schedule-2",
        status: "SUCCEEDED",
      }),
    }));
    expect(backupRunUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "schedule-2-oldest",
        scheduleId: "schedule-2",
      }),
      data: { storageKey: null },
    }));
  });

  it("does not prune when the connection is not the configured destination", async () => {
    backupSettingsFindUnique.mockResolvedValue({
      ...settings,
      destinationConnectionId: "another-connection",
    });

    await expect(
      pruneCloudBackupRuns("business-1", "connection-1"),
    ).resolves.toEqual({ deleted: 0 });

    expect(connectionFindFirst).not.toHaveBeenCalled();
    expect(backupRunFindMany).not.toHaveBeenCalled();
    expect(deleteArtifact).not.toHaveBeenCalled();
  });

  it("deletes only successful backups older than the configured retention count", async () => {
    backupRunFindMany.mockResolvedValue([
      { id: "newest-1", storageKey: "backups/newest-1.enc" },
      { id: "newest-2", storageKey: "backups/newest-2.enc" },
      { id: "oldest", storageKey: "backups/oldest.enc" },
    ]);

    await expect(
      pruneCloudBackupRuns("business-1", "connection-1"),
    ).resolves.toEqual({ deleted: 1 });

    expect(backupRunFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        businessId: "business-1",
        connectionId: "connection-1",
        scheduleId: null,
        status: "SUCCEEDED",
        storageKey: { not: null },
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    }));

    expect(deleteArtifact).toHaveBeenCalledTimes(1);
    expect(deleteArtifact).toHaveBeenCalledWith(expect.objectContaining({
      storageKey: "backups/oldest.enc",
    }));
    expect(backupRunUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "oldest",
        businessId: "business-1",
        connectionId: "connection-1",
        scheduleId: null,
        status: "SUCCEEDED",
        storageKey: "backups/oldest.enc",
      },
      data: { storageKey: null },
    });
  });

  it("preserves the database storage reference when artifact deletion fails", async () => {
    backupRunFindMany.mockResolvedValue([
      { id: "newest-1", storageKey: "backups/newest-1.enc" },
      { id: "newest-2", storageKey: "backups/newest-2.enc" },
      { id: "oldest", storageKey: "backups/oldest.enc" },
    ]);
    deleteArtifact.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(
      pruneCloudBackupRuns("business-1", "connection-1"),
    ).rejects.toThrow("storage unavailable");

    expect(backupRunUpdateMany).not.toHaveBeenCalled();
  });

  it("does nothing when retention settings are missing or invalid", async () => {
    backupSettingsFindUnique.mockResolvedValueOnce(null);

    await expect(
      pruneCloudBackupRuns("business-1", "connection-1"),
    ).resolves.toEqual({ deleted: 0 });

    backupSettingsFindUnique.mockResolvedValueOnce({
      ...settings,
      retentionCount: 0,
    });

    await expect(
      pruneCloudBackupRuns("business-1", "connection-1"),
    ).resolves.toEqual({ deleted: 0 });

    expect(connectionFindFirst).not.toHaveBeenCalled();
    expect(backupRunFindMany).not.toHaveBeenCalled();
  });
});
