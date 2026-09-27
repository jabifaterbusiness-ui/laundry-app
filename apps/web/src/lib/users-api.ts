import { apiFetch } from "./api-client.js";

// Visible job title chosen by management. It is descriptive only and
// never determines access permissions.
export type UserRole = string;

export type UserStatus = "active" | "inactive" | "all";

export interface UserBranch {
  id: string;
  name: string;
  isActive: boolean;
}

export interface ManagedUser {
  id: string;
  email: string;
  username: string | null;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  businessId: string;
  createdAt: string;
  updatedAt: string;
  branches: UserBranch[];
}

export interface ListUsersParams {
  accessToken: string;
  status?: UserStatus;
  search?: string;
  role?: UserRole;
}

export interface CreateUserInput {
  fullName: string;
  email: string;
  username?: string;
  password: string;
  role: UserRole;
  branchIds: string[];
}

export interface UpdateUserInput {
  fullName?: string;
  email?: string;
  username?: string | null;
  password?: string;
  role?: UserRole;
  branchIds?: string[];
}

export interface Branch {
  id: string;
  businessId: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function queryString(params: {
  status?: UserStatus;
  search?: string;
  role?: UserRole;
}) {
  const searchParams = new URLSearchParams();

  if (params.status) {
    searchParams.set("status", params.status);
  }

  if (params.search?.trim()) {
    searchParams.set("search", params.search.trim());
  }

  if (params.role) {
    searchParams.set("role", params.role);
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listUsers(params: ListUsersParams) {
  return apiFetch<ManagedUser[]>(
    `/users${queryString(params)}`,
    {
      accessToken: params.accessToken,
    },
  );
}

export function getUser(
  userId: string,
  accessToken: string,
) {
  return apiFetch<ManagedUser>(`/users/${userId}`, {
    accessToken,
  });
}

export function createUser(
  input: CreateUserInput,
  accessToken: string,
) {
  return apiFetch<ManagedUser>("/users", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function updateUser(
  userId: string,
  input: UpdateUserInput,
  accessToken: string,
) {
  return apiFetch<ManagedUser>(`/users/${userId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function activateUser(
  userId: string,
  accessToken: string,
) {
  return apiFetch<ManagedUser>(`/users/${userId}/activate`, {
    method: "PATCH",
    accessToken,
  });
}

export function deactivateUser(
  userId: string,
  reason: string,
  accessToken: string,
) {
  return apiFetch<ManagedUser>(`/users/${userId}/deactivate`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ reason }),
  });
}

export function deleteUser(
  userId: string,
  reason: string,
  accessToken: string,
) {
  return apiFetch<ManagedUser>(`/users/${userId}`, {
    method: "DELETE",
    accessToken,
    body: JSON.stringify({ reason }),
  });
}

export function listBranches(
  accessToken: string,
) {
  return apiFetch<Branch[]>("/branches?status=active", {
    accessToken,
  });
}
