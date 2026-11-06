import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { assertBranchResourceWriteAccess, getBranchResourceScope } from "../branches/branch-resource-scope.service.js";

interface ListServicesParams {
  businessId: string;
  branchId: string;
  userId: string;
  status: "active" | "inactive" | "all";
  search?: string;
}

export interface CreateServiceData {
  businessId: string;
  branchId: string;
  name: string;
  pieces: number;
  unitPrice: number;
}

export interface UpdateServiceData {
  name?: string | undefined;
  pieces?: number | undefined;
  unitPrice?: number | undefined;
}

export async function listServices(params: ListServicesParams) {
  const { businessId, branchId, userId, status, search } = params;
  const scope = await getBranchResourceScope({ businessId, branchId, userId, resourceType: "SERVICES" });

  const where: Prisma.ServiceWhereInput = {
    businessId,
    OR: [{ ownerBranchId: null }, { ownerBranchId: { in: scope.ownerBranchIds } }, { id: { in: scope.resourceIds } }],
  };

  if (status !== "all") {
    where.isActive = status === "active";
  }

  if (search) {
    where.name = {
      contains: search,
      mode: "insensitive",
    };
  }

  return prisma.service.findMany({
    where,
    orderBy: { name: "asc" },
    include: { ownerBranch: { select: { id: true, name: true } } },
  });
}

export async function getServiceForBusiness(
  id: string,
  businessId: string,
  branchId: string,
  userId: string,
) {
  const scope = await getBranchResourceScope({ businessId, branchId, userId, resourceType: "SERVICES" });
  return prisma.service.findFirst({
    where: { id, businessId, OR: [{ ownerBranchId: null }, { ownerBranchId: { in: scope.ownerBranchIds } }, { id: { in: scope.resourceIds } }] },
    include: { ownerBranch: { select: { id: true, name: true } } },
  });
}

export async function createService(data: CreateServiceData) {
  return prisma.service.create({
    data: {
      businessId: data.businessId,
      ownerBranchId: data.branchId,
      name: data.name,
      pieces: data.pieces,
      unitPrice: data.unitPrice,
    },
    include: { ownerBranch: { select: { id: true, name: true } } },
  });
}

export async function updateService(
  id: string,
  businessId: string,
  branchId: string,
  userId: string,
  data: UpdateServiceData,
) {
  const existing = await getServiceForBusiness(id, businessId, branchId, userId);
  if (!existing) throw new AppError("Service not found", 404);
  await assertBranchResourceWriteAccess({ businessId, branchId, userId, resourceType: "SERVICES", ownerBranchId: existing.ownerBranchId, resourceId: id });
  const patch: Prisma.ServiceUpdateManyMutationInput = {};

  if (data.name !== undefined) {
    patch.name = data.name;
  }

  if (data.pieces !== undefined) {
    patch.pieces = data.pieces;
  }

  if (data.unitPrice !== undefined) {
    patch.unitPrice = data.unitPrice;
  }

  const result = await prisma.service.updateMany({
    where: {
      id,
      businessId,
      ownerBranchId: existing.ownerBranchId,
    },
    data: patch,
  });

  if (result.count === 0) {
    throw new AppError("Service not found", 404);
  }

  return getServiceForBusiness(id, businessId, branchId, userId);
}

export async function setServiceActiveStatus(
  id: string,
  businessId: string,
  branchId: string,
  userId: string,
  isActive: boolean,
) {
  const existing = await getServiceForBusiness(id, businessId, branchId, userId);
  if (!existing) throw new AppError("Service not found", 404);

  await assertBranchResourceWriteAccess({
    businessId,
    branchId,
    userId,
    resourceType: "SERVICES",
    ownerBranchId: existing.ownerBranchId,
    resourceId: id,
  });

  const result = await prisma.service.updateMany({
    where: {
      id,
      businessId,
      ownerBranchId: existing.ownerBranchId,
    },
    data: { isActive },
  });

  if (result.count === 0) {
    throw new AppError("Service not found", 404);
  }

  return getServiceForBusiness(id, businessId, branchId, userId);
}
