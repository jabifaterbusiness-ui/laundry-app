import { Prisma, type Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import { hashPassword } from "../auth/auth.service.js";

const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  securityRole: true,
  isActive: true,
  deletedAt: true,
  businessId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const BUSINESS_ROLES: Role[] = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
];

function assertBusinessRole(role: Role) {
  if (!BUSINESS_ROLES.includes(role)) {
    throw new AppError("Platform administrator accounts cannot be managed from a business context", 400);
  }
}

async function getUserRecord(userId: string, businessId: string) {
  return prisma.user.findFirst({
    where: { id: userId, businessId, deletedAt: null },
    select: USER_SELECT,
  });
}

async function getUserWithBranches(userId: string, businessId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, businessId, deletedAt: null },
    select: {
      ...USER_SELECT,
      branches: {
        select: {
          branch: {
            select: {
              id: true,
              name: true,
              isActive: true,
              businessId: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return {
    ...user,
    branches: user.branches.map(({ branch }) => branch),
  };
}

async function validateBranches(businessId: string, branchIds: string[]) {
  const uniqueBranchIds = [...new Set(branchIds)];

  if (uniqueBranchIds.length === 0) {
    return [];
  }

  const branches = await prisma.branch.findMany({
    where: {
      businessId,
      id: { in: uniqueBranchIds },
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      businessId: true,
    },
  });

  if (branches.length !== uniqueBranchIds.length) {
    throw new AppError("One or more branches were not found in this business", 404);
  }

  return branches;
}

async function assertNotLastActiveOwner(
  tx: Prisma.TransactionClient,
  current: {
    securityRole: Role;
    isActive: boolean;
  },
  businessId: string,
  nextSecurityRole: Role,
  nextActive: boolean,
) {
  if (
    current.securityRole === "BUSINESS_OWNER" &&
    current.isActive &&
    (nextSecurityRole !== "BUSINESS_OWNER" || !nextActive)
  ) {
    const ownerCount = await tx.user.count({
      where: {
        businessId,
        securityRole: "BUSINESS_OWNER",
        isActive: true,
      },
    });

    if (ownerCount <= 1) {
      throw new AppError(
        "The business must retain at least one active business owner",
        409,
      );
    }
  }
}

async function assertCannotDeactivateSelf(
  userId: string,
  actorUserId: string,
) {
  if (userId === actorUserId) {
    throw new AppError("You cannot deactivate your own account", 400);
  }
}

export async function listUsers(
  businessId: string,
  params: {
    search?: string;
    status: "active" | "inactive" | "all";
    role?: string;
  },
) {
  const where: {
    businessId: string;
    deletedAt: null;
    isActive?: boolean;
    role?: string;
    OR?: Array<Record<string, unknown>>;
  } = { businessId, deletedAt: null };

  if (params.status === "active") where.isActive = true;
  if (params.status === "inactive") where.isActive = false;
  if (params.role) where.role = params.role;

  if (params.search) {
    where.OR = [
      { fullName: { contains: params.search, mode: "insensitive" } },
      { email: { contains: params.search, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      ...USER_SELECT,
      branches: {
        select: {
          branch: {
            select: {
              id: true,
              name: true,
              isActive: true,
            },
          },
        },
      },
    },
    orderBy: { fullName: "asc" },
  });

  return users.map((user) => ({
    ...user,
    branches: user.branches.map(({ branch }) => branch),
  }));
}

export async function getUser(
  userId: string,
  businessId: string,
) {
  return getUserWithBranches(userId, businessId);
}

export async function createUser(
  input: {
    fullName: string;
    email: string;
    password: string;
    role: string;
    branchIds: string[];
  },
  context: {
    businessId: string;
    actorUserId: string;
    correlationId?: string | null;
  },
) {
  const roleTitle = input.role.trim();
  if (!roleTitle) {
    throw new AppError("Role is required", 400);
  }
  if (roleTitle.length > 120) {
    throw new AppError("Role must be 120 characters or less", 400);
  }

  const email = input.email.trim().toLowerCase();
  const branches = await validateBranches(context.businessId, input.branchIds);

  if (branches.some((branch) => !branch.isActive)) {
    throw new AppError("Inactive branches cannot be assigned to a user", 400);
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    throw new AppError("A user with this email already exists", 409);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        businessId: context.businessId,
        fullName: input.fullName.trim(),
        email,
        passwordHash,
        role: roleTitle,
        securityRole: "STAFF",
        isActive: true,
      },
      select: USER_SELECT,
    });

    if (input.branchIds.length > 0) {
      await tx.userBranch.createMany({
        data: [...new Set(input.branchIds)].map((branchId) => ({
          userId: created.id,
          branchId,
        })),
        skipDuplicates: true,
      });
    }

    return created;
  });

  await recordAuditEvent({
    action: "user.created",
    entityType: "User",
    entityId: user.id,
    businessId: context.businessId,
    actorUserId: context.actorUserId,
    correlationId: context.correlationId ?? null,
    metadata: {
      role: user.role,
      branchIds: [...new Set(input.branchIds)],
    },
  });

  return getUserWithBranches(user.id, context.businessId);
}

export async function updateUser(
  userId: string,
  input: {
    fullName?: string;
    email?: string;
    password?: string;
    role?: string;
    branchIds?: string[];
  },
  context: {
    businessId: string;
    actorUserId: string;
    correlationId?: string | null;
  },
) {
  const current = await prisma.user.findFirst({
    where: { id: userId, businessId: context.businessId, deletedAt: null },
    select: {
      ...USER_SELECT,
      branches: {
        select: { branchId: true },
      },
    },
  });

  if (!current) {
    throw new AppError("User not found", 404);
  }

  if (input.role !== undefined) {
    const roleTitle = input.role.trim();
    if (!roleTitle) {
      throw new AppError("Role cannot be empty", 400);
    }
    if (roleTitle.length > 120) {
      throw new AppError("Role must be 120 characters or less", 400);
    }
  }

  if (input.branchIds !== undefined) {
    const branches = await validateBranches(context.businessId, input.branchIds);

    if (branches.some((branch) => !branch.isActive)) {
      throw new AppError("Inactive branches cannot be assigned to a user", 400);
    }
  }

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();

    const existing = await prisma.user.findFirst({
      where: {
        email,
        NOT: { id: userId },
      },
      select: { id: true },
    });

    if (existing) {
      throw new AppError("A user with this email already exists", 409);
    }
  }

  const passwordHash =
    input.password !== undefined
      ? await hashPassword(input.password)
      : undefined;

  await prisma.$transaction(
    async (tx) => {
      const currentInTransaction = await tx.user.findFirst({
        where: { id: userId, businessId: context.businessId, deletedAt: null },
        select: {
          ...USER_SELECT,
          branches: {
            select: { branchId: true },
          },
        },
      });

      if (!currentInTransaction) {
        throw new AppError("User not found", 404);
      }

      const nextSecurityRoleInTransaction =
        currentInTransaction.securityRole;

      await assertNotLastActiveOwner(
        tx,
        currentInTransaction,
        context.businessId,
        nextSecurityRoleInTransaction,
        currentInTransaction.isActive,
      );

      await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.fullName !== undefined
            ? { fullName: input.fullName.trim() }
            : {}),
          ...(input.email !== undefined
            ? { email: input.email.trim().toLowerCase() }
            : {}),
          ...(passwordHash !== undefined ? { passwordHash } : {}),
          ...(input.role !== undefined ? { role: input.role.trim() } : {}),
        },
      });

      if (input.branchIds !== undefined) {
        const desired = new Set(input.branchIds);
        const currentBranchIds = new Set(
          currentInTransaction.branches.map((b) => b.branchId),
        );

        for (const branchId of desired) {
          if (!currentBranchIds.has(branchId)) {
            await tx.userBranch.create({
              data: { userId, branchId },
            });
          }
        }

        for (const branchId of currentBranchIds) {
          if (!desired.has(branchId)) {
            await tx.userBranch.deleteMany({
              where: { userId, branchId },
            });
          }
        }
      }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  await recordAuditEvent({
    action: "user.updated",
    entityType: "User",
    entityId: userId,
    businessId: context.businessId,
    actorUserId: context.actorUserId,
    correlationId: context.correlationId ?? null,
    metadata: {
      changedFields: Object.keys(input),
    },
  });

  return getUserWithBranches(userId, context.businessId);
}


