import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PermissionsPage } from "./PermissionsPage.js";
import {
  allowAllUserPermissions,
  disallowAllUserPermissions,
  getUserPermissions,
  listPermissions,
  removeUserPermission,
  updateUserPermission,
} from "../../lib/permissions-api.js";
import { listUsers } from "../../lib/users-api.js";

let mockUser = {
  id: "manager-1",
  fullName: "Jane Manager",
  email: "jane@example.com",
  role: "Branch Manager",
  securityRole: "BRANCH_MANAGER" as const,
  permissions: ["users.manage_permissions"],
};

vi.mock("../../lib/permissions-api.js", () => ({
  allowAllUserPermissions: vi.fn(),
  disallowAllUserPermissions: vi.fn(),
  getUserPermissions: vi.fn(),
  listPermissions: vi.fn(),
  removeUserPermission: vi.fn(),
  updateUserPermission: vi.fn(),
}));

vi.mock("../../lib/users-api.js", () => ({
  listUsers: vi.fn(),
}));

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
const mockedGetUserPermissions = vi.mocked(getUserPermissions);
const mockedListUsers = vi.mocked(listUsers);
const mockedUpdateUserPermission = vi.mocked(updateUserPermission);
const mockedRemoveUserPermission = vi.mocked(removeUserPermission);
const mockedAllowAll = vi.mocked(allowAllUserPermissions);
const mockedDisallowAll = vi.mocked(disallowAllUserPermissions);

const permissions: import("../../lib/permissions-api.js").RolePermission[] = [
  {
    code: "orders.view",
    module: "orders",
    action: "view",
    description: "View orders",
    source: "default",
    allowed: false,
  },
  {
    code: "orders.create",
    module: "orders",
    action: "create",
    description: "Create orders",
    source: "user_override",
    allowed: true,
  },
  { code: "chat.view", module: "chat", action: "view", description: "View own conversations and eligible colleagues", source: "default", allowed: false },
  { code: "chat.cross_branch", module: "chat", action: "cross_branch", description: "Discover and initiate chats with colleagues in other branches of the same business", source: "default", allowed: false },
  { code: "chat.send_message", module: "chat", action: "send_message", description: "Send messages and replies in conversations", source: "default", allowed: false },
  { code: "chat.create_direct", module: "chat", action: "create_direct", description: "Start direct conversations", source: "default", allowed: false },
  { code: "chat.create_group", module: "chat", action: "create_group", description: "Create group conversations", source: "default", allowed: false },
  { code: "chat.manage_group", module: "chat", action: "manage_group", description: "Manage groups you own or administer", source: "default", allowed: false },
  { code: "chat.manage_all_groups", module: "chat", action: "manage_all_groups", description: "Moderate any group in the business", source: "default", allowed: false },
  { code: "chat.upload_attachments", module: "chat", action: "upload_attachments", description: "Upload files to conversations", source: "default", allowed: false },
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
    role: "Branch Manager",
    securityRole: "BRANCH_MANAGER",
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

  mockedGetUserPermissions.mockResolvedValue({
    user: {
      id: "staff-1",
      fullName: "John Staff",
      email: "john@example.com",
      role: "Laundry Supervisor",
      securityRole: "STAFF",
      isActive: true,
    },
    permissions,
  });

  mockedListUsers.mockResolvedValue([
    {
      id: "staff-1",
      email: "john@example.com",
      username: null,
      fullName: "John Staff",
      role: "Laundry Supervisor",
      isActive: true,
      businessId: "business-1",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      branches: [],
    },
  ]);

  mockedUpdateUserPermission.mockResolvedValue(permissions[0]!);
  mockedRemoveUserPermission.mockResolvedValue(undefined);
  mockedAllowAll.mockResolvedValue({
    allowed: true,
    count: permissions.length,
  });
  mockedDisallowAll.mockResolvedValue({
    allowed: false,
    count: permissions.length,
  });
});

