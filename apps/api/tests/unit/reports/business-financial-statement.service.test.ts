import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  invoice: {
    findMany: vi.fn(),
  },
  payment: {
    findMany: vi.fn(),
  },
  expense: {
    findMany: vi.fn(),
  },
  payrollRecord: {
    findMany: vi.fn(),
  },
}));

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import { getBusinessFinancialStatement } from "../../../src/modules/reports/business-financial-statement.service.js";

describe("getBusinessFinancialStatement", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.invoice.findMany.mockResolvedValue([
      {
        id: "invoice-1",
        branchId: "branch-a",
        invoiceNumber: "000001",
        totalAmount: 100000,
        createdAt: new Date("2026-09-05T10:00:00Z"),
      },
      {
        id: "invoice-2",
        branchId: "branch-b",
        invoiceNumber: "000002",
        totalAmount: 50000,
        createdAt: new Date("2026-09-10T10:00:00Z"),
      },
    ]);

    prismaMock.payment.findMany.mockResolvedValue([
      {
        id: "refund-1",
        branchId: "branch-a",
        invoiceId: "invoice-1",
        amount: 10000,
        createdAt: new Date("2026-09-12T10:00:00Z"),
      },
    ]);

    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: "expense-1",
        branchId: "branch-a",
        category: "RENT",
        description: "Shop rent",
        amount: 20000,
        incurredAt: new Date("2026-09-01T10:00:00Z"),
        recognizedAt: new Date("2026-09-02T10:00:00Z"),
      },
      {
        id: "expense-2",
        branchId: "branch-b",
        category: "UTILITIES",
        description: "Electricity",
        amount: 5000,
        incurredAt: new Date("2026-09-03T10:00:00Z"),
        recognizedAt: new Date("2026-09-04T10:00:00Z"),
      },
    ]);

    prismaMock.payrollRecord.findMany.mockResolvedValue([
      {
        id: "payroll-1",
        branchId: "branch-a",
        employeeId: "employee-1",
        grossPay: 30000,
        payrollPeriod: {
          id: "period-a",
          periodStart: new Date("2026-09-01T00:00:00Z"),
          periodEnd: new Date("2026-09-30T23:59:59Z"),
        },
      },
      {
        id: "payroll-2",
        branchId: "branch-b",
        employeeId: "employee-2",
        grossPay: 20000,
        payrollPeriod: {
          id: "period-b",
          periodStart: new Date("2026-09-01T00:00:00Z"),
          periodEnd: new Date("2026-09-30T23:59:59Z"),
        },
      },
    ]);
  });

  it("consolidates revenue, refunds, expenses and payroll across all branches", async () => {
    const report = await getBusinessFinancialStatement("business-1", {
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-30T23:59:59Z"),
    });

    expect(report.revenue).toEqual({
      grossInvoiced: 150000,
      refunds: 10000,
      netRevenue: 140000,
    });

    expect(report.expenses).toEqual({
      explicit: 25000,
      salary: 50000,
      total: 75000,
      byCategory: {
        RENT: 20000,
        SALARY: 50000,
        UTILITIES: 5000,
      },
    });

    expect(report.profitOrLoss).toEqual({
      amount: 65000,
      type: "PROFIT",
    });

    expect(report.counts).toEqual({
      invoices: 2,
      refunds: 1,
      recognizedExpenses: 2,
      finalizedPayrollRecords: 2,
      branches: 2,
    });
  });

  it("does not apply branch filtering to the consolidated queries", async () => {
    await getBusinessFinancialStatement("business-1", {
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-30T23:59:59Z"),
    });

    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "business-1",
        }),
      }),
    );

    expect(
      prismaMock.invoice.findMany.mock.calls[0]![0].where,
    ).not.toHaveProperty("branchId");

    expect(
      prismaMock.expense.findMany.mock.calls[0]![0].where,
    ).not.toHaveProperty("branchId");

    expect(
      prismaMock.payrollRecord.findMany.mock.calls[0]![0].where,
    ).not.toHaveProperty("branchId");
  });

  it("does not count payroll payments, IOU deductions or loan principal as additional expenses", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([
      {
        id: "invoice-1",
        branchId: "branch-a",
        invoiceNumber: "000001",
        totalAmount: 100000,
        createdAt: new Date("2026-09-05T10:00:00Z"),
      },
    ]);

    prismaMock.payment.findMany.mockResolvedValue([]);
    prismaMock.expense.findMany.mockResolvedValue([]);
    prismaMock.payrollRecord.findMany.mockResolvedValue([
      {
        id: "payroll-1",
        branchId: "branch-a",
        employeeId: "employee-1",
        grossPay: 40000,
        payrollPeriod: {
          id: "period-a",
          periodStart: new Date("2026-09-01T00:00:00Z"),
          periodEnd: new Date("2026-09-30T23:59:59Z"),
        },
      },
    ]);

    const report = await getBusinessFinancialStatement("business-1", {
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-30T23:59:59Z"),
    });

    expect(report.expenses.total).toBe(40000);
    expect(report.profitOrLoss.amount).toBe(60000);
  });

  it("rejects an invalid date range", async () => {
    await expect(
      getBusinessFinancialStatement("business-1", {
        from: new Date("2026-10-01T00:00:00Z"),
        to: new Date("2026-09-01T00:00:00Z"),
      }),
    ).rejects.toThrow("The statement start date must be before the end date");

    expect(prismaMock.invoice.findMany).not.toHaveBeenCalled();
  });
});
