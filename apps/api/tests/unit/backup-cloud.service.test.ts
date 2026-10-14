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

  it("rejects enabling scheduling while the scheduler is unavailable", async () => {
    await expect(
      saveBackupSettings({ ...settings, enabled: true }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message:
        "Scheduled cloud backups are not available yet. Disable scheduling and use manual backups.",
    });

    expect(upsert).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
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
