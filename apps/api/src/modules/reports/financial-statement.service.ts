import { prisma } from "../../lib/prisma.js";

export interface FinancialStatementScope {
  businessId: string;
  branchId: string;
}

export interface FinancialStatementDateRange {
  from: Date;
  to: Date;
}

/**
 * Monthly financial statement / P&L.
 *
 * Accounting treatment:
 *
 * Revenue:
 * - Issued invoices created within the statement period.
 * - Posted refunds created within the statement period reduce revenue.
 *
 * Expenses:
 * - Explicit expenses enter P&L only when APPROVED and recognizedAt
 *   falls within the statement period.
 * - Finalized payroll contributes gross payroll compensation.
 * - Payroll payments are settlement transactions and are therefore
 *   deliberately excluded from the expense calculation.
 * - IOU/loan deductions are not additional expenses.
 * - Loan principal is not revenue or operating expense.
 *
 * IMPORTANT:
 * The current Invoice model does not retain a historical "voidedAt"
 * accounting event. Therefore, revenue is based on invoices that are
 * currently ISSUED. A future accounting-event ledger can provide
 * immutable reversal history if required.
 */
export async function getFinancialStatement(
  scope: FinancialStatementScope,
  range: FinancialStatementDateRange,
) {
  if (range.from > range.to) {
    throw new Error("The statement start date must be before the end date");
  }

  const [
    invoices,
    refunds,
    recognizedExpenses,
    finalizedPayroll,
  ] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        status: "ISSUED",
        createdAt: {
          gte: range.from,
          lte: range.to,
        },
      },
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    }),

    prisma.payment.findMany({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        type: "REFUND",
        status: "POSTED",
        createdAt: {
          gte: range.from,
          lte: range.to,
        },
      },
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    }),

    prisma.expense.findMany({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        status: "APPROVED",
        recognizedAt: {
          gte: range.from,
          lte: range.to,
        },
      },
      select: {
        id: true,
        category: true,
        description: true,
        amount: true,
        incurredAt: true,
        recognizedAt: true,
      },
      orderBy: {
        recognizedAt: "asc",
      },
    }),

    prisma.payrollRecord.findMany({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        payrollPeriod: {
          status: "FINALIZED",
          periodStart: {
            gte: range.from,
          },
          periodEnd: {
            lte: range.to,
          },
        },
      },
      select: {
        id: true,
        employeeId: true,
        grossPay: true,
        payrollPeriod: {
          select: {
            id: true,
            periodStart: true,
            periodEnd: true,
          },
        },
      },
      orderBy: {
        payrollPeriod: {
          periodStart: "asc",
        },
      },
    }),
  ]);

  const grossRevenue = invoices.reduce(
    (sum, invoice) => sum + invoice.totalAmount,
    0,
  );

  const refundAmount = refunds.reduce(
    (sum, refund) => sum + refund.amount,
    0,
  );

  const netRevenue = grossRevenue - refundAmount;

  const explicitExpenses = recognizedExpenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );

  const salaryExpense = finalizedPayroll.reduce(
    (sum, record) => sum + record.grossPay,
    0,
  );

  const totalExpenses = explicitExpenses + salaryExpense;
  const profitOrLoss = netRevenue - totalExpenses;

  const expensesByCategory = new Map<string, number>();

  for (const expense of recognizedExpenses) {
    expensesByCategory.set(
      expense.category,
      (expensesByCategory.get(expense.category) ?? 0) + expense.amount,
    );
  }

  if (salaryExpense > 0) {
    expensesByCategory.set(
      "SALARY",
      (expensesByCategory.get("SALARY") ?? 0) + salaryExpense,
    );
  }

  return {
    period: {
      from: range.from,
      to: range.to,
    },

    revenue: {
      grossInvoiced: grossRevenue,
      refunds: refundAmount,
      netRevenue,
    },

    expenses: {
      explicit: explicitExpenses,
      salary: salaryExpense,
      total: totalExpenses,
      byCategory: Object.fromEntries(
        Array.from(expensesByCategory.entries()).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      ),
    },

    profitOrLoss: {
      amount: profitOrLoss,
      type: profitOrLoss >= 0 ? "PROFIT" : "LOSS",
    },

    detail: {
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.totalAmount,
        createdAt: invoice.createdAt,
      })),

      refunds: refunds.map((refund) => ({
        id: refund.id,
        invoiceId: refund.invoiceId,
        amount: refund.amount,
        createdAt: refund.createdAt,
      })),

      recognizedExpenses: recognizedExpenses.map((expense) => ({
        id: expense.id,
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        incurredAt: expense.incurredAt,
        recognizedAt: expense.recognizedAt,
      })),

      finalizedPayroll: finalizedPayroll.map((record) => ({
        id: record.id,
        employeeId: record.employeeId,
        grossPay: record.grossPay,
        periodStart: record.payrollPeriod.periodStart,
        periodEnd: record.payrollPeriod.periodEnd,
      })),
    },

    counts: {
      invoices: invoices.length,
      refunds: refunds.length,
      recognizedExpenses: recognizedExpenses.length,
      finalizedPayrollRecords: finalizedPayroll.length,
    },
  };
}
