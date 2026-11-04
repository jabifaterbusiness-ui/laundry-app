import { prisma } from "../../lib/prisma.js";

export interface BusinessFinancialStatementDateRange {
  from: Date;
  to: Date;
}

/**
 * Financial statement / P&L. When branchId is supplied, every source query
 * is restricted to that branch; omitting it is reserved for explicitly
 * authorized consolidated reporting.
 *
 * Accounting treatment:
 *
 * Revenue:
 * - Currently ISSUED invoices created during the statement period.
 * - POSTED refunds created during the statement period reduce revenue.
 *
 * Expenses:
 * - Explicit expenses enter P&L only when APPROVED and recognizedAt
 *   falls within the statement period.
 * - Finalized payroll contributes gross compensation.
 * - Payroll payments are settlement transactions and are not additional
 *   expenses.
 * - IOU/loan deductions are not additional expenses.
 * - Loan principal is not revenue or operating expense.
 *
 * IMPORTANT:
 * Invoice currently has no immutable historical void event. Therefore,
 * revenue is based on invoices currently marked ISSUED. If invoice voiding
 * is introduced later, an accounting-event/reversal mechanism must be
 * introduced before historical P&L can safely depend on it.
 */
export async function getBusinessFinancialStatement(
  businessId: string,
  range: BusinessFinancialStatementDateRange,
  branchId?: string,
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
        businessId,
        ...(branchId ? { branchId } : {}),
        status: "ISSUED",
        createdAt: {
          gte: range.from,
          lte: range.to,
        },
      },
      select: {
        id: true,
        branchId: true,
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
        businessId,
        ...(branchId ? { branchId } : {}),
        type: "REFUND",
        status: "POSTED",
        createdAt: {
          gte: range.from,
          lte: range.to,
        },
      },
      select: {
        id: true,
        branchId: true,
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
        businessId,
        ...(branchId ? { branchId } : {}),
        status: "APPROVED",
        recognizedAt: {
          gte: range.from,
          lte: range.to,
        },
      },
      select: {
        id: true,
        branchId: true,
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
        businessId,
        ...(branchId ? { branchId } : {}),
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
        branchId: true,
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

  const branchTotals = new Map<
    string,
    {
      revenue: number;
      refunds: number;
      expenses: number;
      salary: number;
      profitOrLoss: number;
    }
  >();

  function getBranchTotals(branchId: string) {
    const existing = branchTotals.get(branchId);

    if (existing) {
      return existing;
    }

    const created = {
      revenue: 0,
      refunds: 0,
      expenses: 0,
      salary: 0,
      profitOrLoss: 0,
    };

    branchTotals.set(branchId, created);
    return created;
  }

  for (const invoice of invoices) {
    getBranchTotals(invoice.branchId).revenue += invoice.totalAmount;
  }

  for (const refund of refunds) {
    getBranchTotals(refund.branchId).refunds += refund.amount;
  }

  for (const expense of recognizedExpenses) {
    getBranchTotals(expense.branchId).expenses += expense.amount;
  }

  for (const payroll of finalizedPayroll) {
    getBranchTotals(payroll.branchId).salary += payroll.grossPay;
  }

  for (const totals of branchTotals.values()) {
    totals.profitOrLoss =
      totals.revenue -
      totals.refunds -
      totals.expenses -
      totals.salary;
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

    branchSummary: Object.fromEntries(
      Array.from(branchTotals.entries()).map(([branchId, totals]) => [
        branchId,
        {
          revenue: totals.revenue,
          refunds: totals.refunds,
          netRevenue: totals.revenue - totals.refunds,
          expenses: totals.expenses,
          salary: totals.salary,
          totalExpenses: totals.expenses + totals.salary,
          profitOrLoss: totals.profitOrLoss,
        },
      ]),
    ),

    detail: {
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        branchId: invoice.branchId,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.totalAmount,
        createdAt: invoice.createdAt,
      })),

      refunds: refunds.map((refund) => ({
        id: refund.id,
        branchId: refund.branchId,
        invoiceId: refund.invoiceId,
        amount: refund.amount,
        createdAt: refund.createdAt,
      })),

      recognizedExpenses: recognizedExpenses.map((expense) => ({
        id: expense.id,
        branchId: expense.branchId,
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        incurredAt: expense.incurredAt,
        recognizedAt: expense.recognizedAt,
      })),

      finalizedPayroll: finalizedPayroll.map((record) => ({
        id: record.id,
        branchId: record.branchId,
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
      branches: branchTotals.size,
    },
  };
}
