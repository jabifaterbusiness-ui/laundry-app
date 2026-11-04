import { prisma } from "../../lib/prisma.js";
import {
  getBusinessFinancialStatement,
} from "./business-financial-statement.service.js";

export interface AnnualReportInput {
  businessId: string;
  branchId: string;
  year: number;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function monthKey(date: Date) {
  return date.getUTCMonth();
}

function emptyMonth(month: string) {
  return {
    month,
    grossRevenue: 0,
    refunds: 0,
    netRevenue: 0,
    explicitExpenses: 0,
    salaryExpense: 0,
    totalExpenses: 0,
    profitOrLoss: 0,
  };
}

export async function getAnnualReport(input: AnnualReportInput) {
  const { businessId, branchId, year } = input;

  const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      currencyCode: true,
    },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  const report = await getBusinessFinancialStatement(businessId, {
    from,
    to,
  }, branchId);

  const outstandingInvoices = await prisma.invoice.findMany({
    where: {
      businessId,
      branchId,
      status: "ISSUED",
      createdAt: {
        lte: to,
      },
    },
    select: {
      id: true,
      invoiceNumber: true,
      branchId: true,
      totalAmount: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const outstandingInvoiceIds = outstandingInvoices.map((invoice) => invoice.id);

  const payments =
    outstandingInvoiceIds.length > 0
      ? await prisma.payment.findMany({
          where: {
            businessId,
            branchId,
            invoiceId: {
              in: outstandingInvoiceIds,
            },
            status: "POSTED",
            createdAt: {
              lte: to,
            },
          },
          select: {
            invoiceId: true,
            amount: true,
            type: true,
          },
        })
      : [];

  const paidByInvoice = new Map<string, number>();

  for (const payment of payments) {
    const current = paidByInvoice.get(payment.invoiceId) ?? 0;

    paidByInvoice.set(
      payment.invoiceId,
      current + (payment.type === "REFUND" ? -payment.amount : payment.amount),
    );
  }

  const outstanding = outstandingInvoices
    .map((invoice) => {
      const collected = Math.max(
        0,
        Math.min(invoice.totalAmount, paidByInvoice.get(invoice.id) ?? 0),
      );

      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        branchId: invoice.branchId,
        date: invoice.createdAt,
        amount: invoice.totalAmount,
        collected,
        outstanding: Math.max(0, invoice.totalAmount - collected),
      };
    })
    .filter((invoice) => invoice.outstanding > 0);

  const annualInvoices = report.detail.invoices;

  const annualCollectedAmount = annualInvoices.reduce(
    (sum, invoice) =>
      sum +
      Math.max(
        0,
        Math.min(
          invoice.amount,
          paidByInvoice.get(invoice.id) ?? 0,
        ),
      ),
    0,
  );

  const annualInvoiceAmount = annualInvoices.reduce(
    (sum, invoice) => sum + invoice.amount,
    0,
  );

  const annualInvoiceIds = new Set(annualInvoices.map((invoice) => invoice.id));

  const annualOutstandingAmount = outstanding.reduce(
    (sum, invoice) =>
      sum + (annualInvoiceIds.has(invoice.invoiceId) ? invoice.outstanding : 0),
    0,
  );

  const annualCollectionRate =
    annualInvoiceAmount > 0
      ? (annualCollectedAmount / annualInvoiceAmount) * 100
      : 0;

  const monthly = MONTHS.map((month) => emptyMonth(month));

  for (const invoice of report.detail.invoices) {
    monthly[monthKey(new Date(invoice.createdAt))]!.grossRevenue +=
      invoice.amount;
  }

  for (const refund of report.detail.refunds) {
    monthly[monthKey(new Date(refund.createdAt))]!.refunds += refund.amount;
  }

  for (const expense of report.detail.recognizedExpenses) {
    monthly[monthKey(new Date(expense.recognizedAt ?? expense.incurredAt))]!
      .explicitExpenses += expense.amount;
  }

  for (const payroll of report.detail.finalizedPayroll) {
    monthly[monthKey(new Date(payroll.periodStart))]!.salaryExpense +=
      payroll.grossPay;
  }

  for (const bucket of monthly) {
    bucket.netRevenue = bucket.grossRevenue - bucket.refunds;
    bucket.totalExpenses =
      bucket.explicitExpenses + bucket.salaryExpense;
    bucket.profitOrLoss = bucket.netRevenue - bucket.totalExpenses;
  }

  const outstandingAmount = outstanding.reduce(
    (sum, invoice) => sum + invoice.outstanding,
    0,
  );

  const outstandingByYearMonth: Record<
    string,
    Record<
      string,
      {
        invoiceCount: number;
        outstandingAmount: number;
        invoices: Array<{
          invoiceId: string;
          invoiceNumber: string;
          amount: number;
          collected: number;
          outstanding: number;
          date: string;
        }>;
      }
    >
  > = {};

  for (const invoice of outstanding) {
    const date = new Date(invoice.date);
    const invoiceYear = String(date.getUTCFullYear());
    const invoiceMonth = MONTHS[date.getUTCMonth()]!;

    outstandingByYearMonth[invoiceYear] ??= {};
    outstandingByYearMonth[invoiceYear][invoiceMonth] ??= {
      invoiceCount: 0,
      outstandingAmount: 0,
      invoices: [],
    };

    const bucket = outstandingByYearMonth[invoiceYear][invoiceMonth]!;

    bucket.invoiceCount += 1;
    bucket.outstandingAmount += invoice.outstanding;
    bucket.invoices.push({
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      collected: invoice.collected,
      outstanding: invoice.outstanding,
      date: invoice.date.toISOString(),
    });
  }

  const managementInsights: string[] = [];

  if (report.profitOrLoss.amount >= 0) {
    managementInsights.push(
      `The business recorded a profit of ${report.profitOrLoss.amount.toLocaleString()} for ${year}.`,
    );
  } else {
    managementInsights.push(
      `The business recorded a loss of ${Math.abs(report.profitOrLoss.amount).toLocaleString()} for ${year}.`,
    );
  }

  if (outstandingAmount > 0) {
    managementInsights.push(
      `Outstanding invoices at year-end total ${outstandingAmount.toLocaleString()}.`,
    );
  } else {
    managementInsights.push(
      "There were no outstanding invoices at year-end.",
    );
  }

  if (annualCollectionRate < 70 && annualInvoiceAmount > 0) {
    managementInsights.push(
      `Collection performance was ${annualCollectionRate.toFixed(1)}%; management should review overdue balances and collection follow-up.`,
    );
  } else if (annualInvoiceAmount > 0) {
    managementInsights.push(
      `Collection performance was ${annualCollectionRate.toFixed(1)}%.`,
    );
  }

  const highestExpenseCategory = Object.entries(
    report.expenses.byCategory,
  ).sort(([, a], [, b]) => b - a)[0];

  if (highestExpenseCategory) {
    managementInsights.push(
      `The largest recognized expense category was ${highestExpenseCategory[0]} at ${highestExpenseCategory[1].toLocaleString()}.`,
    );
  }

  const lossMonths = monthly.filter((item) => item.profitOrLoss < 0);

  if (lossMonths.length > 0) {
    managementInsights.push(
      `${lossMonths.length} month${lossMonths.length === 1 ? "" : "s"} recorded a loss and should be reviewed for revenue and expense drivers.`,
    );
  }

  return {
    period: {
      year,
      from,
      to,
    },
    currencyCode: business.currencyCode,
    revenue: report.revenue,
    expenses: report.expenses,
    profitOrLoss: report.profitOrLoss,
    collection: {
      annualInvoiceCount: annualInvoices.length,
      annualInvoiceAmount,
      annualCollectedAmount,
      annualOutstandingAmount,
      collectionRate: annualCollectionRate,
      yearEndOutstandingAmount: outstandingAmount,
    },
    outstandingByYearMonth,
    monthlyTrend: monthly,
    branchSummary: report.branchSummary,
    managementInsights,
  };
}
