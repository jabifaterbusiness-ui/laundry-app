
import { Prisma, type PayrollPaymentStatus } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { requireReason } from "../../lib/reason.js";
import { AppError } from "../../middleware/error-handler.js";

async function runSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";

      if (!retryable || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error("Payroll payment transaction exhausted retries");
}

export interface CreatePayrollPaymentData {
  businessId: string;
  branchId: string;
  payrollRecordId: string;
  employeeId: string;
  amount: number;
  method: "CASH" | "TRANSFER" | "POS";
  reference?: string;
  note?: string;
  actorUserId: string;
}

export interface ListPayrollPaymentsParams {
  businessId: string;
  branchId: string;
  payrollRecordId?: string;
  employeeId?: string;
  status?: PayrollPaymentStatus;
  page: number;
  pageSize: number;
}

async function updatePayrollPeriodPaymentStatus(
  tx: Prisma.TransactionClient,
  payrollPeriodId: string,
  businessId: string,
  branchId: string,
) {
  const period = await tx.payrollPeriod.findFirst({
    where: {
      id: payrollPeriodId,
      businessId,
      branchId,
    },
  });

  if (!period) {
    throw new AppError("Payroll period not found", 404);
  }

  const records = await tx.payrollRecord.findMany({
    where: {
      businessId,
      branchId,
      payrollPeriodId,
    },
    include: {
      payments: {
        where: {
          status: "POSTED",
        },
        select: {
          amount: true,
        },
      },
    },
  });

  if (records.length === 0) {
    return period.status;
  }

  const fullyPaid = records.every((record) => {
    const amountPaid = record.payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    return amountPaid === record.netPay;
  });

  if (fullyPaid && period.status === "FINALIZED") {
    await tx.payrollPeriod.updateMany({
      where: {
        id: payrollPeriodId,
        businessId,
        branchId,
        status: "FINALIZED",
      },
      data: {
        status: "PAID",
      },
    });

    return "PAID" as const;
  }

  if (!fullyPaid && period.status === "PAID") {
    await tx.payrollPeriod.updateMany({
      where: {
        id: payrollPeriodId,
        businessId,
        branchId,
        status: "PAID",
      },
      data: {
        status: "FINALIZED",
      },
    });

    return "FINALIZED" as const;
  }

  return period.status;
}

export async function createPayrollPayment(
  data: CreatePayrollPaymentData,
) {
  const result = await runSerializableTransaction(async (tx) => {
    const record = await tx.payrollRecord.findFirst({
      where: {
        id: data.payrollRecordId,
        businessId: data.businessId,
        branchId: data.branchId,
        employeeId: data.employeeId,
      },
      include: {
        payrollPeriod: {
          select: {
            id: true,
            status: true,
          },
        },
        payments: {
          where: {
            status: "POSTED",
          },
          select: {
            amount: true,
          },
        },
      },
    });

    if (!record) {
      throw new AppError(
        "Payroll record not found for this employee and branch",
        404,
      );
    }

    if (record.payrollPeriod.status !== "FINALIZED") {
      throw new AppError(
        "Payroll payments can only be recorded for a finalized payroll period",
        400,
      );
    }

    if (record.netPay < 0) {
      throw new AppError(
        "Cannot pay a payroll record with an invalid net pay",
        400,
      );
    }

    const amountPaid = record.payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    const balance = record.netPay - amountPaid;

    if (balance <= 0) {
      throw new AppError(
        "This payroll record has already been fully paid",
        422,
      );
    }

    if (data.amount > balance) {
      throw new AppError(
        `Payroll payment amount cannot exceed the outstanding balance of ${balance}`,
        422,
      );
    }

    const payment = await tx.payrollPayment.create({
      data: {
        businessId: data.businessId,
        branchId: data.branchId,
        payrollRecordId: data.payrollRecordId,
        employeeId: data.employeeId,
        amount: data.amount,
        method: data.method,
        ...(data.reference !== undefined && {
          reference: data.reference,
        }),
        ...(data.note !== undefined && {
          note: data.note,
        }),
      },
    });

    const paymentStatus = await updatePayrollPeriodPaymentStatus(
      tx,
      record.payrollPeriod.id,
      data.businessId,
      data.branchId,
    );

    return {
      payment,
      amountPaid: amountPaid + data.amount,
      balance: balance - data.amount,
      payrollPeriodStatus: paymentStatus,
    };
  });

  await recordAuditEvent({
    businessId: data.businessId,
    branchId: data.branchId,
    actorUserId: data.actorUserId,
    action: "payroll_payment.created",
    entityType: "PAYROLL_PAYMENT",
    entityId: result.payment.id,
    metadata: {
      payrollPaymentId: result.payment.id,
      payrollRecordId: data.payrollRecordId,
      employeeId: data.employeeId,
      amount: data.amount,
      method: data.method,
      payrollPeriodStatus: result.payrollPeriodStatus,
    },
  });

  return result;
}

export async function voidPayrollPayment(
  id: string,
  businessId: string,
  branchId: string,
  actorUserId: string,
  rawReason?: unknown,
) {
  const reason = requireReason(rawReason);

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payrollPayment.findFirst({
      where: {
        id,
        businessId,
        branchId,
      },
      include: {
        payrollRecord: {
          select: {
            id: true,
            payrollPeriodId: true,
          },
        },
      },
    });

    if (!payment) {
      throw new AppError("Payroll payment not found", 404);
    }

    if (payment.status === "VOID") {
      throw new AppError("Payroll payment is already void", 422);
    }

    const voidedPayment = await tx.payrollPayment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: "VOID",
      },
    });

    const payrollPeriodStatus =
      await updatePayrollPeriodPaymentStatus(
        tx,
        payment.payrollRecord.payrollPeriodId,
        businessId,
        branchId,
      );

    return {
      payment: voidedPayment,
      payrollPeriodStatus,
    };
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "payroll_payment.voided",
    entityType: "PAYROLL_PAYMENT",
    entityId: result.payment.id,
    metadata: {
      payrollPaymentId: result.payment.id,
      payrollRecordId: result.payment.payrollRecordId,
      employeeId: result.payment.employeeId,
      amount: result.payment.amount,
      payrollPeriodStatus: result.payrollPeriodStatus,
      reason,
    },
  });

  return result;
}

export async function getPayrollPayment(
  id: string,
  businessId: string,
  branchId: string,
) {
  return prisma.payrollPayment.findFirst({
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
        },
      },
      payrollRecord: {
        select: {
          id: true,
          payrollPeriodId: true,
          basicSalary: true,
          grossPay: true,
          totalDeductions: true,
          netPay: true,
        },
      },
    },
  });
}

export async function listPayrollPayments(
  params: ListPayrollPaymentsParams,
) {
  const {
    businessId,
    branchId,
    payrollRecordId,
    employeeId,
    status,
    page,
    pageSize,
  } = params;

  const where: Prisma.PayrollPaymentWhereInput = {
    businessId,
    branchId,
    ...(payrollRecordId ? { payrollRecordId } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(status ? { status } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.payrollPayment.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        payrollRecord: {
          select: {
            id: true,
            payrollPeriodId: true,
            netPay: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payrollPayment.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
