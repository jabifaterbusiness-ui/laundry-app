import { Role } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";

import type { CreateCompensationInput } from "./compensation.validation.js";

const EMPLOYEE_ROLES: Role[] = [
  Role.BUSINESS_OWNER,
  Role.BRANCH_MANAGER,
  Role.STAFF,
];

type CreateCompensationArgs = CreateCompensationInput & {
  businessId: string;
  actorUserId: string;
};

type ListCompensationArgs = {
  businessId: string;
  employeeId?: string;
};

export async function createCompensation({
  businessId,
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
      role: {
        in: EMPLOYEE_ROLES,
      },
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
        employeeId,
        basicSalary,
        effectiveFrom,
        effectiveTo: future?.effectiveFrom ?? null,
      },
    });
  });

  await recordAuditEvent({
    businessId,
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
  id,
}: {
  businessId: string;
  id: string;
}) {
  const compensation = await prisma.employeeCompensation.findFirst({
    where: {
      id,
      businessId,
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
  employeeId,
}: ListCompensationArgs) {
  return prisma.employeeCompensation.findMany({
    where: {
      businessId,
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
  employeeId,
  effectiveDate = new Date(),
}: {
  businessId: string;
  employeeId: string;
  effectiveDate?: Date;
}) {
  const compensation = await prisma.employeeCompensation.findFirst({
    where: {
      businessId,
      employeeId,
      effectiveFrom: {
        lte: effectiveDate,
      },
      OR: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            gt: effectiveDate,
          },
        },
      ],
    },
    orderBy: {
      effectiveFrom: "desc",
    },
  });

  if (!compensation) {
    throw new AppError("No compensation record found for employee", 404);
  }

  return compensation;
}
