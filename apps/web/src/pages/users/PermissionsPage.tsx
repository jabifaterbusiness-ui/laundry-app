import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  allowAllUserPermissions,
  disallowAllUserPermissions,
  getUserPermissions,
  listPermissions,
  removeUserPermission,
  updateUserPermission,
  type RolePermission,
} from "../../lib/permissions-api.js";
import { listUsers } from "../../lib/users-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";

function formatSecurityRole(role: string) {
  switch (role) {
    case "BUSINESS_OWNER":
      return "Business Owner";
    case "PLATFORM_ADMIN":
      return "Platform Admin";
    case "BRANCH_MANAGER":
      return "Branch Manager";
    case "STAFF":
      return "Staff";
    default:
      return role;
  }
}

export function PermissionsPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const currentUser = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const canManage = hasPermission(
    currentUser,
    "users.manage_permissions",
  );

  const [selectedUserId, setSelectedUserId] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  function requireActionReason(action: string): string | null {
    const reason = window.prompt(`Reason for ${action}:`);
    if (reason === null) {
      return null;
    }

    const normalized = reason.trim();
    if (!normalized) {
      setError("A reason is required for this sensitive action.");
      return null;
    }

    return normalized;
  }

  const permissionsQuery = useQuery({
    queryKey: ["permissions", "catalog"],
    enabled: canManage,
    queryFn: () => listPermissions(accessToken ?? ""),
  });

  const usersQuery = useQuery({
    queryKey: ["users", "permissions"],
    enabled: canManage,
    queryFn: () =>
      listUsers({
        accessToken: accessToken ?? "",
        status: "active",
      }),
  });

  const userQuery = useQuery({
    queryKey: ["permissions", "user", selectedUserId],
    enabled: canManage && Boolean(selectedUserId),
    queryFn: () =>
      getUserPermissions(selectedUserId, accessToken ?? ""),
  });

  const permissions = useMemo<RolePermission[]>(() => {
    if (!selectedUserId) return [];
    return userQuery.data?.permissions ?? [];
  }, [selectedUserId, userQuery.data]);

  const modules = useMemo(
    () => [
      ...new Set(
        permissions.map((permission) => permission.module),
      ),
    ],
    [permissions],
  );

  const filteredPermissions = permissions.filter((permission) =>
    moduleFilter ? permission.module === moduleFilter : true,
  );

  const updateMutation = useMutation({
    mutationFn: (input: {
      permission: RolePermission;
      allowed: boolean;
    }) => {
      const reason = requireActionReason(
        `${input.allowed ? "allowing" : "denying"} ${input.permission.code}`,
      );
      if (!reason) {
        throw new Error("A reason is required for this sensitive action.");
      }

      return updateUserPermission(
        selectedUserId,
        input.permission.code,
        input.allowed,
        reason,
        accessToken ?? "",
      );
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({
        queryKey: ["permissions", "user", selectedUserId],
      });
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
    mutationFn: (permission: RolePermission) => {
      const reason = requireActionReason(`resetting ${permission.code}`);
      if (!reason) {
        throw new Error("A reason is required for this sensitive action.");
      }

      return removeUserPermission(
        selectedUserId,
        permission.code,
        reason,
        accessToken ?? "",
      );
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({
        queryKey: ["permissions", "user", selectedUserId],
      });
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : "Unable to reset permission.",
      );
    },
  });

  const allowAllMutation = useMutation({
    mutationFn: () => {
      const reason = requireActionReason("allowing all permissions");
      if (!reason) {
        throw new Error("A reason is required for this sensitive action.");
      }

      return allowAllUserPermissions(
        selectedUserId,
        reason,
        accessToken ?? "",
      );
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({
        queryKey: ["permissions", "user", selectedUserId],
      });
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : "Unable to allow all permissions.",
      );
    },
  });

  const disallowAllMutation = useMutation({
    mutationFn: () => {
      const reason = requireActionReason("disallowing all permissions");
      if (!reason) {
        throw new Error("A reason is required for this sensitive action.");
      }

      return disallowAllUserPermissions(
        selectedUserId,
        reason,
        accessToken ?? "",
      );
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({
        queryKey: ["permissions", "user", selectedUserId],
      });
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : "Unable to disallow all permissions.",
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
    userQuery.data?.user.securityRole === "BUSINESS_OWNER";

  const bulkMutationPending =
    allowAllMutation.isPending ||
    disallowAllMutation.isPending;

  return (
    <main>
      <header>
        <h1>Permissions</h1>
        <p>
          Management controls each user's access individually.
          The Role field is the user's job title and does not grant
          permissions.
        </p>
      </header>

      <section aria-label="Permission target">
        <label>
          User
          <select
            value={selectedUserId}
            onChange={(event) => {
              setSelectedUserId(event.target.value);
              setModuleFilter("");
              setError(null);
            }}
          >
            <option value="">Select a user</option>
            {(usersQuery.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName} — {user.role}
              </option>
            ))}
          </select>
        </label>
      </section>

      {selectedUserId && userQuery.data ? (
        <section aria-label="Selected user">
          <p>
            <strong>{userQuery.data.user.fullName}</strong>
            {" — "}
            {userQuery.data.user.role}
          </p>
          <p>
            Security foundation:{" "}
            {formatSecurityRole(userQuery.data.user.securityRole)}
          </p>
        </section>
      ) : null}

      {businessOwnerSelected ? (
        <p>
          Business Owner access is system-wide and cannot be restricted
          through a business-level permission override.
        </p>
      ) : null}

      {selectedUserId && !businessOwnerSelected ? (
        <section aria-label="Bulk permission controls">
          <button
            type="button"
            disabled={
              bulkMutationPending ||
              updateMutation.isPending ||
              resetMutation.isPending
            }
            onClick={() => allowAllMutation.mutate()}
          >
            {allowAllMutation.isPending
              ? "Allowing..."
              : "Allow All"}
          </button>

          <button
            type="button"
            disabled={
              bulkMutationPending ||
              updateMutation.isPending ||
              resetMutation.isPending
            }
            onClick={() => disallowAllMutation.mutate()}
          >
            {disallowAllMutation.isPending
              ? "Disallowing..."
              : "Disallow All"}
          </button>
        </section>
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
        usersQuery.isLoading ||
        userQuery.isLoading) && (
        <p>Loading permissions...</p>
      )}

      {!selectedUserId ? (
        <p>Select a user to manage individual permissions.</p>
      ) : null}

      {selectedUserId && filteredPermissions.length > 0 ? (
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
                resetMutation.isPending ||
                bulkMutationPending;

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

                    {permission.source !== "default" &&
                    !businessOwnerSelected ? (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() =>
                          resetMutation.mutate(permission)
                        }
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
      ) : selectedUserId &&
        !userQuery.isLoading &&
        !userQuery.isError ? (
        <p>No permission records to display.</p>
      ) : null}
    </main>
  );
}
