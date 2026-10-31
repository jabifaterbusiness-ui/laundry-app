import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  createCloudBackupRun,
  createCloudBackupSchedule,
  deleteCloudBackupSchedule,
  getCloudBackupSettings,
  listCloudBackupConnections,
  listCloudBackupRuns,
  listCloudBackupSchedules,
  saveCloudBackupSettings,
  updateCloudBackupSchedule,
  verifyCloudBackupConnection,
} from "../../../src/lib/data-management-api.js";
import { CLOUD_BACKUP_NOTIFICATION_EVENT } from "../../../src/lib/cloud-backup-notifications.js";

const mockUser = vi.hoisted(() => ({
  current: null as any,
}));

const mockCloudOAuth = vi.hoisted(() => ({
  accessToken: null as string | null,
  start: vi.fn(),
  requestSensitiveAuthorization: vi.fn().mockResolvedValue("test-authorization"),
}));

vi.mock("../../../src/state/auth-store.js", () => ({
  useAuthStore: (selector: (state: any) => unknown) =>
    selector({
      accessToken: mockCloudOAuth.accessToken,
      user: mockUser.current,
    }),
}));

vi.mock("../../../src/lib/data-management-api.js", () => ({
  analyzeMigration: vi.fn(),
  exportBackup: vi.fn(),
  importMigrationJob: vi.fn(),
  restoreBackup: vi.fn(),
  listCloudBackupConnections: vi.fn().mockResolvedValue([]),
  createCloudBackupConnection: vi.fn(),
  startCloudBackupOAuth: mockCloudOAuth.start,
  verifyCloudBackupConnection: vi.fn(),
  createCloudBackupRun: vi.fn(),
  listCloudBackupRuns: vi.fn().mockResolvedValue([]),
  listCloudBackupSchedules: vi.fn().mockResolvedValue([]),
  createCloudBackupSchedule: vi.fn(),
  updateCloudBackupSchedule: vi.fn(),
  deleteCloudBackupSchedule: vi.fn(),
  getCloudBackupSettings: vi.fn().mockResolvedValue(null),
  saveCloudBackupSettings: vi.fn(),
}));

vi.mock("../../../src/components/auth/SensitiveAuthorizationProvider.js", () => ({
  useSensitiveAuthorization: () => ({
    requestSensitiveAuthorization: mockCloudOAuth.requestSensitiveAuthorization,
  }),
}));

import { DataManagementPage } from "../../../src/pages/DataManagementPage.js";

function businessUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "owner-1",
    email: "owner@example.com",
    username: "owner",
    fullName: "Business Owner",
    role: "Manager",
    securityRole: "BUSINESS_OWNER",
    businessId: "business-1",
    branches: [],
    permissions: ["migrations.view", "migrations.manage"],
    ...overrides,
  };
}

