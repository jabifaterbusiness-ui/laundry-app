import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderCount: vi.fn(),
  invoiceCount: vi.fn(),
  invoiceAggregate: vi.fn(),
  paymentAggregate: vi.fn(),
  customerCount: vi.fn(),
  inventoryStockCount: vi.fn(),
  inventoryMovementCount: vi.fn(),
}));

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    order: { count: mocks.orderCount },
    invoice: {
      count: mocks.invoiceCount,
      aggregate: mocks.invoiceAggregate,
    },
    payment: { aggregate: mocks.paymentAggregate },
    customer: { count: mocks.customerCount },
    inventoryStock: { count: mocks.inventoryStockCount },
    inventoryMovement: { count: mocks.inventoryMovementCount },
  },
}));

import { getDashboardReport } from "../../../src/modules/reports/reports.service.js";

describe("reports.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a branch-scoped dashboard report", async () => {
    mocks.orderCount.mockResolvedValue(12);
    mocks.invoiceCount.mockResolvedValue(10);
    mocks.invoiceAggregate.mockResolvedValue({
      _sum: { totalAmount: 500000 },
    });
    mocks.paymentAggregate
      .mockResolvedValueOnce({ _sum: { amount: 350000 } })
      .mockResolvedValueOnce({ _sum: { amount: 25000 } });
    mocks.customerCount.mockResolvedValue(40);
    mocks.inventoryStockCount.mockResolvedValue(8);
    mocks.inventoryMovementCount.mockResolvedValue(20);

    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-07T23:59:59.999Z");

    const result = await getDashboardReport(
      {
        businessId: "business-1",
        branchId: "branch-1",
      },
      { from, to },
    );

    expect(result).toEqual({
      period: { from, to },
      orders: { total: 12 },
      invoices: {
        total: 10,
        totalAmount: 500000,
        outstandingAmount: 175000,
      },
      payments: {
        received: 350000,
        refunded: 25000,
        netReceived: 325000,
      },
      customers: { active: 40 },
      inventory: {
        stockItems: 8,
        movements: 20,
      },
    });

    expect(mocks.orderCount).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        branchId: "branch-1",
        createdAt: {
          gte: from,
          lte: to,
        },
      },
    });
  });

  it("keeps reports tenant and branch scoped", async () => {
    mocks.orderCount.mockResolvedValue(0);
    mocks.invoiceCount.mockResolvedValue(0);
    mocks.invoiceAggregate.mockResolvedValue({
      _sum: { totalAmount: null },
    });
    mocks.paymentAggregate
      .mockResolvedValueOnce({ _sum: { amount: null } })
      .mockResolvedValueOnce({ _sum: { amount: null } });
    mocks.customerCount.mockResolvedValue(0);
    mocks.inventoryStockCount.mockResolvedValue(0);
    mocks.inventoryMovementCount.mockResolvedValue(0);

    await getDashboardReport(
      {
        businessId: "business-2",
        branchId: "branch-9",
      },
      {},
    );

    expect(mocks.invoiceCount).toHaveBeenCalledWith({
      where: {
        businessId: "business-2",
        branchId: "branch-9",
      },
    });

    expect(mocks.paymentAggregate).toHaveBeenNthCalledWith(1, {
      where: {
        businessId: "business-2",
        branchId: "branch-9",
        status: "POSTED",
        type: "PAYMENT",
      },
      _sum: { amount: true },
    });
  });
});