export async function deleteUser(
  userId: string,
  input: {
    businessId: string;
    actorUserId: string;
    correlationId?: string | null;
  },
) {
  const current = await getUserRecord(userId, input.businessId);

  if (!current) {
    throw new AppError("User not found", 404);
  }

  if (current.id === input.actorUserId) {
    throw new AppError("You cannot delete your own account", 400);
  }

  await assertNotLastActiveOwner(
    prisma,
    current,
    input.businessId,
    current.securityRole,
    false,
  );

  const deletedAt = new Date();

  const deleted = await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: {
        id: userId,
        businessId: input.businessId,
        deletedAt: null,
      },
      data: {
        isActive: false,
        deletedAt,
      },
    });

    if (result.count !== 1) {
      throw new AppError("User is already deleted", 409);
    }

    return tx.user.findFirstOrThrow({
      where: {
        id: userId,
        businessId: input.businessId,
      },
      select: USER_SELECT,
    });
  });

  await recordAuditEvent({
    action: "user.deleted",
    entityType: "User",
    entityId: userId,
    businessId: input.businessId,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId ?? null,
    metadata: {
      previousRole: current.securityRole,
      previousIsActive: current.isActive,
      deletedAt: deletedAt.toISOString(),
    },
  });

  return deleted;
}

export async function setUserActiveStatus(
  userId: string,
  isActive: boolean,
  context: {
    businessId: string;
    actorUserId: string;
    correlationId?: string | null;
  },
) {
  const current = await getUserRecord(userId, context.businessId);

  if (!current) {
    throw new AppError("User not found", 404);
  }

  if (current.isActive === isActive) {
    throw new AppError(
      isActive ? "User is already active" : "User is already inactive",
      400,
    );
  }

  if (!isActive) {
    await assertCannotDeactivateSelf(userId, context.actorUserId);
  }

  await prisma.$transaction(
    async (tx) => {
      const currentInTransaction = await tx.user.findFirst({
        where: {
          id: userId,
          businessId: context.businessId,
          deletedAt: null,
        },
        select: USER_SELECT,
      });

      if (!currentInTransaction) {
        throw new AppError("User not found", 404);
      }

      if (currentInTransaction.isActive === isActive) {
        throw new AppError(
          isActive ? "User is already active" : "User is already inactive",
          400,
        );
      }

      if (!isActive) {
        await assertNotLastActiveOwner(
          tx,
          currentInTransaction,
          context.businessId,
          currentInTransaction.securityRole,
          false,
        );
      }

      await tx.user.updateMany({
        where: {
          id: userId,
          businessId: context.businessId,
        },
        data: { isActive },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  await recordAuditEvent({
    action: isActive ? "user.activated" : "user.deactivated",
    entityType: "User",
    entityId: userId,
    businessId: context.businessId,
    actorUserId: context.actorUserId,
    correlationId: context.correlationId ?? null,
  });

  return getUserWithBranches(userId, context.businessId);
}
