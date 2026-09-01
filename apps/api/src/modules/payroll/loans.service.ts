import { LoanStatus, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import type { CreateLoanInput } from "./loans.validation.js";

const EMPLOYEE_ROLES: Role[] = [
  Role.BUSINESS_OWNER,
  Role.BRANCH_MANAGER,
  Role.STAFF,
];

type CreateLoanArgs = CreateLoanInput & {
  businessId: string;
  branchId: string;
};

type ScopedLoanArgs = {
  businessId: string;
  branchId: string;
  id: string;
};

type ListLoansArgs = {
  businessId: string;
  branchId: string;
  employeeId?: string;
  status?: LoanStatus;
};

type ActorLoanArgs = ScopedLoanArgs & {
  actorUserId: string;
};

export async function createLoan({
  businessId,
  branchId,
  employeeId,
  principalAmount,
  reason,
}: CreateLoanArgs) {
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

  return prisma.loan.create({
    data: {
      businessId,
      branchId,
      employeeId,
      principalAmount,
      outstandingAmount: principalAmount,
      reason: reason ?? null,
      status: LoanStatus.PENDING,
    },
  });
}

export async function getLoan({
  businessId,
  branchId,
  id,
}: ScopedLoanArgs) {
  const loan = await prisma.loan.findFirst({
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

  if (!loan) {
    throw new AppError("Loan not found", 404);
  }

  return loan;
}

export async function listLoans({
  businessId,
  branchId,
  employeeId,
  status,
}: ListLoansArgs) {
  return prisma.loan.findMany({
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

export async function approveLoan({
  businessId,
  branchId,
  id,
  actorUserId,
}: ActorLoanArgs) {
  const loan = await prisma.loan.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
  });

  if (!loan) {
    throw new AppError("Loan not found", 404);
  }

  if (loan.status !== LoanStatus.PENDING) {
    throw new AppError("Only pending loans can be approved", 400);
  }

  const approved = await prisma.loan.update({
    where: {
      id,
    },
    data: {
      status: LoanStatus.APPROVED,
      approvedAt: new Date(),
      approvedById: actorUserId,
    },
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "loan.approved",
    entityType: "LOAN",
    entityId: id,
    metadata: {
      employeeId: loan.employeeId,
      principalAmount: loan.principalAmount,
    },
  });

  return approved;
}

export async function rejectLoan({
  businessId,
  branchId,
  id,
  actorUserId,
  reason,
}: ActorLoanArgs & {
  reason?: string;
}) {
  const loan = await prisma.loan.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
  });

  if (!loan) {
    throw new AppError("Loan not found", 404);
  }

  if (loan.status !== LoanStatus.PENDING) {
    throw new AppError("Only pending loans can be rejected", 400);
  }

  const rejected = await prisma.loan.update({
    where: {
      id,
    },
    data: {
      status: LoanStatus.REJECTED,
    },
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "loan.rejected",
    entityType: "LOAN",
    entityId: id,
    metadata: {
      employeeId: loan.employeeId,
      principalAmount: loan.principalAmount,
      reason,
    },
  });

  return rejected;
}

export async function cancelLoan({
  businessId,
  branchId,
  id,
  actorUserId,
}: ActorLoanArgs) {
  const loan = await prisma.loan.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
  });

  if (!loan) {
    throw new AppError("Loan not found", 404);
  }

  if (
    loan.status !== LoanStatus.PENDING &&
    loan.status !== LoanStatus.APPROVED
  ) {
    throw new AppError(
      "Only pending or approved loans can be cancelled",
      400,
    );
  }

  const cancelled = await prisma.loan.update({
    where: {
      id,
    },
    data: {
      status: LoanStatus.CANCELLED,
    },
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "loan.cancelled",
    entityType: "LOAN",
    entityId: id,
    metadata: {
      employeeId: loan.employeeId,
      principalAmount: loan.principalAmount,
    },
  });

  return cancelled;
}
