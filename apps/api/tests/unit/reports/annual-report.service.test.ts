import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  businessFindUnique: vi.fn(),
  invoiceFindMany: vi.fn(),
  paymentFindMany: vi.fn(),
}));

const businessReportMock = vi.hoisted(() => ({
  getBusinessFinancialStatement: vi.fn(),
}));

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      findUnique: mocks.businessFindUnique,
    },
    invoice: {
      findMany: mocks.invoiceFindMany,
    },
    payment: {
      findMany: mocks.paymentFindMany,
    },
  },
}));

vi.mock(
  "../../../src/modules/reports/business-financial-statement.service.js",
  () => businessReportMock,
);

import { getAnnualReport } from "../../../src/modules/reports/annual-report.service.js";

describe("getAnnualReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.businessFindUnique.mockResolvedValue({
      id: "business-1",
      currencyCode: "NGN",
    });

    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: "old-invoice",
        invoiceNumber: "000001",
        branchId: "branch-1",
        totalAmount: 50000,
        createdAt: new Date("2025-12-15T10:00:00.000Z"),
      },
      {
        id: "annual-invoice",
        invoiceNumber: "000002",
        branchId: "branch-1",
        totalAmount: 100000,
        createdAt: new Date("2026-06-10T10:00:00.000Z"),
      },
    ]);

    mocks.paymentFindMany.mockResolvedValue([
      {
        invoiceId: "old-invoice",
        amount: 20000,
        type: "PAYMENT",
      },
      {
        invoiceId: "annual-invoice",
        amount: 60000,
        type: "PAYMENT",
      },
    ]);

    businessReportMock.getBusinessFinancialStatement.mockResolvedValue({
      period: {
        from: new Date("2026-01-01T00:00:00.000Z"),
        to: new Date("2026-12-31T23:59:59.999Z"),
      },
      revenue: {
        grossInvoiced: 100000,
        refunds: 5000,
        netRevenue: 95000,
      },
      expenses: {
        explicit: 20000,
        salary: 30000,
        total: 50000,
        byCategory: {
          RENT: 20000,
          SALARY: 30000,
        },
      },
      profitOrLoss: {
        amount: 45000,
        type: "PROFIT",
      },
      branchSummary: {},
      detail: {
        invoices: [
          {
            id: "annual-invoice",
            branchId: "branch-1",
            invoiceNumber: "000002",
            amount: 100000,
            createdAt: new Date("2026-06-10T10:00:00.000Z"),
          },
        ],
        refunds: [
          {
            id: "refund-1",
            branchId: "branch-1",
            invoiceId: "annual-invoice",
            amount: 5000,
            createdAt: new Date("2026-06-15T10:00:00.000Z"),
          },
        ],
        recognizedExpenses: [
          {
            id: "expense-1",
            branchId: "branch-1",
            category: "RENT",
            description: "Rent",
            amount: 20000,
            incurredAt: new Date("2026-06-01T10:00:00.000Z"),
            recognizedAt: new Date("2026-06-02T10:00:00.000Z"),
          },
        ],
        finalizedPayroll: [
          {
            id: "payroll-1",
            branchId: "branch-1",
            employeeId: "employee-1",
            grossPay: 30000,
            periodStart: new Date("2026-06-01T00:00:00.000Z"),
            periodEnd: new Date("2026-06-30T23:59:59.999Z"),
          },
        ],
      },
    });
  });

  it("returns annual financial, collection and trend data", async () => {
    const report = await getAnnualReport({
      businessId: "business-1",
      branchId: "branch-1",
      year: 2026,
    });

    expect(report.period.year).toBe(2026);
    expect(report.revenue.netRevenue).toBe(95000);
    expect(report.expenses.total).toBe(50000);
    expect(report.profitOrLoss.amount).toBe(45000);

    expect(report.collection.annualInvoiceCount).toBe(1);
    expect(report.collection.annualInvoiceAmount).toBe(100000);
    expect(report.collection.annualCollectedAmount).toBe(60000);
    expect(report.collection.collectionRate).toBe(60);
    expect(report.collection.yearEndOutstandingAmount).toBe(70000);

    expect(
      report.outstandingByYearMonth["2025"]?.December?.invoices[0]
        ?.outstanding,
    ).toBe(30000);

    expect(
      report.outstandingByYearMonth["2026"]?.June?.invoices[0]
        ?.outstanding,
    ).toBe(40000);

    expect(report.monthlyTrend[5]).toMatchObject({
      month: "June",
      grossRevenue: 100000,
      refunds: 5000,
      netRevenue: 95000,
      explicitExpenses: 20000,
      salaryExpense: 30000,
      totalExpenses: 50000,
      profitOrLoss: 45000,
    });
  });

  it("does not treat refunds as collections", async () => {
    mocks.paymentFindMany.mockResolvedValue([
      {
        invoiceId: "annual-invoice",
        amount: 60000,
        type: "PAYMENT",
      },
      {
        invoiceId: "annual-invoice",
        amount: 5000,
        type: "REFUND",
      },
    ]);

    const report = await getAnnualReport({
      businessId: "business-1",
      year: 2026,
    });

    expect(report.collection.annualCollectedAmount).toBe(55000);
    expect(report.collection.yearEndOutstandingAmount).toBe(95000);
  });
});
