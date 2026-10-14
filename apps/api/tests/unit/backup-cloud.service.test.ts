import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert, findFirst, create } = vi.hoisted(() => ({
  upsert: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    backupSettings: { upsert },
    backupCloudConnection: { findFirst, create },
  },
}));

import {
  createBackupConnection,
  saveBackupSettings,
} from "../../src/modules/migrations/backup-cloud.service.js";

const settings = {
  businessId: "business-1",
  enabled: false,
  frequency: "DAILY" as const,
  dayOfWeek: 1,
  dayOfMonth: 1,
  hour: 2,
  minute: 0,
  timezone: "Africa/Lagos",
  retentionCount: 7,
  destinationConnectionId: null,
};

describe("saveBackupSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows scheduling when the selected destination is verified", async () => {
    findFirst.mockResolvedValueOnce({ id: "connection-1" });
    upsert.mockResolvedValueOnce({ enabled: true });

    await saveBackupSettings({
      ...settings,
      enabled: true,
      destinationConnectionId: "connection-1",
    });

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "connection-1",
        businessId: "business-1",
        status: "CONNECTED",
        verifiedAt: { not: null },
      }),
    }));
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("allows disabled settings to be saved", async () => {
    upsert.mockResolvedValueOnce({ enabled: false });

    await saveBackupSettings(settings);

    expect(upsert).toHaveBeenCalledTimes(1);
  });
});


describe("createBackupConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unsupported cloud providers before persisting credentials", async () => {
    await expect(
      createBackupConnection({
        businessId: "business-1",
        provider: "GOOGLE_DRIVE",
        displayName: "Unsupported destination",
        credentials: { accessToken: "must-not-be-persisted" },
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: "Only S3-compatible cloud backups are currently supported.",
    });

    expect(create).not.toHaveBeenCalled();
  });
});
