import {
  FinancialRepaymentMethod,
  FinancialRepaymentStatus,
  FinancialRepaymentType,
  IOUStatus,
  LoanStatus,
} from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";

type CreateRepaymentArgs = {
  businessId: string;
  branchId: string;
  employeeId: string;
  type: FinancialRepaymentType;
  iouId?: string;
  loanId?: string;
  amount: number;
  method: FinancialRepaymentMethod;
  reference?: string;
  note?: string;
  actorUserId: string;
};

type ListRepaymentsArgs = {
  businessId: string;
  branchId: string;
  employeeId?: string;
  type?: FinancialRepaymentType;
  status?: FinancialRepaymentStatus;
  iouId?: string;
  loanId?: string;
};

type ScopedRepaymentArgs = {
  businessId: string;
  branchId: string;
  id: string;
};

type VoidRepaymentArgs = ScopedRepaymentArgs & {
  actorUserId: string;
  reason?: string;
};

const REPAYABLE_IOU_STATUSES: IOUStatus[] = [
  IOUStatus.APPROVED,
  IOUStatus.PARTIALLY_DEDUCTED,
];

const REPAYABLE_LOAN_STATUSES: LoanStatus[] = [
  LoanStatus.APPROVED,
  LoanStatus.ACTIVE,
  LoanStatus.PARTIALLY_REPAID,
];

function assertRepaymentSource(
  type: FinancialRepaymentType,
  iouId?: string,
  loanId?: string,
) {
  if (type === FinancialRepaymentType.IOU) {
    if (!iouId || loanId) {
      throw new AppError(
        "An IOU repayment must reference exactly one IOU",
        400,
      );
    }
    return;
  }

  if (!loanId || iouId) {
    throw new AppError(
      "A loan repayment must reference exactly one loan",
      400,
    );
  }
}

