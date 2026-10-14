import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  backupSettingsFindUnique,
  connectionFindFirst,
  backupRunFindMany,
  backupRunUpdateMany,
  deleteArtifact,
  loggerInfo,
  loggerError,
} = vi.hoisted(() => ({
  backupSettingsFindUnique: vi.fn(),
  connectionFindFirst: vi.fn(),
  backupRunFindMany: vi.fn(),
  backupRunUpdateMany: vi.fn(),
  deleteArtifact: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    backupSettings: { findUnique: backupSettingsFindUnique },
    backupCloudConnection: { findFirst: connectionFindFirst },
    backupRun: {
      findMany: backupRunFindMany,
      updateMany: backupRunUpdateMany,
    },
  },
}));

vi.mock("../../src/lib/logger.js", () => ({
  logger: { info: loggerInfo, error: loggerError },
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

vi.mock("../../src/modules/migrations/backup.service.js", () => ({
  createScheduledBackupArtifact: vi.fn(),
}));

import { pruneCloudBackupRuns } from "../../src/modules/migrations/backup-cloud-runs.service.js";

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

describe("pruneCloudBackupRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backupSettingsFindUnique.mockResolvedValue(settings);
    connectionFindFirst.mockResolvedValue(connection);
    backupRunUpdateMany.mockResolvedValue({ count: 1 });
    deleteArtifact.mockResolvedValue(undefined);
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
