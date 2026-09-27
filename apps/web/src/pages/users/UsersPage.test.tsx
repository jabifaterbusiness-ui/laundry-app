import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { UsersPage } from "./UsersPage.js";
import {
  activateUser,
  createUser,
  deactivateUser,
  deleteUser,
  listBranches,
  listUsers,
  updateUser,
} from "../../lib/users-api.js";

vi.mock("../../lib/users-api.js", () => ({
  activateUser: vi.fn(),
  createUser: vi.fn(),
  deactivateUser: vi.fn(),
  deleteUser: vi.fn(),
  listBranches: vi.fn(),
  listUsers: vi.fn(),
  updateUser: vi.fn(),
}));

let mockUser = {
  id: "manager-1",
  fullName: "Jane Manager",
  email: "jane@example.com",
  username: "jane.manager",
  role: "Branch Manager",
  securityRole: "BRANCH_MANAGER",
  businessId: "business-1",
  branches: [],
  permissions: [
    "users.view",
    "users.create",
    "users.update",
    "users.delete",
  ],
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

const mockedListUsers = vi.mocked(listUsers);
const mockedListBranches = vi.mocked(listBranches);
const mockedCreateUser = vi.mocked(createUser);
const mockedUpdateUser = vi.mocked(updateUser);
const mockedActivateUser = vi.mocked(activateUser);
const mockedDeactivateUser = vi.mocked(deactivateUser);
const mockedDeleteUser = vi.mocked(deleteUser);

const users: import("../../lib/users-api.js").ManagedUser[] = [
  {
    id: "staff-1",
    email: "john@example.com",
    username: "john.staff",
    fullName: "John Staff",
    role: "Laundry Supervisor",
    isActive: true,
    businessId: "business-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    branches: [],
  },
  {
    id: "staff-2",
    email: "inactive@example.com",
    username: null,
    fullName: "Inactive Staff",
    role: "Cashier",
    isActive: false,
    businessId: "business-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    branches: [],
  },
];

function renderUsers() {
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
        <UsersPage />
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
    username: "jane.manager",
    role: "Branch Manager",
    securityRole: "BRANCH_MANAGER",
    businessId: "business-1",
    branches: [],
    permissions: [
      "users.view",
      "users.create",
      "users.update",
      "users.delete",
    ],
  };

  mockedListUsers.mockResolvedValue(users);
  mockedListBranches.mockResolvedValue([]);
  mockedCreateUser.mockResolvedValue(users.find(({ id }) => id === "staff-1")!);
  mockedUpdateUser.mockResolvedValue(users.find(({ id }) => id === "staff-1")!);
  mockedActivateUser.mockResolvedValue(users.find(({ id }) => id === "staff-2")!);
  mockedDeactivateUser.mockResolvedValue(users.find(({ id }) => id === "staff-1")!);
  mockedDeleteUser.mockResolvedValue(users.find(({ id }) => id === "staff-1")!);
});

describe("UsersPage", () => {
  it("renders custom user roles", async () => {
    renderUsers();

    expect(
      await screen.findByText("Laundry Supervisor"),
    ).toBeInTheDocument();
    expect(screen.getByText("Cashier")).toBeInTheDocument();
  });

  it("shows managed usernames when present", async () => {
    renderUsers();

    const johnRow = await screen.findByRole("row", {
      name: /John Staff john@example.com john\.staff Laundry Supervisor/i,
    });

    expect(within(johnRow).getByText("john.staff")).toBeInTheDocument();
  });

  it("includes the custom role when creating a user", async () => {
    renderUsers();

    await screen.findByText("Laundry Supervisor");

    fireEvent.click(screen.getByRole("button", { name: "New user" }));

    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "Operations Supervisor" },
    });

    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "New Staff" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "new.staff" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Password123!" },
    });


    fireEvent.click(
      screen.getByRole("button", { name: /create user/i }),
    );

    await waitFor(() => {
      expect(mockedCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          username: "new.staff",
          role: "Operations Supervisor",
        }),
        "token",
      );
    });
  });

  it("shows the delete action only with users.delete permission", async () => {
    const firstRender = renderUsers();

    await screen.findByText("Laundry Supervisor");

    expect(
      screen.getAllByRole("button", { name: "Delete" }).length,
    ).toBeGreaterThan(0);

    firstRender.unmount();

    mockUser = {
      ...mockUser,
      permissions: ["users.view", "users.update"],
    };

    renderUsers();

    const johnRow = await screen.findByRole("row", {
      name: /John Staff john@example.com john\.staff Laundry Supervisor/,
    });

    expect(
      within(johnRow).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer the current user a delete action", async () => {
    const johnStaff = users.find(({ id }) => id === "staff-1")!;
    mockedListUsers.mockResolvedValue([
      {
        ...johnStaff,
        id: "manager-1",
        fullName: "Jane Manager",
      },
    ]);

    renderUsers();

    await screen.findByText("Jane Manager");

    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("deletes a managed user after confirmation", async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(true);
    const promptSpy = vi
      .spyOn(window, "prompt")
      .mockReturnValue("routine test deletion");

    renderUsers();

    await screen.findByText("John Staff");

    const johnRow = screen.getByRole("row", {
      name: /John Staff john@example.com john\.staff Laundry Supervisor/i,
    });

    fireEvent.click(
      within(johnRow).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(promptSpy).toHaveBeenCalled();
      expect(mockedDeleteUser).toHaveBeenCalledWith(
        "staff-1",
        "routine test deletion",
        "token",
      );
    });

    confirmSpy.mockRestore();
    promptSpy.mockRestore();
  });

  it("supports activation and deactivation controls", async () => {
    const promptSpy = vi
      .spyOn(window, "prompt")
      .mockReturnValue("routine test deactivation");

    renderUsers();

    await screen.findByText("John Staff");

    fireEvent.click(
      screen.getByRole("button", { name: "Deactivate" }),
    );

    await waitFor(() => {
      expect(promptSpy).toHaveBeenCalled();
      expect(mockedDeactivateUser).toHaveBeenCalledWith(
        "staff-1",
        "routine test deactivation",
        "token",
      );
    });

    promptSpy.mockRestore();
  });
});