export async function createRepayment({
  businessId,
  branchId,
  employeeId,
  type,
  iouId,
  loanId,
  amount,
  method,
  reference,
  note,
  actorUserId,
}: CreateRepaymentArgs) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError("Repayment amount must be a positive whole number", 400);
  }

  assertRepaymentSource(type, iouId, loanId);

  const employee = await prisma.user.findFirst({
    where: {
      id: employeeId,
      businessId,
      isActive: true,
    },
    select: {
      id: true,
      fullName: true,
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

  const result = await prisma.$transaction(async (tx) => {
    if (type === FinancialRepaymentType.IOU) {
      const repaymentIouId = iouId;
      if (!repaymentIouId) {
        throw new AppError("IOU repayment source is missing", 400);
      }

      const iou = await tx.iOU.findFirst({
        where: {
          id: repaymentIouId,
          businessId,
          branchId,
          employeeId,
        },
      });

      if (!iou) {
        throw new AppError("IOU not found", 404);
      }

      if (!REPAYABLE_IOU_STATUSES.includes(iou.status)) {
        throw new AppError(
          "This IOU is not currently eligible for repayment",
          400,
        );
      }

      if (iou.outstandingAmount <= 0) {
        throw new AppError("This IOU has no outstanding balance", 400);
      }

      if (amount > iou.outstandingAmount) {
        throw new AppError(
          "Repayment amount cannot exceed the outstanding IOU balance",
          400,
        );
      }

      const outstandingAmount = iou.outstandingAmount - amount;

      const repayment = await tx.financialRepayment.create({
        data: {
          businessId,
          branchId,
          employeeId,
          type,
          iouId: repaymentIouId,
          amount,
          method,
          reference: reference ?? null,
          note: note ?? null,
          createdById: actorUserId,
          status: FinancialRepaymentStatus.POSTED,
        },
      });

      await tx.iOU.update({
        where: { id: iou.id },
        data: {
          outstandingAmount,
          status:
            outstandingAmount === 0
              ? IOUStatus.FULLY_DEDUCTED
              : IOUStatus.PARTIALLY_DEDUCTED,
        },
      });

      return repayment;
    }

    const repaymentLoanId = loanId;
    if (!repaymentLoanId) {
      throw new AppError("Loan repayment source is missing", 400);
    }

    const loan = await tx.loan.findFirst({
      where: {
        id: repaymentLoanId,
        businessId,
        branchId,
        employeeId,
      },
    });

    if (!loan) {
      throw new AppError("Loan not found", 404);
    }

    if (!REPAYABLE_LOAN_STATUSES.includes(loan.status)) {
      throw new AppError(
        "This loan is not currently eligible for repayment",
        400,
      );
    }

    if (loan.outstandingAmount <= 0) {
      throw new AppError("This loan has no outstanding balance", 400);
    }

    if (amount > loan.outstandingAmount) {
      throw new AppError(
        "Repayment amount cannot exceed the outstanding loan balance",
        400,
      );
    }

    const outstandingAmount = loan.outstandingAmount - amount;

    const repayment = await tx.financialRepayment.create({
      data: {
        businessId,
        branchId,
        employeeId,
        type,
        loanId: repaymentLoanId,
        amount,
        method,
        reference: reference ?? null,
        note: note ?? null,
        createdById: actorUserId,
        status: FinancialRepaymentStatus.POSTED,
      },
    });

    await tx.loan.update({
      where: { id: loan.id },
      data: {
        outstandingAmount,
        status:
          outstandingAmount === 0
            ? LoanStatus.FULLY_REPAID
            : LoanStatus.PARTIALLY_REPAID,
      },
    });

    return repayment;
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "financial_repayment.posted",
    entityType: "FINANCIAL_REPAYMENT",
    entityId: result.id,
    metadata: {
      employeeId,
      type,
      iouId: iouId ?? null,
      loanId: loanId ?? null,
      amount,
      method,
    },
  });

  return result;
}

export async function listRepaymentSources({
  businessId,
  branchId,
  employeeId,
  type,
}: {
  businessId: string;
  branchId: string;
  employeeId: string;
  type: FinancialRepaymentType;
}) {
  if (type === FinancialRepaymentType.IOU) {
    const records = await prisma.iOU.findMany({
      where: {
        businessId,
        branchId,
        employeeId,
        status: { in: REPAYABLE_IOU_STATUSES },
        outstandingAmount: { gt: 0 },
      },
      select: {
        id: true,
        employeeId: true,
        outstandingAmount: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return records.map((record) => ({ ...record, type: FinancialRepaymentType.IOU }));
  }

  const records = await prisma.loan.findMany({
    where: {
      businessId,
      branchId,
      employeeId,
      status: { in: REPAYABLE_LOAN_STATUSES },
      outstandingAmount: { gt: 0 },
    },
    select: {
      id: true,
      employeeId: true,
      outstandingAmount: true,
      status: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return records.map((record) => ({ ...record, type: FinancialRepaymentType.LOAN }));
}

export async function getRepayment({
  businessId,
  branchId,
  id,
}: ScopedRepaymentArgs) {
  const repayment = await prisma.financialRepayment.findFirst({
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
      createdBy: {
        select: {
          id: true,
          fullName: true,
        },
      },
      iou: true,
      loan: true,
    },
  });

  if (!repayment) {
    throw new AppError("Repayment not found", 404);
  }

  return repayment;
}

export async function listRepayments({
  businessId,
  branchId,
  employeeId,
  type,
  status,
  iouId,
  loanId,
}: ListRepaymentsArgs) {
  return prisma.financialRepayment.findMany({
    where: {
      businessId,
      branchId,
      ...(employeeId ? { employeeId } : {}),
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(iouId ? { iouId } : {}),
      ...(loanId ? { loanId } : {}),
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
      createdBy: {
        select: {
          id: true,
          fullName: true,
        },
      },
      iou: {
        select: {
          id: true,
          amount: true,
          outstandingAmount: true,
          status: true,
        },
      },
      loan: {
        select: {
          id: true,
          principalAmount: true,
          outstandingAmount: true,
          status: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function voidRepayment({
  businessId,
  branchId,
  id,
  actorUserId,
  reason,
}: VoidRepaymentArgs) {
  if (!reason?.trim()) {
    throw new AppError("A reason is required for this action", 422);
  }

  const result = await prisma.$transaction(async (tx) => {
    const repayment = await tx.financialRepayment.findFirst({
      where: {
        id,
        businessId,
        branchId,
      },
    });

    if (!repayment) {
      throw new AppError("Repayment not found", 404);
    }

    if (repayment.status === FinancialRepaymentStatus.VOID) {
      throw new AppError("This repayment has already been voided", 400);
    }

    if (repayment.type === FinancialRepaymentType.IOU) {
      if (!repayment.iouId) {
        throw new AppError("Repayment has no IOU source", 500);
      }

      const iou = await tx.iOU.findFirst({
        where: {
          id: repayment.iouId,
          businessId,
          branchId,
          employeeId: repayment.employeeId,
        },
      });

      if (!iou) {
        throw new AppError("Related IOU not found", 404);
      }

      const outstandingAmount = iou.outstandingAmount + repayment.amount;

      if (outstandingAmount > iou.amount) {
        throw new AppError(
          "Voiding this repayment would exceed the original IOU amount",
          409,
        );
      }

      await tx.iOU.update({
        where: { id: iou.id },
        data: {
          outstandingAmount,
          status:
            outstandingAmount === iou.amount
              ? IOUStatus.APPROVED
              : IOUStatus.PARTIALLY_DEDUCTED,
        },
      });
    } else {
      if (!repayment.loanId) {
        throw new AppError("Repayment has no loan source", 500);
      }

      const loan = await tx.loan.findFirst({
        where: {
          id: repayment.loanId,
          businessId,
          branchId,
          employeeId: repayment.employeeId,
        },
      });

      if (!loan) {
        throw new AppError("Related loan not found", 404);
      }

      const outstandingAmount = loan.outstandingAmount + repayment.amount;

      if (outstandingAmount > loan.principalAmount) {
        throw new AppError(
          "Voiding this repayment would exceed the original loan amount",
          409,
        );
      }

      await tx.loan.update({
        where: { id: loan.id },
        data: {
          outstandingAmount,
          status:
            outstandingAmount === loan.principalAmount
              ? LoanStatus.APPROVED
              : LoanStatus.PARTIALLY_REPAID,
        },
      });
    }

    return tx.financialRepayment.update({
      where: { id: repayment.id },
      data: {
        status: FinancialRepaymentStatus.VOID,
      },
    });
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "financial_repayment.voided",
    entityType: "FINANCIAL_REPAYMENT",
    entityId: result.id,
    metadata: {
      reason: reason.trim(),
      employeeId: result.employeeId,
      type: result.type,
      iouId: result.iouId ?? null,
      loanId: result.loanId ?? null,
      amount: result.amount,
    },
  });

  return result;
}
