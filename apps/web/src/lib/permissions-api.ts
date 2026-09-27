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
    role: string;
    securityRole: "PLATFORM_ADMIN" | "BUSINESS_OWNER" | "BRANCH_MANAGER" | "STAFF";
    isActive: boolean;
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
  reason: string,
  accessToken: string,
) {
  return apiFetch<RolePermission>(
    `/permissions/roles/${role}/${encodeURIComponent(permissionCode)}`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify({ allowed, reason }),
    },
  );
}

export function updateUserPermission(
  userId: string,
  permissionCode: string,
  allowed: boolean,
  reason: string,
  accessToken: string,
) {
  return apiFetch<RolePermission>(
    `/permissions/users/${userId}/${encodeURIComponent(permissionCode)}`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify({ allowed, reason }),
    },
  );
}

export function removeRolePermission(
  role: "BRANCH_MANAGER" | "STAFF",
  permissionCode: string,
  reason: string,
  accessToken: string,
) {
  return apiFetch<void>(
    `/permissions/roles/${role}/${encodeURIComponent(permissionCode)}`,
    {
      method: "DELETE",
      accessToken,
      body: JSON.stringify({ reason }),
    },
  );
}

export function removeUserPermission(
  userId: string,
  permissionCode: string,
  reason: string,
  accessToken: string,
) {
  return apiFetch<void>(
    `/permissions/users/${userId}/${encodeURIComponent(permissionCode)}`,
    {
      method: "DELETE",
      accessToken,
      body: JSON.stringify({ reason }),
    },
  );
}


export function allowAllUserPermissions(
  userId: string,
  reason: string,
  accessToken: string,
) {
  return apiFetch<{ allowed: boolean; count: number }>(
    `/permissions/users/${userId}/allow-all`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify({ reason }),
    },
  );
}

export function disallowAllUserPermissions(
  userId: string,
  reason: string,
  accessToken: string,
) {
  return apiFetch<{ allowed: boolean; count: number }>(
    `/permissions/users/${userId}/disallow-all`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify({ reason }),
    },
  );
}
