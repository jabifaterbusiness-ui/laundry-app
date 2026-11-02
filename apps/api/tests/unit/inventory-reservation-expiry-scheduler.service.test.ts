import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, loggerMock } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    inventoryReservation: { findFirst: vi.fn(), update: vi.fn() },
    inventoryStock: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  };
  return {
    txMock: tx,
    prismaMock: {
      inventoryReservation: { findMany: vi.fn() },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    },
    loggerMock: { info: vi.fn(), error: vi.fn() },
  };
});
vi.mock("../../src/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../../src/lib/logger.js", () => ({ logger: loggerMock }));

import { processExpiredInventoryReservations } from "../../src/modules/inventory/inventory-reservation-expiry-scheduler.service.js";

describe("inventory reservation expiry scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.inventoryReservation.findMany.mockResolvedValue([]);
    txMock.$queryRaw.mockResolvedValue([]);
    txMock.inventoryReservation.findFirst.mockResolvedValue(null);
    txMock.inventoryStock.findUnique.mockResolvedValue(null);
    txMock.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", reservedQuantity: 4 });
    txMock.inventoryStock.update.mockResolvedValue({});
    txMock.inventoryReservation.update.mockResolvedValue({});
  });

  it("releases expired quantities from reserved stock and marks reservations expired", async () => {
    const now = new Date("2026-11-02T12:00:00.000Z");
    prismaMock.inventoryReservation.findMany.mockResolvedValue([{
      id: "reservation-1", businessId: "business-1", branchId: "branch-1", inventoryItemId: "item-1", quantity: 2,
    }]);
    txMock.inventoryReservation.findFirst.mockResolvedValue({
      id: "reservation-1", branchId: "branch-1", inventoryItemId: "item-1", quantity: 2,
    });
    txMock.inventoryStock.findUnique.mockResolvedValue({ id: "stock-1" });

    const result = await processExpiredInventoryReservations(now);

    expect(result).toEqual({ scanned: 1, released: 1 });
    expect(txMock.inventoryStock.update).toHaveBeenCalledWith({
      where: { id: "stock-1" }, data: { reservedQuantity: { decrement: 2 } },
    });
    expect(txMock.inventoryReservation.update).toHaveBeenCalledWith({
      where: { id: "reservation-1" }, data: { status: "EXPIRED", releasedAt: now },
    });
  });

  it("does not release a reservation already processed by another worker", async () => {
    prismaMock.inventoryReservation.findMany.mockResolvedValue([{
      id: "reservation-1", businessId: "business-1", branchId: "branch-1", inventoryItemId: "item-1", quantity: 2,
    }]);
    txMock.inventoryReservation.findFirst.mockResolvedValue(null);

    expect(await processExpiredInventoryReservations()).toEqual({ scanned: 1, released: 0 });
    expect(txMock.inventoryStock.update).not.toHaveBeenCalled();
  });

  it("refuses to hide an inconsistent reserved balance", async () => {
    prismaMock.inventoryReservation.findMany.mockResolvedValue([{
      id: "reservation-1", businessId: "business-1", branchId: "branch-1", inventoryItemId: "item-1", quantity: 5,
    }]);
    txMock.inventoryReservation.findFirst.mockResolvedValue({
      id: "reservation-1", branchId: "branch-1", inventoryItemId: "item-1", quantity: 5,
    });
    txMock.inventoryStock.findUnique.mockResolvedValue({ id: "stock-1" });
    txMock.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", reservedQuantity: 3 });

    await expect(processExpiredInventoryReservations()).rejects.toThrow("Reserved inventory balance is inconsistent");
    expect(txMock.inventoryStock.update).not.toHaveBeenCalled();
  });
});
