import { afterEach, describe, expect, it, vi } from "vitest";
import { saveCloudBackupSettings } from "../../src/lib/data-management-api.js";

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
