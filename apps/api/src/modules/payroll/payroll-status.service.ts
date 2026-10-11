import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

export type PayrollEmployeePaymentStatus =
  | "PAID"
  | "PARTIALLY_PAID"
  | "UNPAID";

export async function getPayrollStatus({
  businessId,
  branchId,
  payrollPeriodId,
}: {
  businessId: string;
  branchId: string;
  payrollPeriodId: string;
}) {
  const period = await prisma.payrollPeriod.findFirst({
    where: {
      id: payrollPeriodId,
      businessId,
      branchId,
    },
    include: {
      payrollRecords: {
        orderBy: {
          employeeId: "asc",
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
          deductions: true,
          payments: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },
    },
  });

  if (!period) {
    throw new AppError("Payroll period not found", 404);
  }

  const records = period.payrollRecords.map((record) => {
    const amountPaid = record.payments
      .filter((payment) => payment.status === "POSTED")
      .reduce((sum, payment) => sum + payment.amount, 0);

    const balance = Math.max(record.netPay - amountPaid, 0);

    const paymentStatus: PayrollEmployeePaymentStatus =
      amountPaid >= record.netPay
        ? "PAID"
        : amountPaid > 0
          ? "PARTIALLY_PAID"
          : "UNPAID";

    return {
      payrollRecordId: record.id,
      employee: record.employee,
      basicSalary: record.basicSalary,
      allowances: record.allowances,
      bonuses: record.bonuses,
      grossPay: record.grossPay,
      totalDeductions: record.totalDeductions,
      netPay: record.netPay,
      amountPaid,
      balance,
      paymentStatus,
      deductions: record.deductions,
      payments: record.payments,
    };
  });

  const totalGrossPay = records.reduce((sum, record) => sum + record.grossPay, 0);
  const totalDeductions = records.reduce((sum, record) => sum + record.totalDeductions, 0);
  const totalNetPay = records.reduce((sum, record) => sum + record.netPay, 0);
  const totalPaid = records.reduce((sum, record) => sum + record.amountPaid, 0);
  const totalBalance = records.reduce((sum, record) => sum + record.balance, 0);

  return {
    payrollPeriod: {
      id: period.id,
      businessId: period.businessId,
      branchId: period.branchId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      status: period.status,
      approvalStatus: period.approvalStatus,
      approvalSubmittedAt: period.approvalSubmittedAt,
      approvalSubmittedById: period.approvalSubmittedById,
      approvalDecidedAt: period.approvalDecidedAt,
      approvalDecidedById: period.approvalDecidedById,
      approvalReason: period.approvalReason,
    },
    summary: {
      employeeCount: records.length,
      paidCount: records.filter(
        (record) => record.paymentStatus === "PAID",
      ).length,
      partiallyPaidCount: records.filter(
        (record) => record.paymentStatus === "PARTIALLY_PAID",
      ).length,
      unpaidCount: records.filter(
        (record) => record.paymentStatus === "UNPAID",
      ).length,
      totalGrossPay,
      totalDeductions,
      totalNetPay,
      totalPaid,
      totalBalance,
    },
    records,
  };
}
