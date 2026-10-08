import type { AuthenticatedUser } from "@laundry-app/shared";
import { apiFetch } from "./api-client.js";

export async function refreshSession(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  return apiFetch<{ accessToken: string; refreshToken: string }>(
    "/auth/refresh",
    {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    },
  );
}

export async function getCurrentUser(
  accessToken: string | null,
): Promise<AuthenticatedUser> {
  return apiFetch<AuthenticatedUser>("/auth/me", {
    accessToken,
  });
}


export async function updateAccount(
  input: { fullName: string },
  accessToken: string,
): Promise<AuthenticatedUser> {
  return apiFetch<AuthenticatedUser>("/auth/account", {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  });
}

export async function changePassword(
  input: { currentPassword: string; newPassword: string },
  accessToken: string,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/auth/change-password", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}


export async function reauthorize(
  password: string,
  accessToken: string,
): Promise<{ token: string; expiresAt: string }> {
  return apiFetch<{ token: string; expiresAt: string }>("/auth/reauthorize", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ password }),
  });
}
