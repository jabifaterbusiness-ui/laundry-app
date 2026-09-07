import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  activateUser,
  createUser,
  deactivateUser,
  listBranches,
  listUsers,
  updateUser,
  type ManagedUser,
  type UserRole,
} from "../../lib/users-api.js";
import { useAuthStore } from "../../state/auth-store.js";

const ROLES: UserRole[] = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
];


const EMPTY_FORM = {
  fullName: "",
  email: "",
  password: "",
  role: "STAFF" as UserRole,
  branchIds: [] as string[],
};

function formatRole(role: UserRole) {
  switch (role) {
    case "BUSINESS_OWNER":
      return "Business Owner";
    case "BRANCH_MANAGER":
      return "Branch Manager";
    case "STAFF":
      return "Staff";
  }
}

export function UsersPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const currentUser = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const isOwner = currentUser?.role === "BUSINESS_OWNER";
  const canView =
    currentUser?.role === "BUSINESS_OWNER" ||
    currentUser?.role === "BRANCH_MANAGER";

  const [search, setSearch] = useState("");
  const [status, setStatus] =
    useState<"active" | "inactive" | "all">("active");
  const [role, setRole] = useState<UserRole | "">("");
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users", { search, status, role }],
    enabled: canView,
    queryFn: () =>
      listUsers({
        accessToken: accessToken ?? "",
        search: search || undefined,
        status,
        role: role || undefined,
      }),
  });

  const branchesQuery = useQuery({
    queryKey: ["branches", "active"],
    enabled: isOwner,
    queryFn: () => listBranches(accessToken ?? ""),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createUser(
        {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          branchIds: form.branchIds,
        },
        accessToken ?? "",
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeForm();
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Unable to create user. Please try again.",
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateUser(
        editingUser!.id,
        {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password || undefined,
          role: form.role,
          branchIds: form.branchIds,
        },
        accessToken ?? "",
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeForm();
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Unable to update user. Please try again.",
      );
    },
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      input.isActive
        ? activateUser(input.id, accessToken ?? "")
        : deactivateUser(input.id, accessToken ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  function openCreate() {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(user: ManagedUser) {
    setEditingUser(user);
    setForm({
      fullName: user.fullName,
      email: user.email,
      password: "",
      role: user.role,
      branchIds: user.branches.map((branch) => branch.id),
    });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function toggleBranch(branchId: string) {
    setForm((current) => ({
      ...current,
      branchIds: current.branchIds.includes(branchId)
        ? current.branchIds.filter((id) => id !== branchId)
        : [...current.branchIds, branchId],
    }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!form.fullName.trim()) {
      setFormError("Full name is required.");
      return;
    }

    if (!form.email.trim()) {
      setFormError("Email is required.");
      return;
    }

    if (!editingUser && !form.password) {
      setFormError("Password is required for a new user.");
      return;
    }

    if (form.password && form.password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }

    if (editingUser) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  }

  const users = usersQuery.data ?? [];
  const branches = branchesQuery.data ?? [];
  const isSaving =
    createMutation.isPending || updateMutation.isPending;

  if (!canView) {
    return (
      <main>
        <h1>Users</h1>
        <p>You do not have permission to view business users.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Users</h1>

      <section aria-label="User filters">
        <input
          type="search"
          placeholder="Search users"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          aria-label="Filter users by status"
          value={status}
          onChange={(event) =>
            setStatus(
              event.target.value as "active" | "inactive" | "all",
            )
          }
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>

        <select
          aria-label="Filter users by role"
          value={role}
          onChange={(event) =>
            setRole(event.target.value as UserRole | "")
          }
        >
          <option value="">All roles</option>
          {ROLES.map((item) => (
            <option key={item} value={item}>
              {formatRole(item)}
            </option>
          ))}
        </select>

        {isOwner ? (
          <button type="button" onClick={openCreate}>
            New user
          </button>
        ) : null}
      </section>

      {usersQuery.isLoading && <p>Loading users...</p>}

      {usersQuery.isError && (
        <p role="alert">
          {usersQuery.error instanceof ApiError
            ? usersQuery.error.message
            : "Failed to load users. Please try again."}
        </p>
      )}

      {usersQuery.isSuccess && users.length === 0 && (
        <p>
          {search
            ? "No users match your search."
            : "No users found."}
        </p>
      )}

      {users.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Branches</th>
              <th>Status</th>
              {isOwner ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>

          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  {isOwner ? (
                    <button
                      type="button"
                      onClick={() => openEdit(user)}
                    >
                      {user.fullName}
                    </button>
                  ) : (
                    user.fullName
                  )}
                </td>

                <td>{user.email}</td>

                <td>{formatRole(user.role)}</td>

                <td>
                  {user.branches.length > 0
                    ? user.branches.map((branch) => branch.name).join(", ")
                    : "No branches assigned"}
                </td>

                <td>{user.isActive ? "Active" : "Inactive"}</td>

                {isOwner ? (
                  <td>
                    <button
                      type="button"
                      disabled={
                        user.id === currentUser?.id ||
                        statusMutation.isPending
                      }
                      onClick={() =>
                        statusMutation.mutate({
                          id: user.id,
                          isActive: !user.isActive,
                        })
                      }
                    >
                      {user.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {formOpen && isOwner ? (
        <section aria-label={editingUser ? "Edit user" : "New user"}>
          <h2>{editingUser ? "Edit User" : "New User"}</h2>

          <form onSubmit={submit}>
            <div>
              <label htmlFor="user-full-name">Full name</label>
              <input
                id="user-full-name"
                value={form.fullName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    fullName: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label htmlFor="user-email">Email</label>
              <input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label htmlFor="user-password">
                Password
                {editingUser ? " (leave blank to keep current)" : ""}
              </label>
              <input
                id="user-password"
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label htmlFor="user-role">Role</label>
              <select
                id="user-role"
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    role: event.target.value as UserRole,
                  }))
                }
              >
                {ROLES.map((item) => (
                  <option key={item} value={item}>
                    {formatRole(item)}
                  </option>
                ))}
              </select>
            </div>

            <fieldset>
              <legend>Branches</legend>

              {branchesQuery.isLoading && <p>Loading branches...</p>}

              {branches.length === 0 && branchesQuery.isSuccess && (
                <p>No active branches available.</p>
              )}

              {branches.map((branch) => (
                <label key={branch.id}>
                  <input
                    type="checkbox"
                    checked={form.branchIds.includes(branch.id)}
                    onChange={() => toggleBranch(branch.id)}
                  />
                  {branch.name}
                </label>
              ))}
            </fieldset>

            {formError ? <p role="alert">{formError}</p> : null}

            <button type="submit" disabled={isSaving}>
              {isSaving
                ? "Saving..."
                : editingUser
                  ? "Save changes"
                  : "Create user"}
            </button>

            <button type="button" onClick={closeForm}>
              Cancel
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
