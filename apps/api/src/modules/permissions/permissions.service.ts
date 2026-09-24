import type { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { PERMISSIONS } from "./permissions.catalog.js";

export async function hasPermission(
  userId: string,
  businessId: string | null,
  role: Role,
  permissionCode: string,
): Promise<boolean> {
  if (role === "PLATFORM_ADMIN") {
    return true;
  }

  if (role === "BUSINESS_OWNER") {
    return (
      Boolean(businessId) &&
      PERMISSIONS.some((permission) => permission.code === permissionCode)
    );
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

  // Ordinary-user access is controlled exclusively by the individual
  // user permission override. The visible Role is a job title only and
  // must never grant access through role defaults or role overrides.
  return false;
}

export async function getEffectivePermissionCodes(
  businessId: string | null,
  userId: string,
  role: Role,
): Promise<string[]> {
  if (role === "PLATFORM_ADMIN") {
    return PERMISSIONS.map((permission) => permission.code);
  }

  if (role === "BUSINESS_OWNER") {
    return businessId
      ? PERMISSIONS.map((permission) => permission.code)
      : [];
  }

  if (!businessId) {
    return [];
  }

  const userOverrides = await prisma.userPermissionOverride.findMany({
    where: {
      businessId,
      userId,
    },
    select: {
      permission: {
        select: {
          code: true,
        },
      },
      allowed: true,
    },
  });

  const userOverrideMap = new Map(
    userOverrides.map((override) => [
      override.permission.code,
      override.allowed,
    ]),
  );

  return PERMISSIONS
    .filter((permission) => userOverrideMap.get(permission.code) === true)
    .map((permission) => permission.code);
}

export function getPermissionDefinition(permissionCode: string) {
  const permission = PERMISSIONS.find(
    (candidate) => candidate.code === permissionCode,
  );

  if (!permission) {
    throw new AppError(`Unknown permission: ${permissionCode}`, 400);
  }

  return permission;
}

async function requireBusinessUser(userId: string, businessId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      businessId,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      securityRole: true,
      isActive: true,
      businessId: true,
    },
  });

  if (!user) {
    throw new AppError("User not found in this business", 404);
  }

  return user;
}

export async function listPermissions() {
  return PERMISSIONS;
}

export async function getRolePermissions(
  businessId: string,
  role: Role,
) {
  const overrides = await prisma.businessRolePermission.findMany({
    where: {
      businessId,
      role,
    },
    select: {
      permission: {
        select: {
          code: true,
          module: true,
          action: true,
          description: true,
        },
      },
      allowed: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      permission: {
        code: "asc",
      },
    },
  });

  const overrideMap = new Map(
    overrides.map((override) => [
      override.permission.code,
      override.allowed,
    ]),
  );

  return PERMISSIONS.map((permission) => {
    if (role === "BUSINESS_OWNER") {
      return {
        ...permission,
        source: "default" as const,
        allowed: true,
      };
    }

    return {
      ...permission,
      source: overrideMap.has(permission.code)
        ? "business_role_override"
        : "default",
      allowed: overrideMap.get(permission.code) ?? false,
    };
  });
}

export async function getUserPermissions(
  businessId: string,
  userId: string,
) {
  const user = await requireBusinessUser(userId, businessId);

  const overrides = await prisma.userPermissionOverride.findMany({
    where: {
      businessId,
      userId,
    },
    select: {
      permission: {
        select: {
          code: true,
          module: true,
          action: true,
          description: true,
        },
      },
      allowed: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      permission: {
        code: "asc",
      },
    },
  });

  const userOverrideMap = new Map(
    overrides.map((override) => [
      override.permission.code,
      override.allowed,
    ]),
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      securityRole: user.securityRole,
      isActive: user.isActive,
    },
    permissions: PERMISSIONS.map((permission) => {
      if (user.securityRole === "BUSINESS_OWNER") {
        return {
          ...permission,
          source: "default" as const,
          allowed: true,
        };
      }

      const source = userOverrideMap.has(permission.code)
        ? "user_override" as const
        : "default" as const;

      return {
        ...permission,
        source,
        allowed: userOverrideMap.get(permission.code) ?? false,
      };
    }),
  };
}

export async function requirePermissionForGrant(
  actorUserId: string,
  businessId: string,
  actorRole: Role,
  permissionCode: string,
) {
  const allowed = await hasPermission(
    actorUserId,
    businessId,
    actorRole,
    permissionCode,
  );

  if (!allowed) {
    throw new AppError(
      "You cannot grant a permission that you do not possess",
      403,
    );
  }
}

