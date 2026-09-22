import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  business: {
    findUnique: vi.fn(),
  },
  financialStatement: {
    upsert: vi.fn(),
  },
}));

const reportMock = vi.hoisted(() => ({
  getBusinessFinancialStatement: vi.fn(),
}));

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock(
  "../../../src/modules/reports/business-financial-statement.service.js",
  () => reportMock,
);

import { generateBusinessFinancialStatement } from "../../../src/modules/reports/business-financial-statement.persistence.service.js";

describe("generateBusinessFinancialStatement", () => {
  const from = new Date("2026-08-01T00:00:00.000Z");
  const to = new Date("2026-08-31T23:59:59.999Z");

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.business.findUnique.mockResolvedValue({
      id: "business-1",
      currencyCode: "NGN",
    });

    reportMock.getBusinessFinancialStatement.mockResolvedValue({
      period: {
        from,
        to,
      },
      revenue: {
        grossInvoiced: 150000,
        refunds: 10000,
        netRevenue: 140000,
      },
      expenses: {
        explicit: 25000,
        salary: 50000,
        total: 75000,
        byCategory: {
          RENT: 20000,
          UTILITIES: 5000,
          SALARY: 50000,
        },
      },
      profitOrLoss: {
        amount: 65000,
        type: "PROFIT",
      },
      branchSummary: {},
      detail: {
        invoices: [],
        refunds: [],
        recognizedExpenses: [],
        finalizedPayroll: [],
      },
    });

    prismaMock.financialStatement.upsert.mockResolvedValue({
      id: "statement-1",
      businessId: "business-1",
      periodStart: from,
      periodEnd: to,
      currencyCode: "NGN",
      grossRevenue: 150000,
      refundAmount: 10000,
      netRevenue: 140000,
      explicitExpenses: 25000,
      salaryExpense: 50000,
      totalExpenses: 75000,
      profitOrLoss: 65000,
    });
  });

  it("persists the calculated business-wide statement", async () => {
    const result = await generateBusinessFinancialStatement({
      businessId: "business-1",
      from,
      to,
    });

    expect(reportMock.getBusinessFinancialStatement).toHaveBeenCalledWith(
      "business-1",
      { from, to },
    );

    expect(prismaMock.financialStatement.upsert).toHaveBeenCalledWith({
      where: {
        businessId_periodStart_periodEnd: {
          businessId: "business-1",
          periodStart: from,
          periodEnd: to,
        },
      },
      create: {
        businessId: "business-1",
        periodStart: from,
        periodEnd: to,
        currencyCode: "NGN",
        grossRevenue: 150000,
        refundAmount: 10000,
        netRevenue: 140000,
        explicitExpenses: 25000,
        salaryExpense: 50000,
        totalExpenses: 75000,
        profitOrLoss: 65000,
      },
      update: {
        currencyCode: "NGN",
        grossRevenue: 150000,
        refundAmount: 10000,
        netRevenue: 140000,
        explicitExpenses: 25000,
        salaryExpense: 50000,
        totalExpenses: 75000,
        profitOrLoss: 65000,
        generatedAt: expect.any(Date),
      },
    });

    expect(result.statement.id).toBe("statement-1");
    expect(result.report.profitOrLoss.amount).toBe(65000);
  });

  it("uses the business currency rather than hard-coding NGN", async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      id: "business-1",
      currencyCode: "USD",
    });

    await generateBusinessFinancialStatement({
      businessId: "business-1",
      from,
      to,
    });

    const call = prismaMock.financialStatement.upsert.mock.calls[0]![0];

    expect(call.create.currencyCode).toBe("USD");
    expect(call.update.currencyCode).toBe("USD");
  });

  it("rejects an invalid date range before querying the database", async () => {
    await expect(
      generateBusinessFinancialStatement({
        businessId: "business-1",
        from: to,
        to: from,
      }),
    ).rejects.toThrow(
      "Financial statement start date cannot be after end date",
    );

    expect(prismaMock.business.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.financialStatement.upsert).not.toHaveBeenCalled();
  });

  it("fails when the business does not exist", async () => {
    prismaMock.business.findUnique.mockResolvedValue(null);

    await expect(
      generateBusinessFinancialStatement({
        businessId: "missing-business",
        from,
        to,
      }),
    ).rejects.toThrow("Business not found");

    expect(reportMock.getBusinessFinancialStatement).not.toHaveBeenCalled();
    expect(prismaMock.financialStatement.upsert).not.toHaveBeenCalled();
  });
});
