import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

export type BranchResourceType =
  | "CUSTOMERS" | "SERVICES" | "CUSTOMER_PRICING"
  | "DISCOUNTS" | "TAX_RULES" | "INVENTORY";

export interface BranchResourceScope {
  ownerBranchIds: string[];
  resourceIds: string[];
  editableOwnerBranchIds: string[];
  editableResourceIds: string[];
}

type BranchShareDb = typeof prisma | Prisma.TransactionClient;

export async function getBranchResourceScope(input: {
  businessId: string;
  branchId: string;
  userId: string;
  resourceType: BranchResourceType;
}, db: BranchShareDb = prisma): Promise<BranchResourceScope> {
  const shares = await db.branchResourceShare.findMany({
    where: {
      businessId: input.businessId,
      targetBranchId: input.branchId,
      resourceType: input.resourceType,
      AND: [{ OR: [{ userId: null }, { userId: input.userId }] }],
    },
    select: { ownerBranchId: true, resourceId: true, accessLevel: true },
  });
  const broad = shares.filter((share) => !share.resourceId);
  const specific = shares.filter((share) => Boolean(share.resourceId));
  return {
    ownerBranchIds: [...new Set([input.branchId, ...broad.map((share) => share.ownerBranchId)])],
    resourceIds: specific.map((share) => share.resourceId!),
    editableOwnerBranchIds: [...new Set([input.branchId, ...broad.filter((share) => share.accessLevel === "EDIT").map((share) => share.ownerBranchId)])],
    editableResourceIds: specific.filter((share) => share.accessLevel === "EDIT").map((share) => share.resourceId!),
  };
}

export async function assertBranchResourceWriteAccess(input: {
  businessId: string;
  branchId: string;
  userId: string;
  resourceType: BranchResourceType;
  ownerBranchId: string | null;
  resourceId: string;
}, db: BranchShareDb = prisma) {
  if (!input.ownerBranchId || input.ownerBranchId === input.branchId) return;
  const share = await db.branchResourceShare.findFirst({
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
  if (!share) throw new AppError("This record is not shared with edit access to the selected branch", 403);
}
