import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

interface ListServicesParams {
  businessId: string;
  status: "active" | "inactive" | "all";
  search?: string;
}

export interface CreateServiceData {
  businessId: string;
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
  const { businessId, status, search } = params;

  const where: Prisma.ServiceWhereInput = {
    businessId,
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
  });
}

export async function getServiceForBusiness(
  id: string,
  businessId: string,
) {
  return prisma.service.findFirst({
    where: {
      id,
      businessId,
    },
  });
}

export async function createService(data: CreateServiceData) {
  return prisma.service.create({
    data: {
      businessId: data.businessId,
      name: data.name,
      pieces: data.pieces,
      unitPrice: data.unitPrice,
    },
  });
}

export async function updateService(
  id: string,
  businessId: string,
  data: UpdateServiceData,
) {
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
    },
    data: patch,
  });

  if (result.count === 0) {
    throw new AppError("Service not found", 404);
  }

  return getServiceForBusiness(id, businessId);
}

export async function setServiceActiveStatus(
  id: string,
  businessId: string,
  isActive: boolean,
) {
  const result = await prisma.service.updateMany({
    where: {
      id,
      businessId,
    },
    data: {
      isActive,
    },
  });

  if (result.count === 0) {
    throw new AppError("Service not found", 404);
  }

  return getServiceForBusiness(id, businessId);
}
