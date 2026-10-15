import { afterEach, describe, expect, it, vi } from "vitest";
import {
  saveCloudBackupSettings,
  listCloudBackupSchedules,
  createCloudBackupSchedule,
  updateCloudBackupSchedule,
  deleteCloudBackupSchedule,
  type CloudBackupSchedule,
  type CloudBackupScheduleInput,
} from "../../src/lib/data-management-api.js";

describe("saveCloudBackupSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends only the allowed settings fields, excluding server-managed fields", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          settings: {
            id: "settings-1",
            enabled: true,
            frequency: "DAILY",
            dayOfWeek: 1,
            dayOfMonth: 15,
            hour: 2,
            minute: 30,
            timezone: "Africa/Lagos",
            retentionCount: 7,
            destinationConnectionId: "dropbox-1",
            createdAt: "2026-10-14T10:00:00.000Z",
            updatedAt: "2026-10-14T10:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const input = {
      enabled: true,
      frequency: "DAILY" as const,
      dayOfWeek: 1,
      dayOfMonth: 15,
      hour: 2,
      minute: 30,
      timezone: "Africa/Lagos",
      retentionCount: 7,
      destinationConnectionId: "dropbox-1",
      id: "settings-1",
      createdAt: "2026-10-14T10:00:00.000Z",
      updatedAt: "2026-10-14T10:00:00.000Z",
    };

    await saveCloudBackupSettings(
      { accessToken: "test-access-token" },
      input,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, request] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/migrations/backup/cloud/settings");
    expect(request?.method).toBe("PUT");
    expect(JSON.parse(String(request?.body))).toEqual({
      enabled: true,
      frequency: "DAILY",
      dayOfWeek: 1,
      dayOfMonth: 15,
      hour: 2,
      minute: 30,
      timezone: "Africa/Lagos",
      retentionCount: 7,
      destinationConnectionId: "dropbox-1",
    });
  });
});


const scheduleFixture: CloudBackupSchedule = {
  id: "schedule-1",
  businessId: "business-1",
  name: "Nightly backup",
  enabled: false,
  frequency: "DAILY",
  dayOfWeek: 1,
  dayOfMonth: 1,
  hour: 2,
  minute: 30,
  clockFormat: "12H",
  timezone: "Africa/Lagos",
  retentionCount: 30,
  destinationConnectionId: null,
  createdAt: "2026-10-15T10:00:00.000Z",
  updatedAt: "2026-10-15T10:00:00.000Z",
};

const scheduleInput: CloudBackupScheduleInput = {
  name: "Nightly backup",
  enabled: false,
  frequency: "DAILY",
  dayOfWeek: 1,
  dayOfMonth: 1,
  hour: 2,
  minute: 30,
  clockFormat: "12H",
  timezone: "Africa/Lagos",
  retentionCount: 30,
  destinationConnectionId: null,
};

describe("cloud backup schedule API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists schedules using the schedule collection endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schedules: [scheduleFixture] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      listCloudBackupSchedules({ accessToken: "access-token" }),
    ).resolves.toEqual([scheduleFixture]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/migrations/backup/cloud/schedules",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("creates a schedule with the supplied payload and sensitive authorization", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schedule: scheduleFixture }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      createCloudBackupSchedule(
        {
          accessToken: "access-token",
          sensitiveAuthorization: "sensitive-token",
        },
        scheduleInput,
      ),
    ).resolves.toEqual(scheduleFixture);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/migrations/backup/cloud/schedules",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "X-Sensitive-Authorization": "sensitive-token",
        }),
        body: JSON.stringify(scheduleInput),
      }),
    );
  });

  it("updates an encoded schedule ID using PATCH and sensitive authorization", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schedule: scheduleFixture }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const patch = { name: "Updated nightly backup", minute: 45 };

    await expect(
      updateCloudBackupSchedule(
        "schedule/1",
        {
          accessToken: "access-token",
          sensitiveAuthorization: "sensitive-token",
        },
        patch,
      ),
    ).resolves.toEqual(scheduleFixture);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/migrations/backup/cloud/schedules/schedule%2F1",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "X-Sensitive-Authorization": "sensitive-token",
        }),
        body: JSON.stringify(patch),
      }),
    );
  });

  it("deletes a schedule using DELETE and sensitive authorization", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ deleted: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      deleteCloudBackupSchedule(
        "schedule-1",
        {
          accessToken: "access-token",
          sensitiveAuthorization: "sensitive-token",
        },
      ),
    ).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/migrations/backup/cloud/schedules/schedule-1",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "X-Sensitive-Authorization": "sensitive-token",
        }),
      }),
    );
  });
});
