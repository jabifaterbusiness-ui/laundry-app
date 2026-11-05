import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";


async function assertCanManageOwnerBranch(input: {
  businessId: string;
  ownerBranchId: string;
  actorUserId: string;
}) {
  const actor = await prisma.user.findFirst({
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

  const membership = await prisma.userBranch.findUnique({
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
  | "CUSTOMER_ACCOUNTS"
  | "DISCOUNTS"
  | "TAX_RULES"
  | "INVENTORY";

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

export async function saveBranchResourceShare(input: {
  businessId: string;
  ownerBranchId: string;
  targetBranchId: string;
  resourceType: BranchResourceType;
  resourceId?: string | null;
  userId?: string | null;
  accessLevel: "READ" | "EDIT";
  createdByUserId: string;
}) {
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
      case "CUSTOMER_ACCOUNTS":
        resourceBelongsToOwnerBranch = Boolean(await prisma.customerAccount.findFirst({
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
    }

    if (!resourceBelongsToOwnerBranch) {
      throw new AppError("The selected record does not belong to the chosen owner branch or cannot be shared individually", 404);
    }
  }
  const userId = input.userId ?? null;
  const existing = await prisma.branchResourceShare.findFirst({
    where: {
      businessId: input.businessId,
      ownerBranchId: input.ownerBranchId,
      targetBranchId: input.targetBranchId,
      resourceType: input.resourceType,
      resourceId,
      userId,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.branchResourceShare.update({
      where: { id: existing.id },
      data: { accessLevel: input.accessLevel, createdByUserId: input.createdByUserId },
      include: {
        ownerBranch: { select: { id: true, name: true } },
        targetBranch: { select: { id: true, name: true } },
        user: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  return prisma.branchResourceShare.create({
    data: {
      businessId: input.businessId,
      ownerBranchId: input.ownerBranchId,
      targetBranchId: input.targetBranchId,
      resourceType: input.resourceType,
      resourceId,
      userId,
      accessLevel: input.accessLevel,
      createdByUserId: input.createdByUserId,
    },
    include: {
      ownerBranch: { select: { id: true, name: true } },
      targetBranch: { select: { id: true, name: true } },
      user: { select: { id: true, fullName: true, email: true } },
    },
  });
}

export async function deleteBranchResourceShare(input: { businessId: string; id: string; actorUserId: string }) {
  const share = await prisma.branchResourceShare.findFirst({
    where: { id: input.id, businessId: input.businessId },
    select: { id: true, ownerBranchId: true },
  });
  if (!share) throw new AppError("Branch sharing rule not found", 404);
  await assertCanManageOwnerBranch({ businessId: input.businessId, ownerBranchId: share.ownerBranchId, actorUserId: input.actorUserId });
  await prisma.branchResourceShare.delete({ where: { id: share.id } });
}
