import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";


async function assertCanManageOwnerBranch(
  input: {
    businessId: string;
    ownerBranchId: string;
    actorUserId: string;
  },
  db: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const actor = await db.user.findFirst({
    where: {
      id: input.actorUserId,
      businessId: input.businessId,
      isActive: true,
      deletedAt: null,
    },
    select: { securityRole: true },
  });

  if (!actor) {
    throw new AppError("An active user in this business is required", 403);
  }

  // Business owners administer resources across their business. Other
  // users must belong to the branch whose resources they are sharing.
  if (actor.securityRole === "BUSINESS_OWNER" || actor.securityRole === "PLATFORM_ADMIN") {
    return;
  }

  const membership = await db.userBranch.findUnique({
    where: {
      userId_branchId: {
        userId: input.actorUserId,
        branchId: input.ownerBranchId,
      },
    },
    select: { id: true },
  });

  if (!membership) {
    throw new AppError("You must belong to the resource-owning branch to manage its sharing rules", 403);
  }
}

export type BranchResourceType =
  | "CUSTOMERS"
  | "SERVICES"
  | "CUSTOMER_PRICING"
  | "DISCOUNTS"
  | "TAX_RULES"
  | "INVENTORY"
  | "PAYROLL_COMPENSATION";

export interface BranchResourceScope {
  ownerBranchIds: string[];
  resourceIds: string[];
  editableOwnerBranchIds: string[];
  editableResourceIds: string[];
}

export async function getBranchResourceScope(input: {
  businessId: string;
  branchId: string;
  userId: string;
  resourceType: BranchResourceType;
}): Promise<BranchResourceScope> {
  const shares = await prisma.branchResourceShare.findMany({
    where: {
      businessId: input.businessId,
      targetBranchId: input.branchId,
      resourceType: input.resourceType,
      AND: [{ OR: [{ userId: null }, { userId: input.userId }] }],
    },
    select: {
      ownerBranchId: true,
      resourceId: true,
      accessLevel: true,
    },
  });

  const allResourceShares = shares.filter((share) => !share.resourceId);
  const specificResourceShares = shares.filter((share) => Boolean(share.resourceId));
  return {
    ownerBranchIds: [...new Set([input.branchId, ...allResourceShares.map((share) => share.ownerBranchId)])],
    resourceIds: specificResourceShares.map((share) => share.resourceId!),
    editableOwnerBranchIds: [...new Set([
      input.branchId,
      ...allResourceShares.filter((share) => share.accessLevel === "EDIT").map((share) => share.ownerBranchId),
    ])],
    editableResourceIds: specificResourceShares.filter((share) => share.accessLevel === "EDIT").map((share) => share.resourceId!),
  };
}

export async function assertBranchResourceWriteAccess(input: {
  businessId: string;
  branchId: string;
  userId: string;
  resourceType: BranchResourceType;
  ownerBranchId: string | null;
  resourceId: string;
}) {
  if (!input.ownerBranchId || input.ownerBranchId === input.branchId) return;

  const share = await prisma.branchResourceShare.findFirst({
    where: {
      businessId: input.businessId,
      ownerBranchId: input.ownerBranchId,
      targetBranchId: input.branchId,
      resourceType: input.resourceType,
      accessLevel: "EDIT",
      AND: [
        { OR: [{ userId: null }, { userId: input.userId }] },
        { OR: [{ resourceId: null }, { resourceId: input.resourceId }] },
      ],
    },
    select: { id: true },
  });

  if (!share) {
    throw new AppError("This record is shared with read-only access or is not shared with this branch", 403);
  }
}