describe("DataManagementPage authorization", () => {
  beforeEach(() => {
    mockUser.current = null;
    mockCloudOAuth.accessToken = null;
    window.localStorage.clear();
    Reflect.deleteProperty(window, "showDirectoryPicker");
    mockCloudOAuth.start.mockReset();
    mockCloudOAuth.requestSensitiveAuthorization.mockReset();
    mockCloudOAuth.requestSensitiveAuthorization.mockResolvedValue("test-authorization");
    vi.mocked(listCloudBackupConnections).mockReset().mockResolvedValue([]);
    vi.mocked(listCloudBackupRuns).mockReset().mockResolvedValue([]);
    vi.mocked(listCloudBackupSchedules).mockReset().mockResolvedValue([]);
    vi.mocked(createCloudBackupSchedule).mockReset();
    vi.mocked(updateCloudBackupSchedule).mockReset();
    vi.mocked(deleteCloudBackupSchedule).mockReset();
    vi.mocked(verifyCloudBackupConnection).mockReset();
    vi.mocked(saveCloudBackupSettings).mockClear();
  });

  it("shows the three cloud providers once and groups repeated accounts", async () => {
    mockUser.current = businessUser();
    mockCloudOAuth.accessToken = "test-access-token";
    const connection = {
      provider: "DROPBOX" as const,
      displayName: "LaundryAngel backups",
      config: null,
      status: "CONNECTED" as const,
      verifiedAt: "2026-10-14T10:00:00.000Z",
      lastError: null,
      createdAt: "2026-10-14T10:00:00.000Z",
      updatedAt: "2026-10-14T10:00:00.000Z",
    };
    vi.mocked(listCloudBackupConnections).mockResolvedValue([
      { ...connection, id: "dropbox-1" },
      { ...connection, id: "dropbox-2", displayName: "LaundryAngel backups (2)" },
    ] as any);

    render(<MemoryRouter><DataManagementPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Google Drive" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Dropbox" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "OneDrive" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /2 saved accounts.*view details/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Verify" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /2 saved accounts.*view details/i }));
    expect(screen.getAllByRole("button", { name: "Verify" })).toHaveLength(2);
  });

  it("offers only connected and verified cloud accounts as instant destinations", async () => {
    mockUser.current = businessUser();
    mockCloudOAuth.accessToken = "test-access-token";
    const base = {
      displayName: "LaundryAngel backups",
      config: null,
      lastError: null,
      createdAt: "2026-10-14T10:00:00.000Z",
      updatedAt: "2026-10-14T10:00:00.000Z",
    };
    vi.mocked(listCloudBackupConnections).mockResolvedValue([
      { ...base, id: "google-1", provider: "GOOGLE_DRIVE", status: "CONNECTED", verifiedAt: "2026-10-14T10:00:00.000Z" },
      { ...base, id: "dropbox-1", provider: "DROPBOX", status: "CONNECTED", verifiedAt: "2026-10-14T10:00:00.000Z" },
      { ...base, id: "onedrive-1", provider: "ONEDRIVE", status: "CONNECTED", verifiedAt: null },
    ] as any);

    render(<MemoryRouter><DataManagementPage /></MemoryRouter>);

    const destination = await screen.findByRole("combobox", { name: /Save backup to/i });
    await waitFor(() => {
      expect(destination).toHaveValue("google-1");
      expect(screen.getByRole("option", { name: /google drive/i })).toBeTruthy();
      expect(screen.getByRole("option", { name: /dropbox/i })).toBeTruthy();
      expect(screen.queryByRole("option", { name: /onedrive/i })).toBeNull();
    });
    expect(screen.getByText(/Only connected and verified accounts appear in this list/i)).toBeTruthy();
  });

  it("keeps local backup schedules separate from the cloud schedule manager", async () => {
    Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: vi.fn() });
    mockUser.current = businessUser();
    mockCloudOAuth.accessToken = "test-access-token";

    render(<MemoryRouter><DataManagementPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Instant Local Backup" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add local schedule/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Schedule name" }), {
      target: { value: "Daily office backup" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save local schedule" }));

    expect(await screen.findByText("Daily office backup")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Local backup schedules/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recent local backup activity" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Backup schedules/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Schedule name" }), {
      target: { value: "Daily office backup updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Daily office backup updated")).toBeTruthy();
  });

  it("opens the independent backup schedule editor", async () => {
    mockUser.current = businessUser();
    mockCloudOAuth.accessToken = "test-access-token";

    render(<MemoryRouter><DataManagementPage /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: /Add schedule/ }));

    expect(await screen.findByRole("textbox", { name: "Schedule name" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Frequency" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create schedule" })).toBeTruthy();
  });

  it("saves a 12-hour schedule with the correct 24-hour value", async () => {
    mockUser.current = businessUser();
    mockCloudOAuth.accessToken = "test-access-token";
    vi.mocked(createCloudBackupSchedule).mockResolvedValue({
      id: "schedule-2",
      businessId: "business-1",
      name: "Afternoon backup",
      enabled: false,
      frequency: "DAILY",
      dayOfWeek: 1,
      dayOfMonth: 1,
      hour: 14,
      minute: 0,
      clockFormat: "12H",
      timezone: "Africa/Lagos",
      retentionCount: 30,
      destinationConnectionId: null,
      createdAt: "2026-10-31T00:00:00.000Z",
      updatedAt: "2026-10-31T00:00:00.000Z",
    } as any);

    render(<MemoryRouter><DataManagementPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Add schedule/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Schedule name" }), {
      target: { value: "Afternoon backup" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Hour" }), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "AM/PM" }), {
      target: { value: "PM" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create schedule" }));

    await waitFor(() => {
      expect(createCloudBackupSchedule).toHaveBeenCalledWith(
        {
          accessToken: "test-access-token",
          sensitiveAuthorization: "test-authorization",
        },
        expect.objectContaining({
          hour: 14,
          minute: 0,
          clockFormat: "12H",
          timezone: "Africa/Lagos",
        }),
      );
    });
  });

  it("preserves unsaved schedule edits when background polling returns stale data", async () => {
    mockUser.current = businessUser();
    mockCloudOAuth.accessToken = "test-access-token";

    vi.mocked(listCloudBackupRuns).mockReset().mockResolvedValue([]);
    vi.mocked(listCloudBackupSchedules).mockReset().mockResolvedValue([]);
    vi.useFakeTimers();

    try {
      render(<MemoryRouter><DataManagementPage /></MemoryRouter>);

      fireEvent.click(screen.getByRole("button", { name: /Add schedule/ }));

      const frequency = screen.getByRole("combobox", { name: "Frequency" });
      fireEvent.change(frequency, { target: { value: "WEEKLY" } });

      expect(frequency).toHaveValue("WEEKLY");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });

      expect(frequency).toHaveValue("WEEKLY");
      expect(screen.getByRole("combobox", { name: "Day of week" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("publishes a persistent notification when a manual backup starts", async () => {
    mockUser.current = businessUser();
    mockCloudOAuth.accessToken = "test-access-token";

    const connection = {
      id: "dropbox-1",
      provider: "DROPBOX" as const,
      displayName: "Dropbox backups",
      config: null,
      status: "CONNECTED" as const,
      verifiedAt: "2026-10-14T10:00:00.000Z",
      lastError: null,
      createdAt: "2026-10-14T10:00:00.000Z",
      updatedAt: "2026-10-14T10:00:00.000Z",
    };

    const run = {
      id: "run-manual-1",
      connectionId: connection.id,
      trigger: "MANUAL",
      status: "RUNNING",
      storageKey: null,
      checksumSha256: null,
      sizeBytes: null,
      startedAt: "2026-10-15T10:00:00.000Z",
      scheduledFor: null,
      completedAt: null,
      errorMessage: null,
      createdAt: "2026-10-15T10:00:00.000Z",
    };

    vi.mocked(listCloudBackupConnections).mockResolvedValue([connection]);
    vi.mocked(listCloudBackupRuns).mockResolvedValue([]);
    vi.mocked(createCloudBackupRun).mockResolvedValue(run as any);

    const notifications: CustomEvent[] = [];
    const listener = (event: Event) => notifications.push(event as CustomEvent);
    window.addEventListener(CLOUD_BACKUP_NOTIFICATION_EVENT, listener);

    render(<MemoryRouter><DataManagementPage /></MemoryRouter>);
    const instantBackupButton = await screen.findByRole("button", { name: /Run instant backup/i });
    await waitFor(() => expect(instantBackupButton).toBeEnabled());
    fireEvent.click(instantBackupButton);

    await waitFor(() => {
      expect(notifications.some((event) =>
        event.detail?.source === "manual" &&
        event.detail?.status === "progress" &&
        event.detail?.runId === run.id
      )).toBe(true);
    });

    expect(createCloudBackupRun).toHaveBeenCalledWith(
      connection.id,
      {
        accessToken: "test-access-token",
        sensitiveAuthorization: "test-authorization",
      },
    );

    window.removeEventListener(CLOUD_BACKUP_NOTIFICATION_EVENT, listener);
  });

  it("shows an error if sensitive authorization rejects during destination verification", async () => {
    mockUser.current = businessUser();
    mockCloudOAuth.accessToken = "test-access-token";
    vi.mocked(listCloudBackupConnections).mockResolvedValue([{
      id: "dropbox-1",
      provider: "DROPBOX",
      displayName: "Dropbox backups",
      config: null,
      status: "PENDING",
      verifiedAt: null,
      lastError: null,
      createdAt: "2026-10-14T10:00:00.000Z",
      updatedAt: "2026-10-14T10:00:00.000Z",
    }]);
    mockCloudOAuth.requestSensitiveAuthorization.mockRejectedValue(
      new Error("Authorization service unavailable."),
    );

    render(<MemoryRouter><DataManagementPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /saved account.*view details/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Verify" }));

    expect(await screen.findByText("Authorization service unavailable.")).toBeTruthy();
    expect(vi.mocked(verifyCloudBackupConnection)).not.toHaveBeenCalled();
  });

  it("does not create a schedule if sensitive authorization rejects", async () => {
    mockUser.current = businessUser();
    mockCloudOAuth.accessToken = "test-access-token";
    mockCloudOAuth.requestSensitiveAuthorization.mockRejectedValue(
      new Error("Authorization service unavailable."),
    );

    render(<MemoryRouter><DataManagementPage /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: /Add schedule/ }));
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Schedule name" }),
      { target: { value: "Nightly backup" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create schedule" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Authorization service unavailable.",
    );
    expect(createCloudBackupSchedule).not.toHaveBeenCalled();
  });

  it("refreshes destination status after verification fails", async () => {
    mockUser.current = businessUser();
    mockCloudOAuth.accessToken = "test-access-token";
    const pendingConnection = {
      id: "dropbox-1",
      provider: "DROPBOX" as const,
      displayName: "Dropbox backups",
      config: null,
      status: "PENDING" as const,
      verifiedAt: null,
      lastError: null,
      createdAt: "2026-10-14T10:00:00.000Z",
      updatedAt: "2026-10-14T10:00:00.000Z",
    };
    const failedConnection = {
      ...pendingConnection,
      status: "ERROR" as const,
      lastError: "Provider verification failed.",
    };
    let connectionReads = 0;
    vi.mocked(listCloudBackupConnections).mockImplementation(async () => {
      connectionReads += 1;
      return [connectionReads === 1 ? pendingConnection : failedConnection];
    });
    vi.mocked(verifyCloudBackupConnection).mockRejectedValue(
      new Error("Cloud destination verification failed. Check the destination settings and authorization."),
    );

    render(<MemoryRouter><DataManagementPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /saved account.*view details/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Verify" }));

    expect(
      await screen.findByText("Cloud destination verification failed. Check the destination settings and authorization."),
    ).toBeTruthy();
    expect(await screen.findByText("ERROR")).toBeTruthy();
    expect(await screen.findByText("Provider verification failed.")).toBeTruthy();
    expect(vi.mocked(verifyCloudBackupConnection)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listCloudBackupConnections)).toHaveBeenCalledTimes(2);
  });

  it("allows a Business Owner with a custom visible job title", () => {
    mockUser.current = businessUser({ role: "Manager" });

    render(<MemoryRouter><DataManagementPage /></MemoryRouter>);

    expect(
      screen.getByRole("heading", { name: /backup & data migration/i }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: /instant local backup/i }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: /restore encrypted backup/i }),
    ).toBeInTheDocument();
  });

  it("does not treat a custom visible job title as a security role", () => {
    mockUser.current = businessUser({
      role: "Accountant",
      securityRole: "STAFF",
      permissions: ["migrations.view", "migrations.manage"],
    });

    render(<MemoryRouter><DataManagementPage /></MemoryRouter>);

    expect(
      screen.getByText(/you do not have permission to manage business data migration/i),
    ).toBeInTheDocument();
  });

  it("requires sensitive authorization and rejects an unexpected OAuth redirect host", async () => {
    mockUser.current = businessUser();
    mockCloudOAuth.accessToken = "test-access-token";
    mockCloudOAuth.start.mockResolvedValue({
      authorizationUrl: "https://untrusted.example/authorize",
    });

    render(<MemoryRouter><DataManagementPage /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: "Connect Google Drive" }));

    await waitFor(() => {
      expect(mockCloudOAuth.start).toHaveBeenCalledWith(
        {
          accessToken: "test-access-token",
          sensitiveAuthorization: "test-authorization",
        },
        {
          provider: "GOOGLE_DRIVE",
          displayName: "LaundryAngel backups",
        },
      );
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The server returned an unexpected OAuth authorization URL.",
      );
    });

    expect(mockCloudOAuth.requestSensitiveAuthorization).toHaveBeenCalledTimes(1);
  });

  it("shows a successful OAuth callback message and refreshes cloud data", async () => {
    mockUser.current = businessUser();
    mockCloudOAuth.accessToken = "test-access-token";

    render(
      <MemoryRouter initialEntries={["/data-management?cloudBackupOAuth=connected"]}>
        <DataManagementPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent(/cloud account connected/i);
  });

  it("allows a Branch Manager to manage migration but not backup restore", () => {
    mockUser.current = businessUser({
      role: "Laundry Supervisor",
      securityRole: "BRANCH_MANAGER",
      permissions: ["migrations.view"],
    });

    render(<MemoryRouter><DataManagementPage /></MemoryRouter>);

    expect(
      screen.getByRole("heading", { name: /backup & data migration/i }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", { name: /restore encrypted backup/i }),
    ).not.toBeInTheDocument();
  });
});
