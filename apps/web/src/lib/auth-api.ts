import type { AuthenticatedUser } from "@laundry-app/shared";
import { apiFetch } from "./api-client.js";

export async function getCurrentUser(
  accessToken: string | null,
): Promise<AuthenticatedUser> {
  return apiFetch<AuthenticatedUser>("/auth/me", {
    accessToken,
  });
}
