import type { AuthenticatedUser } from "@laundry-app/shared";

export function hasPermission(
  user: AuthenticatedUser | null,
  permission: string,
): boolean {
  return user?.permissions?.includes(permission) ?? false;
}
