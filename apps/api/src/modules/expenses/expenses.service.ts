import { ExpenseCategory, ExpenseStatus } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";

type ExpenseScope = {
  businessId: string;
  branchId: string;
};

type CreateExpenseArgs = ExpenseScope & {
  actorUserId: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  incurredAt: Date;
  reference?: string;
  note?: string;
};

type ExpenseActionArgs = ExpenseScope & {
  id: string;
  actorUserId: string;
};

async function assertActiveBranch(scope: ExpenseScope) {
  const branch = await prisma.branch.findFirst({
    where: {
      id: scope.branchId,
      businessId: scope.businessId,
      isActive: true,
    },
    select: { id: true },
  });

  if (!branch) {
    throw new AppError("Branch not found in this business", 404);
  }
}

export async function createExpense({
  businessId,
  branchId,
  actorUserId,
  category,
  description,
  amount,
  incurredAt,
  reference,
  note,
}: CreateExpenseArgs) {
  await assertActiveBranch({ businessId, branchId });

  const expense = await prisma.expense.create({
    data: {
      businessId,
      branchId,
      category,
      status: ExpenseStatus.PENDING,
      description: description.trim(),
      amount,
      incurredAt,
      createdById: actorUserId,
      reference: reference?.trim() || null,
      note: note?.trim() || null,
    },
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "expense.created",
    entityType: "Expense",
    entityId: expense.id,
    metadata: {
      category: expense.category,
      amount: expense.amount,
    },
  });

  return expense;
}

export async function getExpense({
  businessId,
  branchId,
  id,
}: ExpenseScope & { id: string }) {
  const expense = await prisma.expense.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      approvedBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      recognizedBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  if (!expense) {
    throw new AppError("Expense not found", 404);
  }

  return expense;
}

export async function listExpenses(
  scope: ExpenseScope,
  input?: {
    category?: ExpenseCategory;
    status?: ExpenseStatus;
  },
) {
  return prisma.expense.findMany({
    where: {
      businessId: scope.businessId,
      branchId: scope.branchId,
      ...(input?.category ? { category: input.category } : {}),
      ...(input?.status ? { status: input.status } : {}),
    },
    include: {
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      approvedBy: {
        select: {
          id: true,
          fullName: true,
        },
      },
      recognizedBy: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
    orderBy: [
      { incurredAt: "desc" },
      { createdAt: "desc" },
    ],
  });
}

export async function approveExpense({
  businessId,
  branchId,
  id,
  actorUserId,
}: ExpenseActionArgs) {
  const expense = await prisma.expense.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
  });

  if (!expense) {
    throw new AppError("Expense not found", 404);
  }

  if (expense.status !== ExpenseStatus.PENDING) {
    throw new AppError("Only pending expenses can be approved", 400);
  }

  const updated = await prisma.expense.update({
    where: { id: expense.id },
    data: {
      status: ExpenseStatus.APPROVED,
      approvedAt: new Date(),
      approvedById: actorUserId,
    },
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "expense.approved",
    entityType: "Expense",
    entityId: updated.id,
    metadata: {
      category: updated.category,
      amount: updated.amount,
      before: { status: expense.status },
      after: { status: updated.status },
    },
  });

  return updated;
}

export async function rejectExpense({
  businessId,
  branchId,
  id,
  actorUserId,
  reason,
}: ExpenseActionArgs & { reason?: string }) {
  const expense = await prisma.expense.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
  });

  if (!expense) {
    throw new AppError("Expense not found", 404);
  }

  if (expense.status !== ExpenseStatus.PENDING) {
    throw new AppError("Only pending expenses can be rejected", 400);
  }

  const updated = await prisma.expense.update({
    where: { id: expense.id },
    data: {
      status: ExpenseStatus.REJECTED,
      note: reason?.trim()
        ? expense.note
          ? `${expense.note}\nRejection reason: ${reason.trim()}`
          : `Rejection reason: ${reason.trim()}`
        : expense.note,
    },
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "expense.rejected",
    entityType: "Expense",
    entityId: updated.id,
    metadata: {
      category: updated.category,
      amount: updated.amount,
      reason: reason ?? null,
      before: {
        status: expense.status,
        note: expense.note,
      },
      after: {
        status: updated.status,
        note: updated.note,
      },
    },
  });

  return updated;
}

export async function recognizeExpense({
  businessId,
  branchId,
  id,
  actorUserId,
}: ExpenseActionArgs) {
  const expense = await prisma.expense.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
  });

  if (!expense) {
    throw new AppError("Expense not found", 404);
  }

  if (expense.status !== ExpenseStatus.APPROVED) {
    throw new AppError("Only approved expenses can be recognized", 400);
  }

  if (expense.recognizedAt) {
    throw new AppError("Expense has already been recognized", 409);
  }

  const updated = await prisma.expense.update({
    where: { id: expense.id },
    data: {
      recognizedAt: new Date(),
      recognizedById: actorUserId,
    },
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "expense.recognized",
    entityType: "Expense",
    entityId: updated.id,
    metadata: {
      category: updated.category,
      amount: updated.amount,
      before: {
        recognizedAt: expense.recognizedAt,
      },
      after: {
        recognizedAt: updated.recognizedAt,
      },
    },
  });

  return updated;
}

export async function voidExpense({
  businessId,
  branchId,
  id,
  actorUserId,
}: ExpenseActionArgs) {
  const expense = await prisma.expense.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
  });

  if (!expense) {
    throw new AppError("Expense not found", 404);
  }

  if (
    expense.status !== ExpenseStatus.APPROVED &&
    expense.status !== ExpenseStatus.REJECTED &&
    expense.status !== ExpenseStatus.PENDING
  ) {
    throw new AppError("Expense is already void", 400);
  }

  const updated = await prisma.expense.update({
    where: { id: expense.id },
    data: {
      status: ExpenseStatus.VOID,
    },
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "expense.voided",
    entityType: "Expense",
    entityId: updated.id,
    metadata: {
      category: updated.category,
      amount: updated.amount,
      before: {
        status: expense.status,
      },
      after: {
        status: updated.status,
      },
      wasRecognized: Boolean(expense.recognizedAt),
    },
  });

  return updated;
}
