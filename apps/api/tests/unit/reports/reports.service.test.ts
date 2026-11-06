import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderCount: vi.fn(),
  invoiceFindMany: vi.fn(),
  paymentFindMany: vi.fn(),
  paymentAggregate: vi.fn(),
  customerCount: vi.fn(),
  branchResourceShareFindMany: vi.fn(),
  inventoryStockCount: vi.fn(),
  inventoryMovementCount: vi.fn(),
  garmentFindMany: vi.fn(),
}));

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    order: { count: mocks.orderCount },
    invoice: { findMany: mocks.invoiceFindMany },
    payment: {
      findMany: mocks.paymentFindMany,
      aggregate: mocks.paymentAggregate,
    },
    customer: { count: mocks.customerCount },
    branchResourceShare: { findMany: mocks.branchResourceShareFindMany },
    inventoryStock: { count: mocks.inventoryStockCount },
    inventoryMovement: { count: mocks.inventoryMovementCount },
    garment: { findMany: mocks.garmentFindMany },
  },
}));

import { getDashboardReport } from "../../../src/modules/reports/reports.service.js";

describe("reports.service", () => {
  const from = new Date("2026-09-01T00:00:00.000Z");
  const to = new Date("2026-09-30T23:59:59.999Z");

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.orderCount.mockResolvedValue(12);
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.paymentFindMany.mockResolvedValue([]);
    mocks.paymentAggregate.mockResolvedValue({
      _sum: { amount: null },
    });
    mocks.customerCount.mockResolvedValue(40);
    mocks.branchResourceShareFindMany.mockResolvedValue([]);
    mocks.inventoryStockCount.mockResolvedValue(8);
    mocks.inventoryMovementCount.mockResolvedValue(20);
    mocks.garmentFindMany.mockResolvedValue([]);
  });

  it("returns a branch-scoped collection report", async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: "invoice-1",
        invoiceNumber: "000001",
        totalAmount: 500000,
        createdAt: new Date("2026-09-05T10:00:00.000Z"),
        status: "ISSUED",
        orderId: "order-1",
      },
      {
        id: "invoice-2",
        invoiceNumber: "000002",
        totalAmount: 100000,
        createdAt: new Date("2026-09-06T10:00:00.000Z"),
        status: "ISSUED",
        orderId: "order-2",
      },
    ]);

    mocks.paymentFindMany.mockResolvedValue([
      {
        invoiceId: "invoice-1",
        amount: 350000,
        type: "PAYMENT",
      },
      {
        invoiceId: "invoice-1",
        amount: 25000,
        type: "REFUND",
      },
      {
        invoiceId: "invoice-2",
        amount: 100000,
        type: "PAYMENT",
      },
    ]);

    mocks.paymentAggregate.mockResolvedValue({
      _sum: { amount: 25000 },
    });

    mocks.garmentFindMany.mockResolvedValue([
      {
        id: "garment-1",
        status: "PICKED_UP",
        orderId: "order-1",
        pickedUpAt: new Date("2026-09-10T10:00:00.000Z"),
        createdAt: new Date("2026-09-05T10:00:00.000Z"),
      },
      {
        id: "garment-2",
        status: "READY",
        orderId: "order-2",
        pickedUpAt: null,
        createdAt: new Date("2026-09-06T10:00:00.000Z"),
      },
    ]);

    const result = await getDashboardReport(
      {
        businessId: "business-1",
        branchId: "branch-1",
        userId: "user-1",
      },
      { from, to },
    );

    expect(result.invoices.total).toBe(2);
    expect(result.invoices.totalAmount).toBe(600000);
    expect(result.invoices.collectedAmount).toBe(425000);
    expect(result.invoices.outstandingAmount).toBe(175000);
    expect(result.invoices.collectionRate).toBeCloseTo(70.8333, 3);

    expect(result.invoices.collectionStatement[0]).toMatchObject({
      invoiceId: "invoice-1",
      collected: 325000,
      outstanding: 175000,
    });

    expect(result.invoices.outstandingByYearMonth).toEqual({
      "2026": {
        September: {
          invoiceCount: 1,
          outstandingAmount: 175000,
          invoices: [
            {
              invoiceId: "invoice-1",
              invoiceNumber: "000001",
              amount: 500000,
              outstanding: 175000,
              date: new Date("2026-09-05T10:00:00.000Z"),
            },
          ],
        },
      },
    });

    expect(result.pickup).toEqual({
      pickedUpCount: 1,
      unpickedCount: 1,
      totalGarments: 2,
    });

    expect(result.payments).toEqual({
      received: 425000,
      refunded: 25000,
      netReceived: 400000,
    });
  });

  it("excludes void invoices from collection reporting", async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: "issued",
        invoiceNumber: "000001",
        totalAmount: 100000,
        createdAt: from,
        status: "ISSUED",
        orderId: "order-1",
      },
    ]);

    const result = await getDashboardReport(
      {
        businessId: "business-1",
        branchId: "branch-1",
        userId: "user-1",
      },
      { from, to },
    );

    expect(mocks.invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "business-1",
          branchId: "branch-1",
          status: "ISSUED",
          createdAt: {
            gte: from,
            lte: to,
          },
        }),
      }),
    );

    expect(result.invoices.total).toBe(1);
  });

  it("uses tenant and branch scope for every report query", async () => {
    await getDashboardReport(
      {
        businessId: "business-2",
        branchId: "branch-9",
      },
      {},
    );

    expect(mocks.orderCount).toHaveBeenCalledWith({
      where: {
        businessId: "business-2",
        branchId: "branch-9",
      },
    });

    expect(mocks.invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "business-2",
          branchId: "branch-9",
          status: "ISSUED",
        },
      }),
    );

    expect(mocks.customerCount).toHaveBeenCalledWith({
      where: {
        businessId: "business-2",
        isActive: true,
      },
    });

    expect(mocks.inventoryStockCount).toHaveBeenCalledWith({
      where: {
        businessId: "business-2",
        branchId: "branch-9",
      },
    });
  });

  it("does not count a pickup outside the selected pickup period", async () => {
    mocks.garmentFindMany.mockResolvedValue([
      {
        id: "garment-1",
        status: "PICKED_UP",
        orderId: "order-1",
        pickedUpAt: new Date("2026-10-01T10:00:00.000Z"),
        createdAt: new Date("2026-09-05T10:00:00.000Z"),
      },
    ]);

    const result = await getDashboardReport(
      {
        businessId: "business-1",
        branchId: "branch-1",
        userId: "user-1",
      },
      { from, to },
    );

    expect(result.pickup.pickedUpCount).toBe(0);
    expect(result.pickup.unpickedCount).toBe(0);
    expect(result.pickup.totalGarments).toBe(1);
  });
});
