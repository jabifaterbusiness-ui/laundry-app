import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { getBranchResourceScope } from "../branches/branch-resource-scope.service.js";

import type { CreateCompensationInput } from "./compensation.validation.js";

type CreateCompensationArgs = CreateCompensationInput & {
  businessId: string;
  branchId: string;
  actorUserId: string;
};

type ListCompensationArgs = {
  businessId: string;
  branchId: string;
  userId: string;
  employeeId?: string;
};

export async function createCompensation({
  businessId,
  branchId,
  employeeId,
  basicSalary,
  effectiveFrom,
  actorUserId,
}: CreateCompensationArgs) {
  const compensation = await prisma.$transaction(async (tx) => {
    // Revalidate the employee's active business and branch membership inside
    // the same serializable transaction as the compensation write. This
    // prevents a stale pre-transaction membership check from authorizing it.
    const employee = await tx.user.findFirst({
      where: {
        id: employeeId,
        businessId,
        isActive: true,
        deletedAt: null,
        branches: { some: { branchId } },
      },
      select: { id: true },
    });

    if (!employee) {
      throw new AppError("Employee not found in this business", 404);
    }

    const current = await tx.employeeCompensation.findFirst({
      where: {
        businessId,
        branchId,
        employeeId,
        effectiveFrom: {
          lte: effectiveFrom,
        },
        OR: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              gt: effectiveFrom,
            },
          },
        ],
      },
      orderBy: {
        effectiveFrom: "desc",
      },
    });

    if (current) {
      if (current.effectiveFrom.getTime() === effectiveFrom.getTime()) {
        throw new AppError(
          "A compensation record already exists for this effective date",
          400,
        );
      }

      await tx.employeeCompensation.update({
        where: {
          id: current.id,
        },
        data: {
          effectiveTo: effectiveFrom,
        },
      });
    }

    const future = await tx.employeeCompensation.findFirst({
      where: {
        businessId,
        branchId,
        employeeId,
        effectiveFrom: {
          gt: effectiveFrom,
        },
      },
      orderBy: {
        effectiveFrom: "asc",
      },
    });

    if (future && effectiveFrom >= future.effectiveFrom) {
      throw new AppError(
        "Effective date overlaps an existing compensation record",
        400,
      );
    }

    return tx.employeeCompensation.create({
      data: {
        businessId,
        branchId,
        employeeId,
        basicSalary,
        effectiveFrom,
        effectiveTo: future?.effectiveFrom ?? null,
      },
    });
  }, { isolationLevel: "Serializable" });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "employee_compensation.created",
    entityType: "EMPLOYEE_COMPENSATION",
    entityId: compensation.id,
    metadata: {
      employeeId,
      basicSalary,
      effectiveFrom: effectiveFrom.toISOString(),
    },
  });

  return compensation;
}

export async function getCompensation({
  businessId,
  branchId,
  id,
  userId,
}: {
  businessId: string;
  branchId: string;
  id: string;
  userId: string;
}) {
  const scope = await getBranchResourceScope({
    businessId,
    branchId,
    userId,
    resourceType: "PAYROLL_COMPENSATION",
  });
  const compensation = await prisma.employeeCompensation.findFirst({
    where: {
      id,
      businessId,
      OR: [
        { branchId: { in: scope.ownerBranchIds } },
        { id: { in: scope.resourceIds } },
      ],
      employee: { is: { branches: { some: { branchId } } } },
    },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
      },
    },
  });

  if (!compensation) {
    throw new AppError("Compensation record not found", 404);
  }

  return compensation;
}

export async function listCompensation({
  businessId,
  branchId,
  userId,
  employeeId,
}: ListCompensationArgs) {
  const scope = await getBranchResourceScope({
    businessId,
    branchId,
    userId,
    resourceType: "PAYROLL_COMPENSATION",
  });
  return prisma.employeeCompensation.findMany({
    where: {
      businessId,
      OR: [
        { branchId: { in: scope.ownerBranchIds } },
        { id: { in: scope.resourceIds } },
      ],
      employee: { is: { branches: { some: { branchId } } } },
      ...(employeeId ? { employeeId } : {}),
    },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: [
      {
        employeeId: "asc",
      },
      {
        effectiveFrom: "desc",
      },
    ],
  });
}

export async function getCurrentCompensation({
  businessId,
  branchId,
  employeeId,
  userId,
  effectiveDate = new Date(),
}: {
  businessId: string;
  branchId: string;
  employeeId: string;
  userId: string;
  effectiveDate?: Date;
}) {
  const scope = await getBranchResourceScope({
    businessId,
    branchId,
    userId,
    resourceType: "PAYROLL_COMPENSATION",
  });
  const effectiveWindow = {
    effectiveFrom: { lte: effectiveDate },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveDate } }],
  };
  const compensation = await prisma.employeeCompensation.findFirst({
    where: {
      businessId,
      employeeId,
      AND: [
        {
          OR: [
            { branchId: { in: scope.ownerBranchIds } },
            { id: { in: scope.resourceIds } },
          ],
        },
        effectiveWindow,
      ],
      employee: { is: { branches: { some: { branchId } } } },
    },
    orderBy: { effectiveFrom: "desc" },
  });

  if (!compensation) {
    throw new AppError("No compensation record found for employee", 404);
  }

  return compensation;
}
