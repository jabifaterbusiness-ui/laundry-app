import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUser = vi.hoisted(() => ({
  current: null as any,
}));

vi.mock("../../../src/state/auth-store.js", () => ({
  useAuthStore: (selector: (state: any) => unknown) =>
    selector({
      accessToken: null,
      user: mockUser.current,
    }),
}));

vi.mock("../../../src/lib/data-management-api.js", () => ({
  analyzeMigration: vi.fn(),
  exportBackup: vi.fn(),
  importMigrationJob: vi.fn(),
  restoreBackup: vi.fn(),
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
  });

  it("allows a Business Owner with a custom visible job title", () => {
    mockUser.current = businessUser({ role: "Manager" });

    render(<DataManagementPage />);

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

    render(<DataManagementPage />);

    expect(
      screen.getByText(/you do not have permission to manage business data migration/i),
    ).toBeInTheDocument();
  });

  it("allows a Branch Manager to manage migration but not backup restore", () => {
    mockUser.current = businessUser({
      role: "Laundry Supervisor",
      securityRole: "BRANCH_MANAGER",
      permissions: ["migrations.view"],
    });

    render(<DataManagementPage />);

    expect(
      screen.getByRole("heading", { name: /backup & data migration/i }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", { name: /restore encrypted backup/i }),
    ).not.toBeInTheDocument();
  });
});