export async function upsertBusinessRolePermission(
  businessId: string,
  role: Role,
  permissionCode: string,
  allowed: boolean,
) {
  if (role === "PLATFORM_ADMIN") {
    throw new AppError("PLATFORM_ADMIN permissions cannot be configured at business level", 400);
  }

  if (role === "BUSINESS_OWNER") {
    throw new AppError(
      "BUSINESS_OWNER permissions cannot be restricted at business level",
      400,
    );
  }

  const permission = getPermissionDefinition(permissionCode);

  const permissionRecord = await prisma.permission.findUnique({
    where: { code: permission.code },
    select: { id: true },
  });

  if (!permissionRecord) {
    throw new AppError(`Permission not found: ${permissionCode}`, 400);
  }

  return prisma.businessRolePermission.upsert({
    where: {
      businessId_role_permissionId: {
        businessId,
        role,
        permissionId: permissionRecord.id,
      },
    },
    create: {
      businessId,
      role,
      permissionId: permissionRecord.id,
      allowed,
    },
    update: {
      allowed,
    },
    select: {
      id: true,
      role: true,
      allowed: true,
      permission: {
        select: {
          code: true,
          module: true,
          action: true,
          description: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function removeBusinessRolePermission(
  businessId: string,
  role: Role,
  permissionCode: string,
) {
  if (role === "PLATFORM_ADMIN") {
    throw new AppError("PLATFORM_ADMIN permissions cannot be configured at business level", 400);
  }

  if (role === "BUSINESS_OWNER") {
    throw new AppError(
      "BUSINESS_OWNER permissions cannot be restricted at business level",
      400,
    );
  }

  const permission = getPermissionDefinition(permissionCode);

  const result = await prisma.businessRolePermission.deleteMany({
    where: {
      businessId,
      role,
      permission: {
        code: permission.code,
      },
    },
  });

  if (result.count === 0) {
    throw new AppError("Business role permission override not found", 404);
  }

  return { removed: true };
}

export async function upsertUserPermissionOverride(
  businessId: string,
  userId: string,
  permissionCode: string,
  allowed: boolean,
) {
  const user = await requireBusinessUser(userId, businessId);

  if (user.securityRole === "BUSINESS_OWNER") {
    throw new AppError(
      "BUSINESS_OWNER permissions cannot be restricted",
      400,
    );
  }

  const permission = getPermissionDefinition(permissionCode);

  const permissionRecord = await prisma.permission.findUnique({
    where: { code: permission.code },
    select: { id: true },
  });

  if (!permissionRecord) {
    throw new AppError(`Permission not found: ${permissionCode}`, 400);
  }

  return prisma.userPermissionOverride.upsert({
    where: {
      businessId_userId_permissionId: {
        businessId,
        userId,
        permissionId: permissionRecord.id,
      },
    },
    create: {
      businessId,
      userId,
      permissionId: permissionRecord.id,
      allowed,
    },
    update: {
      allowed,
    },
    select: {
      id: true,
      allowed: true,
      permission: {
        select: {
          code: true,
          module: true,
          action: true,
          description: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function allowAllUserPermissions(
  businessId: string,
  userId: string,
) {
  const user = await requireBusinessUser(userId, businessId);

  if (user.securityRole === "BUSINESS_OWNER") {
    throw new AppError(
      "BUSINESS_OWNER permissions cannot be restricted",
      400,
    );
  }

  const permissionRecords = await prisma.permission.findMany({
    where: {
      code: { in: PERMISSIONS.map((permission) => permission.code) },
    },
    select: { id: true, code: true },
  });

  if (permissionRecords.length !== PERMISSIONS.length) {
    throw new AppError(
      "Permission catalogue is incomplete; cannot allow all permissions",
      500,
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const permission of permissionRecords) {
      await tx.userPermissionOverride.upsert({
        where: {
          businessId_userId_permissionId: {
            businessId,
            userId,
            permissionId: permission.id,
          },
        },
        create: {
          businessId,
          userId,
          permissionId: permission.id,
          allowed: true,
        },
        update: {
          allowed: true,
        },
      });
    }
  });

  return { allowed: true, count: permissionRecords.length };
}

export async function disallowAllUserPermissions(
  businessId: string,
  userId: string,
) {
  const user = await requireBusinessUser(userId, businessId);

  if (user.securityRole === "BUSINESS_OWNER") {
    throw new AppError(
      "BUSINESS_OWNER permissions cannot be restricted",
      400,
    );
  }

  const result = await prisma.userPermissionOverride.deleteMany({
    where: {
      businessId,
      userId,
    },
  });

  return { allowed: false, count: result.count };
}

export async function removeUserPermissionOverride(
  businessId: string,
  userId: string,
  permissionCode: string,
) {
  const user = await requireBusinessUser(userId, businessId);

  if (user.securityRole === "BUSINESS_OWNER") {
    throw new AppError(
      "BUSINESS_OWNER permissions cannot be restricted",
      400,
    );
  }

  const permission = getPermissionDefinition(permissionCode);

  const result = await prisma.userPermissionOverride.deleteMany({
    where: {
      businessId,
      userId,
      permission: {
        code: permission.code,
      },
    },
  });

  if (result.count === 0) {
    throw new AppError("User permission override not found", 404);
  }

  return { removed: true };
}
