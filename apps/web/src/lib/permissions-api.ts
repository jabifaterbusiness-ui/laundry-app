import { apiFetch } from "./api-client.js";

export interface PermissionDefinition {
  code: string;
  module: string;
  action: string;
  description: string;
}

export type PermissionSource =
  | "default"
  | "business_role_override"
  | "user_override";

export interface RolePermission {
  code: string;
  module: string;
  action: string;
  description: string;
  source: PermissionSource;
  allowed: boolean;
}

export interface UserPermissionResponse {
  user: {
    id: string;
    fullName: string;
    email: string;
    role: "BUSINESS_OWNER" | "BRANCH_MANAGER" | "STAFF";
  };
  permissions: RolePermission[];
}

export function listPermissions(accessToken: string) {
  return apiFetch<PermissionDefinition[]>("/permissions", {
    accessToken,
  });
}

export function getRolePermissions(
  role: "BUSINESS_OWNER" | "BRANCH_MANAGER" | "STAFF",
  accessToken: string,
) {
  return apiFetch<RolePermission[]>(`/permissions/roles/${role}`, {
    accessToken,
  });
}

export function getUserPermissions(
  userId: string,
  accessToken: string,
) {
  return apiFetch<UserPermissionResponse>(
    `/permissions/users/${userId}`,
    { accessToken },
  );
}

export function updateRolePermission(
  role: "BRANCH_MANAGER" | "STAFF",
  permissionCode: string,
  allowed: boolean,
  accessToken: string,
) {
  return apiFetch<RolePermission>(
    `/permissions/roles/${role}/${encodeURIComponent(permissionCode)}`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify({ allowed }),
    },
  );
}

export function updateUserPermission(
  userId: string,
  permissionCode: string,
  allowed: boolean,
  accessToken: string,
) {
  return apiFetch<RolePermission>(
    `/permissions/users/${userId}/${encodeURIComponent(permissionCode)}`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify({ allowed }),
    },
  );
}

export function removeRolePermission(
  role: "BRANCH_MANAGER" | "STAFF",
  permissionCode: string,
  accessToken: string,
) {
  return apiFetch<void>(
    `/permissions/roles/${role}/${encodeURIComponent(permissionCode)}`,
    {
      method: "DELETE",
      accessToken,
    },
  );
}

export function removeUserPermission(
  userId: string,
  permissionCode: string,
  accessToken: string,
) {
  return apiFetch<void>(
    `/permissions/users/${userId}/${encodeURIComponent(permissionCode)}`,
    {
      method: "DELETE",
      accessToken,
    },
  );
}
