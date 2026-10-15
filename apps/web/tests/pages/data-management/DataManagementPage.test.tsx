import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  listCloudBackupConnections,
  verifyCloudBackupConnection,
} from "../../../src/lib/data-management-api.js";

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
    mockCloudOAuth.start.mockReset();
    mockCloudOAuth.requestSensitiveAuthorization.mockReset();
    mockCloudOAuth.requestSensitiveAuthorization.mockResolvedValue("test-authorization");
    vi.mocked(listCloudBackupConnections).mockReset().mockResolvedValue([]);
    vi.mocked(verifyCloudBackupConnection).mockReset();
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
    fireEvent.click(await screen.findByRole("button", { name: "Verify destination" }));

    expect(await screen.findByText("Authorization service unavailable.")).toBeTruthy();
    expect(vi.mocked(verifyCloudBackupConnection)).not.toHaveBeenCalled();
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
    fireEvent.click(await screen.findByRole("button", { name: "Verify destination" }));

    expect(
      await screen.findByText("Cloud destination verification failed. Check the destination settings and authorization."),
    ).toBeTruthy();
    expect(await screen.findByText("DROPBOX · ERROR")).toBeTruthy();
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
      screen.getByRole("heading", { name: /export encrypted backup/i }),
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
