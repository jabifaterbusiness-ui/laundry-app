import { PayrollApprovalStatus, PayrollDeductionType, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";

type RecordArgs = {
  businessId: string;
  branchId: string;
  payrollRecordId: string;
  actorUserId: string;
};

async function editableRecord(args: RecordArgs, tx: typeof prisma) {
  const record = await tx.payrollRecord.findFirst({
    where: {
      id: args.payrollRecordId,
      businessId: args.businessId,
      branchId: args.branchId,
    },
    include: {
      payrollPeriod: true,
      payments: { where: { status: "POSTED" }, select: { id: true } },
    },
  });

  if (!record) throw new AppError("Payroll record not found", 404);
  if (record.payrollPeriod.status !== "PROCESSING") {
    throw new AppError("Only processing payroll records can be changed", 400);
  }
  if (
    record.payrollPeriod.approvalStatus === PayrollApprovalStatus.PENDING ||
    record.payrollPeriod.approvalStatus === PayrollApprovalStatus.APPROVED
  ) {
    throw new AppError("Payroll cannot be changed while approval is pending or approved", 400);
  }

  return record;
}

export async function updatePayrollEarnings(
  args: RecordArgs & {
    basicSalary: number;
    allowances: number;
    bonuses: number;
  },
) {
  const result = await prisma.$transaction(async (tx) => {
    const record = await editableRecord(args, tx as typeof prisma);

    if (record.payments.length > 0) {
      throw new AppError("Earnings cannot be edited after a payroll payment has been posted", 400);
    }

    const grossPay = args.basicSalary + args.allowances + args.bonuses;

    if (grossPay < record.totalDeductions) {
      throw new AppError(
        `Gross pay cannot be less than existing deductions of ${record.totalDeductions}`,
        422,
      );
    }

    const updated = await tx.payrollRecord.update({
      where: { id: record.id },
      data: {
        basicSalary: args.basicSalary,
        allowances: args.allowances,
        bonuses: args.bonuses,
        grossPay,
        netPay: Math.max(0, grossPay - record.totalDeductions),
      },
    });

    return { before: record, after: updated };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await recordAuditEvent({
    businessId: args.businessId,
    branchId: args.branchId,
    actorUserId: args.actorUserId,
    action: "payroll_record.earnings_updated",
    entityType: "PAYROLL_RECORD",
    entityId: args.payrollRecordId,
    metadata: {
      basicSalary: result.after.basicSalary,
      allowances: result.after.allowances,
      bonuses: result.after.bonuses,
      grossPay: result.after.grossPay,
      previousGrossPay: result.before.grossPay,
    },
  });

  return result.after;
}

export async function createOtherPayrollDeduction(
  args: RecordArgs & { amount: number; reason: string },
) {
  const reason = args.reason.trim();
  if (!reason || reason.length > 1000) {
    throw new AppError("A deduction reason of 1–1000 characters is required", 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    const record = await editableRecord(args, tx as typeof prisma);

    if (record.payments.length > 0) {
      throw new AppError(
        "Deductions cannot be added after a payroll payment has been posted",
        400,
      );
    }

    const availablePay = Math.max(0, record.grossPay - record.totalDeductions);

    if (args.amount > availablePay) {
      throw new AppError(
        `Deduction exceeds available pay of ${availablePay}`,
        422,
      );
    }

    const deduction = await tx.payrollDeduction.create({
      data: {
        businessId: args.businessId,
        branchId: args.branchId,
        payrollRecordId: record.id,
        type: PayrollDeductionType.OTHER,
        amount: args.amount,
        description: reason,
      },
    });

    const totalDeductions = record.totalDeductions + args.amount;
    const updated = await tx.payrollRecord.update({
      where: { id: record.id },
      data: {
        totalDeductions,
        netPay: Math.max(0, record.grossPay - totalDeductions),
      },
    });

    return { deduction, record: updated };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await recordAuditEvent({
    businessId: args.businessId,
    branchId: args.branchId,
    actorUserId: args.actorUserId,
    action: "payroll_record.other_deduction_created",
    entityType: "PAYROLL_RECORD",
    entityId: args.payrollRecordId,
    metadata: {
      deductionId: result.deduction.id,
      amount: args.amount,
      reason,
      totalDeductions: result.record.totalDeductions,
      netPay: result.record.netPay,
    },
  });

  return result;
}