export async function listBranchResourceShares(businessId: string) {
  return prisma.branchResourceShare.findMany({
    where: { businessId },
    include: {
      ownerBranch: { select: { id: true, name: true } },
      targetBranch: { select: { id: true, name: true } },
      user: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: [{ ownerBranch: { name: "asc" } }, { targetBranch: { name: "asc" } }, { resourceType: "asc" }],
  });
}

async function reconcileCustomerAccountMode(
  tx: Prisma.TransactionClient,
  input: { businessId: string; ownerBranchId: string; targetBranchId: string; mode: "SHARED" | "SEPARATE" },
) {
  const customers = await tx.customer.findMany({
    where: { businessId: input.businessId, ownerBranchId: input.ownerBranchId },
    select: { id: true },
  });
  for (const customer of customers) {
    const branchAccount = await tx.customerAccount.findFirst({
      where: { businessId: input.businessId, customerId: customer.id, branchId: input.targetBranchId },
      select: { id: true },
    });
    if (input.mode === "SEPARATE") {
      const sharedAccount = await tx.customerAccount.findFirst({
        where: { businessId: input.businessId, customerId: customer.id, branchId: null },
        select: { id: true },
      });
      if (!sharedAccount) continue;
      const branchTransactions = await tx.customerAccountTransaction.findMany({
        where: { customerAccountId: sharedAccount.id, branchId: input.targetBranchId },
        select: { id: true },
      });
      if (branchTransactions.length === 0) continue;
      const destination = branchAccount ?? await tx.customerAccount.create({
        data: { businessId: input.businessId, customerId: customer.id, branchId: input.targetBranchId },
        select: { id: true },
      });
      await tx.customerAccountTransaction.updateMany({
        where: { customerAccountId: sharedAccount.id, branchId: input.targetBranchId },
        data: { customerAccountId: destination.id },
      });
      continue;
    }
    if (!branchAccount) continue;
    const sharedAccount = await tx.customerAccount.findFirst({
      where: { businessId: input.businessId, customerId: customer.id, branchId: null },
      select: { id: true },
    }) ?? await tx.customerAccount.create({
      data: { businessId: input.businessId, customerId: customer.id, branchId: null },
      select: { id: true },
    });
    await tx.customerAccountTransaction.updateMany({
      where: { customerAccountId: branchAccount.id },
      data: { customerAccountId: sharedAccount.id },
    });
    await tx.customerAccount.delete({ where: { id: branchAccount.id } });
  }
}

export async function saveBranchResourceShare(input: {
  businessId: string;
  ownerBranchId: string;
  targetBranchId: string;
  resourceType: BranchResourceType;
  resourceId?: string | null;
  userId?: string | null;
  accessLevel: "READ" | "EDIT";
  customerAccountMode?: "SHARED" | "SEPARATE";
  createdByUserId: string;
}) {
  const requestedAccountMode = input.customerAccountMode;
  if (requestedAccountMode === "SEPARATE" && (input.resourceType !== "CUSTOMERS" || input.resourceId || input.userId)) {
    throw new AppError("Separate customer accounts require an all-customer rule for the whole target branch", 400);
  }
  if (input.ownerBranchId === input.targetBranchId) {
    throw new AppError("A branch cannot share resources with itself", 400);
  }

  await assertCanManageOwnerBranch({ businessId: input.businessId, ownerBranchId: input.ownerBranchId, actorUserId: input.createdByUserId });

  const branches = await prisma.branch.findMany({
    where: { businessId: input.businessId, id: { in: [input.ownerBranchId, input.targetBranchId] } },
    select: { id: true },
  });
  if (branches.length !== 2) throw new AppError("Both branches must belong to this business", 404);

  if (input.userId) {
    const targetUser = await prisma.user.findFirst({
      where: {
        id: input.userId,
        businessId: input.businessId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!targetUser) throw new AppError("The selected user is not active in this business", 400);

    const membership = await prisma.userBranch.findFirst({
      where: { userId: input.userId, branchId: input.targetBranchId },
      select: { id: true },
    });
    if (!membership) throw new AppError("The selected user is not assigned to the target branch", 400);
  }

  const resourceId = input.resourceId ?? null;
  const assertConfigurationInsideTransaction = async (tx: Prisma.TransactionClient) => {
    await assertCanManageOwnerBranch({
      businessId: input.businessId,
      ownerBranchId: input.ownerBranchId,
      actorUserId: input.createdByUserId,
    }, tx);

    const currentBranches = await tx.branch.findMany({
      where: { businessId: input.businessId, id: { in: [input.ownerBranchId, input.targetBranchId] } },
      select: { id: true },
    });
    if (currentBranches.length !== 2) {
      throw new AppError("Both branches must belong to this business", 404);
    }

    if (userId) {
      const currentUser = await tx.user.findFirst({
        where: { id: userId, businessId: input.businessId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!currentUser) throw new AppError("The selected user is not active in this business", 400);
      const currentMembership = await tx.userBranch.findFirst({
        where: { userId, branchId: input.targetBranchId },
        select: { id: true },
      });
      if (!currentMembership) throw new AppError("The selected user is not assigned to the target branch", 400);
    }

    if (resourceId) {
      const where = { id: resourceId, businessId: input.businessId };
      let owned = false;
      switch (input.resourceType) {
        case "CUSTOMERS":
          owned = Boolean(await tx.customer.findFirst({ where: { ...where, ownerBranchId: input.ownerBranchId }, select: { id: true } }));
          break;
        case "SERVICES":
          owned = Boolean(await tx.service.findFirst({ where: { ...where, ownerBranchId: input.ownerBranchId }, select: { id: true } }));
          break;
        case "CUSTOMER_PRICING":
          owned = Boolean(await tx.customerServicePrice.findFirst({ where: { ...where, branchId: input.ownerBranchId }, select: { id: true } }));
          break;
        case "DISCOUNTS":
          owned = Boolean(await tx.priceAdjustment.findFirst({ where: { ...where, branchId: input.ownerBranchId }, select: { id: true } }));
          break;
        case "TAX_RULES":
          owned = Boolean(await tx.taxRule.findFirst({ where: { ...where, branchId: input.ownerBranchId }, select: { id: true } }));
          break;
        case "INVENTORY":
          owned = Boolean(await tx.inventoryItem.findFirst({ where: { ...where, ownerBranchId: input.ownerBranchId }, select: { id: true } }));
          break;
        case "PAYROLL_COMPENSATION":
          owned = Boolean(await tx.employeeCompensation.findFirst({ where: { ...where, branchId: input.ownerBranchId }, select: { id: true } }));
          break;
      }
      if (!owned) {
        throw new AppError("The selected record does not belong to the chosen owner branch or cannot be shared individually", 404);
      }
    }
  };

  if (resourceId) {
    let resourceBelongsToOwnerBranch = false;
    const resourceWhere = { id: resourceId, businessId: input.businessId };

    switch (input.resourceType) {
      case "CUSTOMERS":
        resourceBelongsToOwnerBranch = Boolean(await prisma.customer.findFirst({
          where: { ...resourceWhere, ownerBranchId: input.ownerBranchId },
          select: { id: true },
        }));
        break;
      case "SERVICES":
        resourceBelongsToOwnerBranch = Boolean(await prisma.service.findFirst({
          where: { ...resourceWhere, ownerBranchId: input.ownerBranchId },
          select: { id: true },
        }));
        break;
      case "CUSTOMER_PRICING":
        resourceBelongsToOwnerBranch = Boolean(await prisma.customerServicePrice.findFirst({
          where: { ...resourceWhere, branchId: input.ownerBranchId },
          select: { id: true },
        }));
        break;
      case "DISCOUNTS":
        resourceBelongsToOwnerBranch = Boolean(await prisma.priceAdjustment.findFirst({
          where: { ...resourceWhere, branchId: input.ownerBranchId },
          select: { id: true },
        }));
        break;
      case "TAX_RULES":
        resourceBelongsToOwnerBranch = Boolean(await prisma.taxRule.findFirst({
          where: { ...resourceWhere, branchId: input.ownerBranchId },
          select: { id: true },
        }));
        break;
      case "INVENTORY":
        resourceBelongsToOwnerBranch = Boolean(await prisma.inventoryItem.findFirst({
          where: { ...resourceWhere, ownerBranchId: input.ownerBranchId },
          select: { id: true },
        }));
        break;
      case "PAYROLL_COMPENSATION":
        resourceBelongsToOwnerBranch = Boolean(await prisma.employeeCompensation.findFirst({
          where: { ...resourceWhere, branchId: input.ownerBranchId },
          select: { id: true },
        }));
        break;
    }

    if (!resourceBelongsToOwnerBranch) {
      throw new AppError("The selected record does not belong to the chosen owner branch or cannot be shared individually", 404);
    }
  }
  const userId = input.userId ?? null;
  const userId = input.userId ?? null;
  const result = await prisma.$transaction(async (tx) => {
    await assertConfigurationInsideTransaction(tx);

    // Read the current rule inside the same Serializable transaction that
    // chooses its account mode, reconciles ledgers, and writes the rule.
    const existing = await tx.branchResourceShare.findFirst({
      where: {
        businessId: input.businessId,
        ownerBranchId: input.ownerBranchId,
        targetBranchId: input.targetBranchId,
        resourceType: input.resourceType,
        resourceId,
        userId,
      },
      select: { id: true, customerAccountMode: true },
    });

    const accountMode = requestedAccountMode ?? existing?.customerAccountMode ?? "SHARED";
    const oldMode = existing?.customerAccountMode ?? "SHARED";
    const isBroadCustomerRule = input.resourceType === "CUSTOMERS" && !resourceId && !userId;

    if (existing) {
      if (isBroadCustomerRule && oldMode !== accountMode) {
        await reconcileCustomerAccountMode(tx, {
          businessId: input.businessId,
          ownerBranchId: input.ownerBranchId,
          targetBranchId: input.targetBranchId,
          mode: accountMode,
        });
      }

      const share = await tx.branchResourceShare.update({
        where: { id: existing.id },
        data: {
          accessLevel: input.accessLevel,
          customerAccountMode: accountMode,
          createdByUserId: input.createdByUserId,
        },
        include: {
          ownerBranch: { select: { id: true, name: true } },
          targetBranch: { select: { id: true, name: true } },
          user: { select: { id: true, fullName: true, email: true } },
        },
      });
      return { share, accountMode, action: "branch.resource_share.updated" as const };
    }

    const share = await tx.branchResourceShare.create({
      data: {
        businessId: input.businessId,
        ownerBranchId: input.ownerBranchId,
        targetBranchId: input.targetBranchId,
        resourceType: input.resourceType,
        resourceId,
        userId,
        accessLevel: input.accessLevel,
        customerAccountMode: accountMode,
        createdByUserId: input.createdByUserId,
      },
      include: {
        ownerBranch: { select: { id: true, name: true } },
        targetBranch: { select: { id: true, name: true } },
        user: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (isBroadCustomerRule) {
      await reconcileCustomerAccountMode(tx, {
        businessId: input.businessId,
        ownerBranchId: input.ownerBranchId,
        targetBranchId: input.targetBranchId,
        mode: accountMode,
      });
    }
    return { share, accountMode, action: "branch.resource_share.created" as const };
  }, { isolationLevel: "Serializable" });

  await recordAuditEvent({
    action: result.action,
    entityType: "BranchResourceShare",
    entityId: result.share.id,
    businessId: input.businessId,
    branchId: input.ownerBranchId,
    actorUserId: input.createdByUserId,
    metadata: {
      ownerBranchId: input.ownerBranchId,
      targetBranchId: input.targetBranchId,
      resourceType: input.resourceType,
      resourceId,
      userId,
      accessLevel: input.accessLevel,
      customerAccountMode: result.accountMode,
    },
  });
  return result.share;
}

export async function deleteBranchResourceShare(input: { businessId: string; id: string; actorUserId: string }) {
  const share = await prisma.$transaction(async (tx) => {
    const currentShare = await tx.branchResourceShare.findFirst({
      where: { id: input.id, businessId: input.businessId },
      select: {
        id: true,
        ownerBranchId: true,
        targetBranchId: true,
        resourceType: true,
        resourceId: true,
        userId: true,
        accessLevel: true,
        customerAccountMode: true,
      },
    });
    if (!currentShare) throw new AppError("Branch sharing rule not found", 404);

    // Recheck the actor's active account and owner-branch membership in the
    // same serializable transaction that removes the share.
    await assertCanManageOwnerBranch({
      businessId: input.businessId,
      ownerBranchId: currentShare.ownerBranchId,
      actorUserId: input.actorUserId,
    }, tx);

    if (
      currentShare.resourceType === "CUSTOMERS" &&
      !currentShare.resourceId &&
      !currentShare.userId &&
      currentShare.customerAccountMode === "SEPARATE"
    ) {
      await reconcileCustomerAccountMode(tx, {
        businessId: input.businessId,
        ownerBranchId: currentShare.ownerBranchId,
        targetBranchId: currentShare.targetBranchId,
        mode: "SHARED",
      });
    }
    await tx.branchResourceShare.delete({ where: { id: currentShare.id } });
    return currentShare;
  }, { isolationLevel: "Serializable" });

  await recordAuditEvent({
    action: "branch.resource_share.deleted",
    entityType: "BranchResourceShare",
    entityId: share.id,
    businessId: input.businessId,
    branchId: share.ownerBranchId,
    actorUserId: input.actorUserId,
    metadata: {
      ownerBranchId: share.ownerBranchId,
      targetBranchId: share.targetBranchId,
      resourceType: share.resourceType,
      resourceId: share.resourceId,
      userId: share.userId,
      accessLevel: share.accessLevel,
      customerAccountMode: share.customerAccountMode,
    },
  });
}
