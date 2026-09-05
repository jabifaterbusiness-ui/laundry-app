import type { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { DEFAULT_ROLE_PERMISSIONS } from "./permissions.catalog.js";

export async function hasPermission(
  userId: string,
  businessId: string | null,
  role: Role,
  permissionCode: string,
): Promise<boolean> {
  if (role === "PLATFORM_ADMIN") {
    return true;
  }

  if (!businessId) {
    return false;
  }

  const permission = await prisma.permission.findUnique({
    where: { code: permissionCode },
    select: { id: true },
  });

  if (!permission) {
    return false;
  }

  const userOverride = await prisma.userPermissionOverride.findUnique({
    where: {
      businessId_userId_permissionId: {
        businessId,
        userId,
        permissionId: permission.id,
      },
    },
    select: { allowed: true },
  });

  if (userOverride) {
    return userOverride.allowed;
  }

  const roleOverride = await prisma.businessRolePermission.findUnique({
    where: {
      businessId_role_permissionId: {
        businessId,
        role,
        permissionId: permission.id,
      },
    },
    select: { allowed: true },
  });

  if (roleOverride) {
    return roleOverride.allowed;
  }

  return DEFAULT_ROLE_PERMISSIONS[role]?.includes(permissionCode) ?? false;
}
