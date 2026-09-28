import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BranchesPage } from "./BranchesPage.js";
import {
  assignUserToBranch,
  createBranch,
  listBranchUsers,
  listBranches,
  listUsers,
  removeUserFromBranch,
} from "../../lib/users-api.js";
import { apiFetch } from "../../lib/api-client.js";

vi.mock("../../lib/users-api.js", () => ({
  assignUserToBranch: vi.fn(),
  createBranch: vi.fn(),
  listBranchUsers: vi.fn(),
  listBranches: vi.fn(),
  listUsers: vi.fn(),
  removeUserFromBranch: vi.fn(),
}));

vi.mock("../../lib/api-client.js", () => ({
  apiFetch: vi.fn(),
}));

let mockUser = {
  id: "owner-1",
  fullName: "Owner",
  email: "owner@example.com",
  username: "owner",
  role: "Business Owner",
  securityRole: "BUSINESS_OWNER",
  businessId: "business-1",
  branches: [],
  permissions: [
    "branches.view",
    "branches.create",
    "branches.update",
    "branches.activate",
  ],
};

vi.mock("../../state/auth-store.js", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: mockUser,
      accessToken: "token",
    }),
}));

const mockedAssignUserToBranch = vi.mocked(assignUserToBranch);
const mockedCreateBranch = vi.mocked(createBranch);
const mockedListBranchUsers = vi.mocked(listBranchUsers);
const mockedListBranches = vi.mocked(listBranches);
const mockedListUsers = vi.mocked(listUsers);
const mockedRemoveUserFromBranch = vi.mocked(removeUserFromBranch);
const mockedApiFetch = vi.mocked(apiFetch);

const branches = [
  {
    id: "branch-1",
    businessId: "business-1",
    name: "Main Branch",
    address: "Gwarinpa",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("BranchesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = {
      ...mockUser,
      permissions: [
        "branches.view",
        "branches.create",
        "branches.update",
        "branches.activate",
      ],
    };
    mockedListBranches.mockResolvedValue(branches);
    mockedCreateBranch.mockResolvedValue(branches[0]!);
    mockedListBranchUsers.mockResolvedValue([]);
    mockedListUsers.mockResolvedValue([]);
    mockedAssignUserToBranch.mockResolvedValue({
      id: "user-1",
      email: "staff@example.com",
      username: "staff",
      fullName: "Staff User",
      role: "Staff",
      isActive: true,
      businessId: "business-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      branches: [],
    });
    mockedRemoveUserFromBranch.mockResolvedValue(undefined);
    mockedApiFetch.mockResolvedValue(branches);
  });

  it("lists branches and provides management actions", async () => {
    render(<BranchesPage />);

    expect(await screen.findByText("Main Branch")).toBeInTheDocument();
    expect(screen.getByText("Gwarinpa")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Deactivate" }),
    ).toBeInTheDocument();
  });

  it("creates a branch", async () => {
    render(<BranchesPage />);

    fireEvent.change(screen.getByPlaceholderText("Branch name"), {
      target: { value: "Downtown Branch" },
    });
    fireEvent.change(screen.getByPlaceholderText("Branch address"), {
      target: { value: "Central Area" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create branch" }));

    await waitFor(() => {
      expect(mockedCreateBranch).toHaveBeenCalledWith(
        {
          name: "Downtown Branch",
          address: "Central Area",
        },
        "token",
      );
    });
  });

  it("manages users assigned to a branch", async () => {
    const branchUser = {
      id: "user-1",
      email: "staff@example.com",
      username: "staff",
      fullName: "Staff User",
      role: "Staff",
      isActive: true,
      businessId: "business-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      branches: [],
    };

    mockUser = {
      ...mockUser,
      permissions: [
        "branches.view",
        "branches.manage_users",
      ],
    };

    mockedListBranchUsers.mockResolvedValue([branchUser]);
    mockedListUsers.mockResolvedValue([
      branchUser,
      {
        ...branchUser,
        id: "user-2",
        email: "other@example.com",
        username: "other",
        fullName: "Other User",
      },
    ]);

    render(<BranchesPage />);

    await screen.findByText("Main Branch");

    fireEvent.click(
      screen.getByRole("button", { name: "Manage users" }),
    );

    expect(
      await screen.findByText("Staff User"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedListBranchUsers).toHaveBeenCalledWith(
        "branch-1",
        "token",
      );
      expect(mockedListUsers).toHaveBeenCalledWith({
        accessToken: "token",
        status: "active",
      });
    });

    fireEvent.change(
      screen.getByRole("combobox", { name: "Assign user to branch" }),
      { target: { value: "user-2" } },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Assign user" }),
    );

    await waitFor(() => {
      expect(mockedAssignUserToBranch).toHaveBeenCalledWith(
        "branch-1",
        "user-2",
        "token",
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Remove" }),
    );

    await waitFor(() => {
      expect(mockedRemoveUserFromBranch).toHaveBeenCalledWith(
        "branch-1",
        "user-1",
        "token",
      );
    });
  });

  it("hides management actions when permissions are absent", async () => {
    mockUser = {
      ...mockUser,
      permissions: ["branches.view"],
    };

    render(<BranchesPage />);

    await screen.findByText("Main Branch");

    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deactivate" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create branch" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Manage users" }),
    ).not.toBeInTheDocument();
  });
});
