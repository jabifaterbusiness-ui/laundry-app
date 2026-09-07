import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsersPage } from "../../../src/pages/users/UsersPage.js";

const mockAuthState = {
  accessToken: "test-token",
  user: {
    id: "current-user",
    email: "owner@example.com",
    fullName: "Business Owner",
    role: "BUSINESS_OWNER" as const,
    businessId: "business-1",
    branches: [],
  },
};

vi.mock("../../../src/state/auth-store.js", () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) =>
    selector(mockAuthState),
}));

const listUsersMock = vi.fn();
const listBranchesMock = vi.fn();
const createUserMock = vi.fn();
const updateUserMock = vi.fn();
const activateUserMock = vi.fn();
const deactivateUserMock = vi.fn();

vi.mock("../../../src/lib/users-api.js", () => ({
  listUsers: (...args: unknown[]) => listUsersMock(...args),
  listBranches: (...args: unknown[]) => listBranchesMock(...args),
  createUser: (...args: unknown[]) => createUserMock(...args),
  updateUser: (...args: unknown[]) => updateUserMock(...args),
  activateUser: (...args: unknown[]) => activateUserMock(...args),
  deactivateUser: (...args: unknown[]) => deactivateUserMock(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const users = [
  {
    id: "user-1",
    email: "manager@example.com",
    fullName: "Branch Manager",
    role: "BRANCH_MANAGER" as const,
    isActive: true,
    businessId: "business-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    branches: [
      {
        id: "branch-1",
        name: "Main Branch",
        isActive: true,
      },
    ],
  },
  {
    id: "user-2",
    email: "staff@example.com",
    fullName: "Inactive Staff",
    role: "STAFF" as const,
    isActive: false,
    businessId: "business-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    branches: [],
  },
];

describe("UsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user.role = "BUSINESS_OWNER";

    listUsersMock.mockResolvedValue(users);
    listBranchesMock.mockResolvedValue([
      {
        id: "branch-1",
        businessId: "business-1",
        name: "Main Branch",
        address: null,
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "branch-2",
        businessId: "business-1",
        name: "Second Branch",
        address: null,
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    createUserMock.mockResolvedValue(users[1]);
    updateUserMock.mockResolvedValue(users[0]);
    activateUserMock.mockResolvedValue(users[1]);
    deactivateUserMock.mockResolvedValue(users[0]);
  });

  it("loads and displays users", async () => {
    renderPage();

    expect(await screen.findByText("manager@example.com")).toBeInTheDocument();
    expect(screen.getByText("manager@example.com")).toBeInTheDocument();
    expect(screen.getByText("Branch Manager", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("Main Branch")).toBeInTheDocument();
    expect(screen.getByText("Inactive Staff")).toBeInTheDocument();
  });

  it("filters users by search, status, and role", async () => {
    renderPage();

    await screen.findByText("manager@example.com");

    const search = screen.getByPlaceholderText("Search users");
    fireEvent.change(search, { target: { value: "manager" } });

    const status = screen.getByLabelText("Filter users by status");
    fireEvent.change(status, { target: { value: "inactive" } });

    const role = screen.getByLabelText("Filter users by role");
    fireEvent.change(role, { target: { value: "STAFF" } });

    await waitFor(() => {
      expect(listUsersMock).toHaveBeenLastCalledWith({
        accessToken: "test-token",
        search: "manager",
        status: "inactive",
        role: "STAFF",
      });
    });
  });

  it("opens and validates the create-user form", async () => {
    renderPage();

    await screen.findByText("manager@example.com");

    fireEvent.click(screen.getByRole("button", { name: "New user" }));

    expect(screen.getByRole("heading", { name: "New User" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create user" }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Full name is required.");

    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("creates a user with selected branches", async () => {
    renderPage();

    await screen.findByText("manager@example.com");

    fireEvent.click(screen.getByRole("button", { name: "New user" }));

    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "New Staff" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "newstaff@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Password/), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByLabelText("Main Branch"));
    fireEvent.click(screen.getByLabelText("Second Branch"));

    fireEvent.click(screen.getByRole("button", { name: "Create user" }));

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledWith(
        {
          fullName: "New Staff",
          email: "newstaff@example.com",
          password: "password123",
          role: "STAFF",
          branchIds: ["branch-1", "branch-2"],
        },
        "test-token",
      );
    });
  });

  it("opens an existing user for editing", async () => {
    renderPage();

    await screen.findByText("manager@example.com");

    fireEvent.click(
      screen.getByRole("button", { name: "Branch Manager" }),
    );

    expect(screen.getByRole("heading", { name: "Edit User" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("manager@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toHaveValue("BRANCH_MANAGER");
    expect(screen.getByLabelText("Main Branch")).toBeChecked();
  });

  it("activates and deactivates users", async () => {
    renderPage();

    await screen.findByText("manager@example.com");

    const actionButtons = screen.getAllByRole("button", {
      name: /Activate|Deactivate/,
    });

    expect(actionButtons.length).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => {
      expect(deactivateUserMock).toHaveBeenCalledWith(
        "user-1",
        "test-token",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => {
      expect(activateUserMock).toHaveBeenCalledWith(
        "user-2",
        "test-token",
      );
    });
  });

  it("does not allow the current owner to deactivate themselves", async () => {
    listUsersMock.mockResolvedValue([
      {
        ...users[0],
        id: "current-user",
        fullName: "Business Owner",
        role: "BUSINESS_OWNER" as const,
        branches: [],
      },
    ]);

    renderPage();

    await screen.findByRole("button", { name: "Business Owner" });

    expect(
      screen.getByRole("button", { name: "Deactivate" }),
    ).toBeDisabled();
  });

  it("shows users to a branch manager without management actions", async () => {
    mockAuthState.user.role = "BRANCH_MANAGER";

    renderPage();

    await screen.findByText("manager@example.com");

    expect(screen.getByText("manager@example.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "New user" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deactivate" }),
    ).not.toBeInTheDocument();
  });
});
