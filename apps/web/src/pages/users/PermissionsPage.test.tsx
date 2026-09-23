import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PermissionsPage } from "./PermissionsPage.js";
import {
  getRolePermissions,
  getUserPermissions,
  listPermissions,
  removeRolePermission,
  removeUserPermission,
  updateRolePermission,
  updateUserPermission,
} from "../../lib/permissions-api.js";
import { listUsers } from "../../lib/users-api.js";

vi.mock("../../lib/permissions-api.js", () => ({
  getRolePermissions: vi.fn(),
  getUserPermissions: vi.fn(),
  listPermissions: vi.fn(),
  removeRolePermission: vi.fn(),
  removeUserPermission: vi.fn(),
  updateRolePermission: vi.fn(),
  updateUserPermission: vi.fn(),
}));

vi.mock("../../lib/users-api.js", () => ({
  listUsers: vi.fn(),
}));

let mockUser: {
  id: string;
  fullName: string;
  email: string;
  role: "BUSINESS_OWNER" | "BRANCH_MANAGER" | "STAFF";
  permissions: string[];
} | null = {
  id: "manager-1",
  fullName: "Jane Manager",
  email: "jane@example.com",
  role: "BRANCH_MANAGER",
  permissions: ["users.manage_permissions"],
};

vi.mock("../../state/auth-store.js", () => ({
  useAuthStore: (selector: (state: {
    user: typeof mockUser;
    accessToken: string;
  }) => unknown) =>
    selector({
      user: mockUser,
      accessToken: "token",
    }),
}));

const mockedListPermissions = vi.mocked(listPermissions);
const mockedGetRolePermissions = vi.mocked(getRolePermissions);
const mockedGetUserPermissions = vi.mocked(getUserPermissions);
const mockedListUsers = vi.mocked(listUsers);
const mockedUpdateRolePermission = vi.mocked(updateRolePermission);
const mockedUpdateUserPermission = vi.mocked(updateUserPermission);
const mockedRemoveRolePermission = vi.mocked(removeRolePermission);
const mockedRemoveUserPermission = vi.mocked(removeUserPermission);

const permissions: import("../../lib/permissions-api.js").RolePermission[] = [
  {
    code: "orders.view",
    module: "orders",
    action: "view",
    description: "View orders",
    source: "default" as const,
    allowed: true,
  },
  {
    code: "orders.create",
    module: "orders",
    action: "create",
    description: "Create orders",
    source: "business_role_override" as const,
    allowed: false,
  },
];

function renderPermissions() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PermissionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  mockUser = {
    id: "manager-1",
    fullName: "Jane Manager",
    email: "jane@example.com",
    role: "BRANCH_MANAGER",
    permissions: ["users.manage_permissions"],
  };

  mockedListPermissions.mockResolvedValue(
    permissions.map(({ code, module, action, description }) => ({
      code,
      module,
      action,
      description,
    })),
  );
  mockedGetRolePermissions.mockResolvedValue(permissions);
  mockedGetUserPermissions.mockResolvedValue({
    user: {
      id: "staff-1",
      fullName: "John Staff",
      email: "john@example.com",
      role: "STAFF",
    },
    permissions,
  });
  mockedListUsers.mockResolvedValue([
    {
      id: "staff-1",
      email: "john@example.com",
      fullName: "John Staff",
      role: "STAFF",
      position: "Laundry Supervisor",
      isActive: true,
      businessId: "business-1",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      branches: [],
    },
  ]);
  const viewOrdersPermission = permissions.find(
    ({ code }) => code === "orders.view",
  )!;
  mockedUpdateRolePermission.mockResolvedValue(viewOrdersPermission);
  mockedUpdateUserPermission.mockResolvedValue(viewOrdersPermission);
  mockedRemoveRolePermission.mockResolvedValue(undefined);
  mockedRemoveUserPermission.mockResolvedValue(undefined);
});

describe("PermissionsPage", () => {
  it("blocks users who do not have users.manage_permissions", () => {
    mockUser = {
      id: "staff-1",
      fullName: "John Staff",
      email: "john@example.com",
      role: "STAFF",
      permissions: [],
    };

    renderPermissions();

    expect(
      screen.getByText(/do not have permission to manage user permissions/i),
    ).toBeInTheDocument();
    expect(mockedListPermissions).not.toHaveBeenCalled();
  });

  it("loads and displays role permissions", async () => {
    renderPermissions();

    expect(
      await screen.findByText("View orders"),
    ).toBeInTheDocument();
    expect(screen.getByText("Create orders")).toBeInTheDocument();
    expect(screen.getByText("business role override")).toBeInTheDocument();
  });

  it("updates a role permission", async () => {
    renderPermissions();

    await screen.findByText("View orders");

    fireEvent.click(
      screen.getByRole("button", { name: "Deny" }),
    );

    await waitFor(() => {
      expect(mockedUpdateRolePermission).toHaveBeenCalledWith(
        "STAFF",
        "orders.view",
        false,
        "token",
      );
    });
  });

  it("resets a role override", async () => {
    renderPermissions();

    await screen.findByText("Create orders");

    fireEvent.click(
      screen.getByRole("button", { name: "Reset" }),
    );

    await waitFor(() => {
      expect(mockedRemoveRolePermission).toHaveBeenCalledWith(
        "STAFF",
        "orders.create",
        "token",
      );
    });
  });

  it("supports individual user permissions", async () => {
    renderPermissions();

    fireEvent.click(
      screen.getByRole("button", { name: "Individual user" }),
    );

    const userSelect = await screen.findByLabelText("User");
    await screen.findByRole("option", { name: /John Staff.*Staff/ });

    fireEvent.change(userSelect, {
      target: { value: "staff-1" },
    });

    await waitFor(() => {
      expect(userSelect).toHaveValue("staff-1");
    });

    expect(await screen.findByText("View orders")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Deny" }),
    );

    await waitFor(() => {
      expect(mockedUpdateUserPermission).toHaveBeenCalledWith(
        "staff-1",
        "orders.view",
        false,
        "token",
      );
    });
  });

  it("does not offer controls to restrict a Business Owner", async () => {
    mockedListUsers.mockResolvedValue([
      {
        id: "owner-1",
        email: "owner@example.com",
        fullName: "Jane Owner",
        role: "BUSINESS_OWNER",
        position: null,
        isActive: true,
        businessId: "business-1",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        branches: [],
      },
    ]);

    mockedGetUserPermissions.mockResolvedValue({
      user: {
        id: "owner-1",
        fullName: "Jane Owner",
        email: "owner@example.com",
        role: "BUSINESS_OWNER",
      },
      permissions,
    });

    renderPermissions();

    fireEvent.click(
      screen.getByRole("button", { name: "Individual user" }),
    );

    const userSelect = await screen.findByLabelText("User");
    await screen.findByRole("option", {
      name: /Jane Owner.*Business Owner/,
    });

    fireEvent.change(userSelect, {
      target: { value: "owner-1" },
    });

    await waitFor(() => {
      expect(userSelect).toHaveValue("owner-1");
    });

    expect(
      await screen.findByText(/Business Owner access is system-wide/i),
    ).toBeInTheDocument();

    expect(
      screen.getAllByRole("button", { name: /Deny|Allow/ }).every(
        (button) => (button as HTMLButtonElement).disabled,
      ),
    ).toBe(true);

    expect(mockedUpdateUserPermission).not.toHaveBeenCalled();
  });
});
