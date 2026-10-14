import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, createCloudBackupRun } = vi.hoisted(() => ({
  findMany: vi.fn(),
  createCloudBackupRun: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { backupSettings: { findMany } },
}));
vi.mock("../../src/modules/migrations/backup-cloud-runs.service.js", () => ({
  createCloudBackupRun,
}));

import {
  isBackupScheduleDue,
  processScheduledCloudBackups,
} from "../../src/modules/migrations/backup-cloud-scheduler.service.js";

const baseSchedule = {
  businessId: "business-1",
  enabled: true,
  frequency: "DAILY" as const,
  dayOfWeek: 3,
  dayOfMonth: 14,
  hour: 2,
  minute: 30,
  timezone: "Africa/Lagos",
  destinationConnectionId: "connection-1",
};

describe("isBackupScheduleDue", () => {
  const now = new Date("2026-10-14T01:30:00.000Z");

  it("matches the configured local time and timezone", () => {
    expect(isBackupScheduleDue(baseSchedule, now)).toBe(true);
  });

  it("rejects disabled schedules and missing destinations", () => {
    expect(isBackupScheduleDue({ ...baseSchedule, enabled: false }, now)).toBe(false);
    expect(isBackupScheduleDue({ ...baseSchedule, destinationConnectionId: null }, now)).toBe(false);
  });

  it("checks weekly day-of-week and monthly day-of-month", () => {
    expect(isBackupScheduleDue({ ...baseSchedule, frequency: "WEEKLY", dayOfWeek: 2 }, now)).toBe(false);
    expect(isBackupScheduleDue({ ...baseSchedule, frequency: "WEEKLY", dayOfWeek: 3 }, now)).toBe(true);
    expect(isBackupScheduleDue({ ...baseSchedule, frequency: "MONTHLY", dayOfMonth: 13 }, now)).toBe(false);
    expect(isBackupScheduleDue({ ...baseSchedule, frequency: "MONTHLY", dayOfMonth: 14 }, now)).toBe(true);
  });

  it("rejects a different configured minute and invalid timezones", () => {
    expect(isBackupScheduleDue({ ...baseSchedule, minute: 31 }, now)).toBe(false);
    expect(() => isBackupScheduleDue({ ...baseSchedule, timezone: "Not/A_Timezone" }, now)).toThrow();
  });
});

describe("processScheduledCloudBackups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([baseSchedule]);
    createCloudBackupRun.mockResolvedValue({ id: "run-1" });
  });

  it("creates a scheduled run with a minute-truncated slot", async () => {
    const now = new Date("2026-10-14T01:30:42.321Z");
    await expect(processScheduledCloudBackups(now)).resolves.toEqual({
      schedulesScanned: 1,
      due: 1,
      started: 1,
    });
    expect(createCloudBackupRun).toHaveBeenCalledWith(
      "business-1",
      "connection-1",
      { trigger: "SCHEDULED", scheduledFor: new Date("2026-10-14T01:30:00.000Z") },
    );
  });

  it("ignores a duplicate scheduled slot without failing the scan", async () => {
    createCloudBackupRun.mockRejectedValueOnce({ code: "P2002" });
    await expect(processScheduledCloudBackups(new Date("2026-10-14T01:30:42.321Z"))).resolves.toEqual({
      schedulesScanned: 1,
      due: 1,
      started: 0,
    });
  });

  it("does not start a run when the configured time is not due", async () => {
    await expect(processScheduledCloudBackups(new Date("2026-10-14T01:31:00.000Z"))).resolves.toEqual({
      schedulesScanned: 1,
      due: 0,
      started: 0,
    });
    expect(createCloudBackupRun).not.toHaveBeenCalled();
  });
});
