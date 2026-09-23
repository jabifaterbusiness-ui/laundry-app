import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  getRolePermissions,
  getUserPermissions,
  listPermissions,
  removeRolePermission,
  removeUserPermission,
  updateRolePermission,
  updateUserPermission,
  type RolePermission,
} from "../../lib/permissions-api.js";
import { listUsers, type UserRole } from "../../lib/users-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";

const MANAGED_ROLES: Array<"BRANCH_MANAGER" | "STAFF"> = [
  "BRANCH_MANAGER",
  "STAFF",
];

function formatRole(role: UserRole) {
  return role === "BRANCH_MANAGER"
    ? "Branch Manager"
    : role === "BUSINESS_OWNER"
      ? "Business Owner"
      : "Staff";
}

export function PermissionsPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const currentUser = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const canManage = hasPermission(
    currentUser,
    "users.manage_permissions",
  );

  const [mode, setMode] = useState<"role" | "user">("role");
  const [selectedRole, setSelectedRole] =
    useState<"BRANCH_MANAGER" | "STAFF">("STAFF");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const permissionsQuery = useQuery({
    queryKey: ["permissions", "catalog"],
    enabled: canManage,
    queryFn: () => listPermissions(accessToken ?? ""),
  });

  const roleQuery = useQuery({
    queryKey: ["permissions", "role", selectedRole],
    enabled: canManage && mode === "role",
    queryFn: () =>
      getRolePermissions(selectedRole, accessToken ?? ""),
  });

  const usersQuery = useQuery({
    queryKey: ["users", "permissions"],
    enabled: canManage && mode === "user",
    queryFn: () =>
      listUsers({
        accessToken: accessToken ?? "",
        status: "active",
      }),
  });

  const userQuery = useQuery({
    queryKey: ["permissions", "user", selectedUserId],
    enabled: canManage && mode === "user" && Boolean(selectedUserId),
    queryFn: () =>
      getUserPermissions(selectedUserId, accessToken ?? ""),
  });

  const permissions = useMemo<RolePermission[]>(() => {
    if (mode === "role") return roleQuery.data ?? [];
    return userQuery.data?.permissions ?? [];
  }, [mode, roleQuery.data, userQuery.data]);

  const modules = useMemo(
    () => [...new Set(permissions.map((permission) => permission.module))],
    [permissions],
  );

  const filteredPermissions = permissions.filter((permission) =>
    moduleFilter ? permission.module === moduleFilter : true,
  );

  const updateMutation = useMutation({
    mutationFn: async (input: {
      permission: RolePermission;
      allowed: boolean;
    }) => {
      if (mode === "role") {
        return updateRolePermission(
          selectedRole,
          input.permission.code,
          input.allowed,
          accessToken ?? "",
        );
      }

      return updateUserPermission(
        selectedUserId,
        input.permission.code,
        input.allowed,
        accessToken ?? "",
      );
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : "Unable to update permission.",
      );
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (permission: RolePermission) => {
      if (mode === "role") {
        return removeRolePermission(
          selectedRole,
          permission.code,
          accessToken ?? "",
        );
      }

      return removeUserPermission(
        selectedUserId,
        permission.code,
        accessToken ?? "",
      );
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : "Unable to reset permission.",
      );
    },
  });

  if (!canManage) {
    return (
      <main>
        <h1>Permissions</h1>
        <p>You do not have permission to manage user permissions.</p>
      </main>
    );
  }

  const businessOwnerSelected =
    mode === "user" && userQuery.data?.user.role === "BUSINESS_OWNER";

  return (
    <main>
      <header>
        <h1>Permissions</h1>
        <p>
          Management controls access by role and by individual user.
          Effective permissions are enforced by the server.
        </p>
      </header>

      <section aria-label="Permission target">
        <button
          type="button"
          onClick={() => setMode("role")}
          aria-pressed={mode === "role"}
        >
          Role permissions
        </button>
        <button
          type="button"
          onClick={() => setMode("user")}
          aria-pressed={mode === "user"}
        >
          Individual user
        </button>

        {mode === "role" ? (
          <label>
            Role
            <select
              value={selectedRole}
              onChange={(event) =>
                setSelectedRole(
                  event.target.value as "BRANCH_MANAGER" | "STAFF",
                )
              }
            >
              {MANAGED_ROLES.map((role) => (
                <option key={role} value={role}>
                  {formatRole(role)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            User
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
            >
              <option value="">Select a user</option>
              {(usersQuery.data ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName} — {formatRole(user.role)}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {businessOwnerSelected ? (
        <p>
          Business Owner access is system-wide and cannot be restricted
          through a business-level permission override.
        </p>
      ) : null}

      <section aria-label="Permission filters">
        <label>
          Module
          <select
            value={moduleFilter}
            onChange={(event) => setModuleFilter(event.target.value)}
          >
            <option value="">All modules</option>
            {modules.map((module) => (
              <option key={module} value={module}>
                {module}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error ? <p role="alert">{error}</p> : null}

      {(permissionsQuery.isLoading ||
        roleQuery.isLoading ||
        usersQuery.isLoading ||
        userQuery.isLoading) && <p>Loading permissions...</p>}

      {mode === "user" && !selectedUserId ? (
        <p>Select a user to manage individual permissions.</p>
      ) : null}

      {filteredPermissions.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Module</th>
              <th>Action</th>
              <th>Description</th>
              <th>Source</th>
              <th>Allowed</th>
              <th>Control</th>
            </tr>
          </thead>
          <tbody>
            {filteredPermissions.map((permission) => {
              const locked =
                businessOwnerSelected ||
                updateMutation.isPending ||
                resetMutation.isPending;

              return (
                <tr key={permission.code}>
                  <td>{permission.module}</td>
                  <td>{permission.action}</td>
                  <td>{permission.description}</td>
                  <td>{permission.source.replaceAll("_", " ")}</td>
                  <td>{permission.allowed ? "Yes" : "No"}</td>
                  <td>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() =>
                        updateMutation.mutate({
                          permission,
                          allowed: !permission.allowed,
                        })
                      }
                    >
                      {permission.allowed ? "Deny" : "Allow"}
                    </button>
                    {permission.source !== "default" && !businessOwnerSelected ? (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => resetMutation.mutate(permission)}
                      >
                        Reset
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p>No permission records to display.</p>
      )}
    </main>
  );
}
