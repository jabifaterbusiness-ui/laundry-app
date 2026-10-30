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
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
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
  uploadOAuthCloudArtifact: vi.fn(),
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
      createCloudBackupRun("business-1", "connection-1"),
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
        errorMessage: "Backup generation or cloud upload failed.",
      }),
    }));
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

  it("uses the OAuth provider adapter when pruning a Google Drive destination", async () => {
    connectionFindFirst.mockResolvedValue({
      ...connection,
      provider: "GOOGLE_DRIVE",
    });
    backupRunFindMany.mockResolvedValue([
      { id: "newest-1", storageKey: "google:newest-file-id" },
      { id: "newest-2", storageKey: "google:second-file-id" },
      { id: "oldest", storageKey: "google:oldest-file-id" },
    ]);

    await expect(
      pruneCloudBackupRuns("business-1", "connection-1"),
    ).resolves.toEqual({ deleted: 1 });

    expect(deleteOAuthArtifact).toHaveBeenCalledTimes(1);
    expect(deleteOAuthArtifact).toHaveBeenCalledWith(expect.objectContaining({
      businessId: "business-1",
      connectionId: "connection-1",
      provider: "GOOGLE_DRIVE",
      storageKey: "google:oldest-file-id",
    }));
    expect(deleteArtifact).not.toHaveBeenCalled();
    expect(backupRunUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "oldest",
        storageKey: "google:oldest-file-id",
      }),
      data: { storageKey: null },
    }));
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
