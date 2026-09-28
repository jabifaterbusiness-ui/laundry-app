import type { AuthenticatedUser } from "@laundry-app/shared";
import { apiFetch } from "./api-client.js";

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
