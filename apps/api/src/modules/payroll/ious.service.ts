import { IOUStatus, Role } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";

const EMPLOYEE_ROLES: Role[] = [
  Role.BUSINESS_OWNER,
  Role.BRANCH_MANAGER,
  Role.STAFF,
];

type CreateIOUArgs = {
  businessId: string;
  branchId: string;
  employeeId: string;
  amount: number;
  reason?: string;
};

type ListIOUsArgs = {
  businessId: string;
  branchId: string;
  employeeId?: string;
  status?: IOUStatus;
};

type IOUActionArgs = {
  businessId: string;
  branchId: string;
  id: string;
  actorUserId: string;
};

export async function createIOU({
  businessId,
  branchId,
  employeeId,
  amount,
  reason,
}: CreateIOUArgs) {
  const employee = await prisma.user.findFirst({
    where: {
      id: employeeId,
      businessId,
      isActive: true,
      role: { in: EMPLOYEE_ROLES },
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

  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      businessId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!branch) {
    throw new AppError("Branch not found in this business", 404);
  }

  const iou = await prisma.iOU.create({
    data: {
      businessId,
      branchId,
      employeeId: employee.id,
      amount,
      outstandingAmount: amount,
      reason: reason ?? null,
      status: IOUStatus.PENDING,
    },
  });

  return iou;
}

export async function getIOU({
  businessId,
  branchId,
  id,
}: {
  businessId: string;
  branchId: string;
  id: string;
}) {
  const iou = await prisma.iOU.findFirst({
    where: {
      id,
      businessId,
      branchId,
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
      approvedBy: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  });

  if (!iou) {
    throw new AppError("IOU not found", 404);
  }

  return iou;
}

export async function listIOUs({
  businessId,
  branchId,
  employeeId,
  status,
}: ListIOUsArgs) {
  return prisma.iOU.findMany({
    where: {
      businessId,
      branchId,
      ...(employeeId ? { employeeId } : {}),
      ...(status ? { status } : {}),
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
      approvedBy: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function approveIOU({
  businessId,
  branchId,
  id,
  actorUserId,
}: IOUActionArgs) {
  const iou = await prisma.iOU.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
  });

  if (!iou) {
    throw new AppError("IOU not found", 404);
  }

  if (iou.status !== IOUStatus.PENDING) {
    throw new AppError("Only pending IOUs can be approved", 400);
  }

  const updated = await prisma.iOU.update({
    where: { id: iou.id },
    data: {
      status: IOUStatus.APPROVED,
      approvedAt: new Date(),
      approvedById: actorUserId,
    },
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "iou.approved",
    entityType: "IOU",
    entityId: updated.id,
    metadata: {
      employeeId: updated.employeeId,
      amount: updated.amount,
    },
  });

  return updated;
}

export async function rejectIOU({
  businessId,
  branchId,
  id,
  actorUserId,
  reason,
}: IOUActionArgs & { reason?: string }) {
  const iou = await prisma.iOU.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
  });

  if (!iou) {
    throw new AppError("IOU not found", 404);
  }

  if (iou.status !== IOUStatus.PENDING) {
    throw new AppError("Only pending IOUs can be rejected", 400);
  }

  const updated = await prisma.iOU.update({
    where: { id: iou.id },
    data: {
      status: IOUStatus.REJECTED,
    },
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "iou.rejected",
    entityType: "IOU",
    entityId: updated.id,
    metadata: {
      employeeId: updated.employeeId,
      amount: updated.amount,
      reason: reason ?? null,
    },
  });

  return updated;
}

export async function cancelIOU({
  businessId,
  branchId,
  id,
  actorUserId,
}: IOUActionArgs) {
  const iou = await prisma.iOU.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
  });

  if (!iou) {
    throw new AppError("IOU not found", 404);
  }

  if (
    iou.status !== IOUStatus.PENDING &&
    iou.status !== IOUStatus.APPROVED
  ) {
    throw new AppError(
      "Only pending or approved IOUs can be cancelled",
      400,
    );
  }

  const updated = await prisma.iOU.update({
    where: { id: iou.id },
    data: {
      status: IOUStatus.CANCELLED,
    },
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "iou.cancelled",
    entityType: "IOU",
    entityId: updated.id,
    metadata: {
      employeeId: updated.employeeId,
      amount: updated.amount,
    },
  });

  return updated;
}
