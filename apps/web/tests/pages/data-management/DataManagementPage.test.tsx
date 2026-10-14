import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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
