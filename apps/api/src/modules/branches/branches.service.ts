import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

interface ListBranchesParams {
  businessId: string;
  status: "active" | "inactive" | "all";
}

export async function listBranches({
  businessId,
  status,
}: ListBranchesParams) {
  const where: Prisma.BranchWhereInput = { businessId };

  if (status !== "all") {
    where.isActive = status === "active";
  }

  return prisma.branch.findMany({
    where,
    orderBy: { name: "asc" },
  });
}

export async function getBranchForBusiness(
  branchId: string,
  businessId: string,
) {
  return prisma.branch.findFirst({
    where: {
      id: branchId,
      businessId,
    },
  });
}

export interface CreateBranchData {
  businessId: string;
  name: string;
  address?: string;
}

export async function createBranch(data: CreateBranchData) {
  return prisma.branch.create({
    data: {
      businessId: data.businessId,
      name: data.name,
      address: data.address ?? null,
    },
  });
}

export interface UpdateBranchData {
  name?: string;
  address?: string;
}

export async function updateBranch(
  branchId: string,
  businessId: string,
  data: UpdateBranchData,
) {
  const patch: Prisma.BranchUpdateManyMutationInput = {};

  if (data.name !== undefined) {
    patch.name = data.name;
  }

  if (data.address !== undefined) {
    patch.address = data.address;
  }

  const result = await prisma.branch.updateMany({
    where: {
      id: branchId,
      businessId,
    },
    data: patch,
  });

  if (result.count === 0) {
    throw new AppError("Branch not found", 404);
  }

  return getBranchForBusiness(branchId, businessId);
}

export async function setBranchActiveStatus(
  branchId: string,
  businessId: string,
  isActive: boolean,
) {
  const result = await prisma.branch.updateMany({
    where: {
      id: branchId,
      businessId,
    },
    data: { isActive },
  });

  if (result.count === 0) {
    throw new AppError("Branch not found", 404);
  }

  return getBranchForBusiness(branchId, businessId);
}

export async function listBranchUsers(
  branchId: string,
  businessId: string,
) {
  const branch = await getBranchForBusiness(branchId, businessId);

  if (!branch) {
    throw new AppError("Branch not found", 404);
  }

  const memberships = await prisma.userBranch.findMany({
    where: {
      branchId,
      branch: {
        businessId,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          fullName: true,
          role: true,
          isActive: true,
          businessId: true,
        },
      },
    },
    orderBy: {
      user: {
        fullName: "asc",
      },
    },
  });

  return memberships.map(({ user }) => user);
}

export async function assignUserToBranch(
  branchId: string,
  businessId: string,
  userId: string,
) {
  const branch = await getBranchForBusiness(branchId, businessId);

  if (!branch) {
    throw new AppError("Branch not found", 404);
  }

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
      isActive: true,
      businessId: true,
    },
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!user.isActive) {
    throw new AppError("Cannot assign an inactive user to a branch", 409);
  }

  const existing = await prisma.userBranch.findUnique({
    where: {
      userId_branchId: {
        userId,
        branchId,
      },
    },
  });

  if (existing) {
    throw new AppError("User is already assigned to this branch", 409);
  }

  await prisma.userBranch.create({
    data: {
      userId,
      branchId,
    },
  });

  return user;
}

export async function removeUserFromBranch(
  branchId: string,
  businessId: string,
  userId: string,
) {
  const branch = await getBranchForBusiness(branchId, businessId);

  if (!branch) {
    throw new AppError("Branch not found", 404);
  }

  const result = await prisma.userBranch.deleteMany({
    where: {
      branchId,
      userId,
      user: {
        businessId,
      },
    },
  });

  if (result.count === 0) {
    throw new AppError("User is not assigned to this branch", 404);
  }
}