describe("PermissionsPage", () => {
  beforeEach(() => {
    vi.spyOn(window, "prompt").mockReturnValue("Test permission change reason");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks users who do not have users.manage_permissions", () => {
    mockUser = {
      ...mockUser,
      permissions: [],
    };

    renderPermissions();

    expect(
      screen.getByText(
        /do not have permission to manage user permissions/i,
      ),
    ).toBeInTheDocument();

    expect(mockedListPermissions).not.toHaveBeenCalled();
  });

  it("manages permissions for an individual user", async () => {
    renderPermissions();

    const userSelect = await screen.findByLabelText("User");
    await screen.findByRole("option", {
      name: /John Staff — Laundry Supervisor/,
    });

    fireEvent.change(userSelect, {
      target: { value: "staff-1" },
    });

    expect(
      await screen.findByText("View orders"),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/John Staff.*Laundry Supervisor/),
    ).toBeInTheDocument();

    const orderViewRow = screen.getByText("View orders").closest("tr");
    expect(orderViewRow).not.toBeNull();
    fireEvent.click(orderViewRow!.querySelector("button")!);

    await waitFor(() => {
      expect(mockedUpdateUserPermission).toHaveBeenCalledWith(
        "staff-1",
        "orders.view",
        true,
        "Test permission change reason",
        "token",
      );
    });
  });

  it("resets an individual permission override", async () => {
    renderPermissions();

    const userSelect = await screen.findByLabelText("User");
    await screen.findByRole("option", {
      name: /John Staff — Laundry Supervisor/,
    });

    fireEvent.change(userSelect, {
      target: { value: "staff-1" },
    });

    await screen.findByText("Create orders");

    fireEvent.click(
      screen.getByRole("button", { name: "Reset" }),
    );

    await waitFor(() => {
      expect(mockedRemoveUserPermission).toHaveBeenCalledWith(
        "staff-1",
        "orders.create",
        "Test permission change reason",
        "token",
      );
    });
  });

  it("shows all eight chat permissions and keeps each grant individually controllable", async () => {
    renderPermissions();

    const userSelect = await screen.findByLabelText("User");
    await screen.findByRole("option", {
      name: /John Staff — Laundry Supervisor/,
    });
    fireEvent.change(userSelect, { target: { value: "staff-1" } });

    const moduleSelect = await screen.findByLabelText("Module");
    fireEvent.change(moduleSelect, { target: { value: "chat" } });

    const chatPermissionDescriptions = [
      "View own conversations and eligible colleagues",
      "Discover and initiate chats with colleagues in other branches of the same business",
      "Send messages and replies in conversations",
      "Start direct conversations",
      "Create group conversations",
      "Manage groups you own or administer",
      "Moderate any group in the business",
      "Upload files to conversations",
    ];
    for (const description of chatPermissionDescriptions) {
      expect(await screen.findByText(description)).toBeInTheDocument();
    }

    const uploadRow = screen.getByText("Upload files to conversations").closest("tr");
    expect(uploadRow).not.toBeNull();
    fireEvent.click(uploadRow!.querySelector("button")!);

    await waitFor(() => {
      expect(mockedUpdateUserPermission).toHaveBeenCalledWith(
        "staff-1",
        "chat.upload_attachments",
        true,
        "Test permission change reason",
        "token",
      );
    });
  });

  it("supports Allow All for an individual user", async () => {
    renderPermissions();

    const userSelect = await screen.findByLabelText("User");
    await screen.findByRole("option", {
      name: /John Staff — Laundry Supervisor/,
    });

    fireEvent.change(userSelect, {
      target: { value: "staff-1" },
    });

    await screen.findByText("View orders");

    fireEvent.click(
      screen.getByRole("button", { name: "Allow All" }),
    );

    await waitFor(() => {
      expect(mockedAllowAll).toHaveBeenCalledWith(
        "staff-1",
        "Test permission change reason",
        "token",
      );
    });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "All 10 permissions were allowed successfully.",
    );
  });

  it("supports Disallow All for an individual user", async () => {
    renderPermissions();

    const userSelect = await screen.findByLabelText("User");
    await screen.findByRole("option", {
      name: /John Staff — Laundry Supervisor/,
    });

    fireEvent.change(userSelect, {
      target: { value: "staff-1" },
    });

    await screen.findByText("View orders");

    fireEvent.click(
      screen.getByRole("button", { name: "Disallow All" }),
    );

    await waitFor(() => {
      expect(mockedDisallowAll).toHaveBeenCalledWith(
        "staff-1",
        "Test permission change reason",
        "token",
      );
    });
  });

  it("does not offer controls to restrict a Business Owner", async () => {
    mockedListUsers.mockResolvedValue([
      {
        id: "owner-1",
        email: "owner@example.com",
        username: null,
        fullName: "Jane Owner",
        role: "Business Owner",
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
        role: "Business Owner",
        securityRole: "BUSINESS_OWNER",
        isActive: true,
      },
      permissions,
    });

    renderPermissions();

    const userSelect = await screen.findByLabelText("User");
    await screen.findByRole("option", {
      name: /Jane Owner — Business Owner/,
    });

    fireEvent.change(userSelect, {
      target: { value: "owner-1" },
    });

    expect(
      await screen.findByText(/Business Owner access is system-wide/i),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Allow All" }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Disallow All" }),
    ).not.toBeInTheDocument();

    expect(
      screen.getAllByRole("button", { name: /Deny|Allow/ }).every(
        (button) => (button as HTMLButtonElement).disabled,
      ),
    ).toBe(true);

    expect(mockedUpdateUserPermission).not.toHaveBeenCalled();
  });
});
