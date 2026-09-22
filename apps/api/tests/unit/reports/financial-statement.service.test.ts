import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  invoiceFindMany: vi.fn(),
  paymentFindMany: vi.fn(),
  expenseFindMany: vi.fn(),
  payrollRecordFindMany: vi.fn(),
}));

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    invoice: {
      findMany: mocks.invoiceFindMany,
    },
    payment: {
      findMany: mocks.paymentFindMany,
    },
    expense: {
      findMany: mocks.expenseFindMany,
    },
    payrollRecord: {
      findMany: mocks.payrollRecordFindMany,
    },
  },
}));

import { getFinancialStatement } from "../../../src/modules/reports/financial-statement.service.js";

describe("getFinancialStatement", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.paymentFindMany.mockResolvedValue([]);
    mocks.expenseFindMany.mockResolvedValue([]);
    mocks.payrollRecordFindMany.mockResolvedValue([]);
  });

  it("calculates net profit from revenue, refunds, recognized expenses and gross finalized payroll", async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: "invoice-1",
        invoiceNumber: "000001",
        totalAmount: 100000,
        createdAt: new Date("2026-09-05T10:00:00.000Z"),
      },
      {
        id: "invoice-2",
        invoiceNumber: "000002",
        totalAmount: 50000,
        createdAt: new Date("2026-09-10T10:00:00.000Z"),
      },
    ]);

    mocks.paymentFindMany.mockResolvedValue([
      {
        id: "refund-1",
        invoiceId: "invoice-1",
        amount: 10000,
        createdAt: new Date("2026-09-12T10:00:00.000Z"),
      },
    ]);

    mocks.expenseFindMany.mockResolvedValue([
      {
        id: "expense-1",
        category: "RENT",
        description: "September rent",
        amount: 20000,
        incurredAt: new Date("2026-09-01T10:00:00.000Z"),
        recognizedAt: new Date("2026-09-02T10:00:00.000Z"),
      },
      {
        id: "expense-2",
        category: "UTILITIES",
        description: "Electricity",
        amount: 5000,
        incurredAt: new Date("2026-09-04T10:00:00.000Z"),
        recognizedAt: new Date("2026-09-05T10:00:00.000Z"),
      },
    ]);

    mocks.payrollRecordFindMany.mockResolvedValue([
      {
        id: "payroll-1",
        employeeId: "employee-1",
        grossPay: 30000,
        payrollPeriod: {
          id: "period-1",
          periodStart: new Date("2026-09-01T00:00:00.000Z"),
          periodEnd: new Date("2026-09-30T23:59:59.999Z"),
        },
      },
    ]);

    const report = await getFinancialStatement(
      {
        businessId: "business-1",
        branchId: "branch-1",
      },
      {
        from: new Date("2026-09-01T00:00:00.000Z"),
        to: new Date("2026-09-30T23:59:59.999Z"),
      },
    );

    expect(report.revenue.grossInvoiced).toBe(150000);
    expect(report.revenue.refunds).toBe(10000);
    expect(report.revenue.netRevenue).toBe(140000);

    expect(report.expenses.explicit).toBe(25000);
    expect(report.expenses.salary).toBe(30000);
    expect(report.expenses.total).toBe(55000);

    expect(report.profitOrLoss.amount).toBe(85000);
    expect(report.profitOrLoss.type).toBe("PROFIT");

    expect(report.expenses.byCategory).toEqual({
      RENT: 20000,
      SALARY: 30000,
      UTILITIES: 5000,
    });
  });

  it("does not treat payroll payments, IOU deductions or loan principal as additional expenses", async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: "invoice-1",
        invoiceNumber: "000001",
        totalAmount: 100000,
        createdAt: new Date("2026-09-05T10:00:00.000Z"),
      },
    ]);

    mocks.payrollRecordFindMany.mockResolvedValue([
      {
        id: "payroll-1",
        employeeId: "employee-1",
        grossPay: 40000,
        payrollPeriod: {
          id: "period-1",
          periodStart: new Date("2026-09-01T00:00:00.000Z"),
          periodEnd: new Date("2026-09-30T23:59:59.999Z"),
        },
      },
    ]);

    const report = await getFinancialStatement(
      {
        businessId: "business-1",
        branchId: "branch-1",
      },
      {
        from: new Date("2026-09-01T00:00:00.000Z"),
        to: new Date("2026-09-30T23:59:59.999Z"),
      },
    );

    expect(report.revenue.netRevenue).toBe(100000);
    expect(report.expenses.total).toBe(40000);
    expect(report.profitOrLoss.amount).toBe(60000);
  });

  it("only includes explicitly recognized approved expenses", async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: "invoice-1",
        invoiceNumber: "000001",
        totalAmount: 100000,
        createdAt: new Date("2026-09-05T10:00:00.000Z"),
      },
    ]);

    mocks.expenseFindMany.mockResolvedValue([
      {
        id: "expense-1",
        category: "RENT",
        description: "Approved and recognized",
        amount: 10000,
        incurredAt: new Date("2026-09-01T10:00:00.000Z"),
        recognizedAt: new Date("2026-09-10T10:00:00.000Z"),
      },
    ]);

    const report = await getFinancialStatement(
      {
        businessId: "business-1",
        branchId: "branch-1",
      },
      {
        from: new Date("2026-09-01T00:00:00.000Z"),
        to: new Date("2026-09-30T23:59:59.999Z"),
      },
    );

    expect(report.expenses.explicit).toBe(10000);
    expect(report.expenses.total).toBe(10000);
    expect(report.profitOrLoss.amount).toBe(90000);

    expect(mocks.expenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "APPROVED",
        }),
      }),
    );
  });

  it("supports a loss when expenses exceed net revenue", async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: "invoice-1",
        invoiceNumber: "000001",
        totalAmount: 20000,
        createdAt: new Date("2026-09-05T10:00:00.000Z"),
      },
    ]);

    mocks.expenseFindMany.mockResolvedValue([
      {
        id: "expense-1",
        category: "MAINTENANCE",
        description: "Machine repair",
        amount: 30000,
        incurredAt: new Date("2026-09-05T10:00:00.000Z"),
        recognizedAt: new Date("2026-09-06T10:00:00.000Z"),
      },
    ]);

    const report = await getFinancialStatement(
      {
        businessId: "business-1",
        branchId: "branch-1",
      },
      {
        from: new Date("2026-09-01T00:00:00.000Z"),
        to: new Date("2026-09-30T23:59:59.999Z"),
      },
    );

    expect(report.profitOrLoss.amount).toBe(-10000);
    expect(report.profitOrLoss.type).toBe("LOSS");
  });
});
