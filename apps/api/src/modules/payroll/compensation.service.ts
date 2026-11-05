import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";

import type { CreateCompensationInput } from "./compensation.validation.js";

type CreateCompensationArgs = CreateCompensationInput & {
  businessId: string;
  branchId: string;
  actorUserId: string;
};

type ListCompensationArgs = {
  businessId: string;
  branchId: string;
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
  const employee = await prisma.user.findFirst({
    where: {
      id: employeeId,
      businessId,
      isActive: true,
      branches: { some: { branchId } },
    },
    select: {
      id: true,
      fullName: true,
      role: true,
    },
  });

  if (!employee) {
    throw new AppError("Employee not found in this business", 404);
  }

  const compensation = await prisma.$transaction(async (tx) => {
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
  });

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
}: {
  businessId: string;
  branchId: string;
  id: string;
}) {
  const compensation = await prisma.employeeCompensation.findFirst({
    where: {
      id,
      businessId,
      OR: [{ branchId }, { branchId: null }],
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
  employeeId,
}: ListCompensationArgs) {
  return prisma.employeeCompensation.findMany({
    where: {
      businessId,
      OR: [{ branchId }, { branchId: null }],
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
  effectiveDate = new Date(),
}: {
  businessId: string;
  branchId: string;
  employeeId: string;
  effectiveDate?: Date;
}) {
  const effectiveWindow = {
    effectiveFrom: { lte: effectiveDate },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveDate } }],
  };
  const branchCompensation = await prisma.employeeCompensation.findFirst({
    where: { businessId, branchId, employeeId, ...effectiveWindow },
    orderBy: { effectiveFrom: "desc" },
  });
  const compensation = branchCompensation ?? await prisma.employeeCompensation.findFirst({
    where: { businessId, branchId: null, employeeId, ...effectiveWindow },
    orderBy: { effectiveFrom: "desc" },
  });

  if (!compensation) {
    throw new AppError("No compensation record found for employee", 404);
  }

  return compensation;
}
