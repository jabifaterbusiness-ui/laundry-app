import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(), $queryRaw: vi.fn(),
    branch: { findFirst: vi.fn(), findMany: vi.fn() },
    inventoryItem: { findMany: vi.fn(), findFirst: vi.fn() },
    inventoryStock: { upsert: vi.fn(), findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    inventoryTransfer: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    inventoryTransferLine: { findMany: vi.fn(), update: vi.fn() },
    inventoryMovement: { create: vi.fn(), findMany: vi.fn() },
    inventoryPurchaseOrder: { findMany: vi.fn() },
    inventoryStocktake: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    inventoryStocktakeLine: { update: vi.fn() },
    inventoryReservation: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({ prisma: db }));

import {
  createInventoryMovement, createInventoryTransfer, receiveInventoryTransfer, receiveInventoryPurchaseOrder, createInventoryStocktake, listInventoryStocktakes, getInventoryBranchComparison,
  submitInventoryStocktake, approveInventoryStocktake, applyInventoryStocktake, createInventoryReservation, releaseInventoryReservation, getInventoryReports,
} from "../../src/modules/inventory/inventory.service.js";

const BUSINESS = "biz-1";
const SOURCE = "branch-1";
const DESTINATION = "branch-2";
const ITEM = "item-1";
const USER = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  db.$queryRaw.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (input: readonly unknown[] | ((tx: typeof db) => unknown)) =>
    typeof input === "function" ? input(db) : Promise.all(input),
  );
});

describe("inventory operations", () => {
  it("reports supplier receipt lead time and order fulfilment states", async () => {
    const orderedAt = new Date("2026-10-01T09:00:00.000Z");
    const receivedAt = new Date("2026-10-04T09:00:00.000Z");
    db.inventoryStock.findMany.mockResolvedValue([]);
    db.inventoryMovement.findMany.mockResolvedValue([]);
    db.inventoryPurchaseOrder.findMany.mockResolvedValue([
      {
        supplierId: "supplier-1",
        supplier: { name: "Reliable Supplies" },
        status: "RECEIVED",
        orderedAt,
        createdAt: orderedAt,
        lines: [{ quantityOrdered: 10, unitCost: 250 }],
        receipts: [{ receivedAt }],
      },
      {
        supplierId: "supplier-1",
        supplier: { name: "Reliable Supplies" },
        status: "PARTIALLY_RECEIVED",
        orderedAt,
        createdAt: orderedAt,
        lines: [{ quantityOrdered: 4, unitCost: 300 }],
        receipts: [],
      },
      {
        supplierId: "supplier-1",
        supplier: { name: "Reliable Supplies" },
        status: "ORDERED",
        orderedAt,
        createdAt: orderedAt,
        lines: [{ quantityOrdered: 2, unitCost: 400 }],
        receipts: [],
      },
    ]);
    const report = await getInventoryReports({ businessId: BUSINESS, branchId: SOURCE });
    expect(db.inventoryPurchaseOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: BUSINESS,
        branchId: SOURCE,
        status: { in: ["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED"] },
        OR: expect.arrayContaining([
          { createdAt: expect.objectContaining({ gte: expect.any(Date) }) },
          { orderedAt: expect.objectContaining({ gte: expect.any(Date) }) },
          { receipts: { some: { receivedAt: expect.objectContaining({ gte: expect.any(Date) }) } } },
        ]),
      }),
    }));
    expect(report.supplierPerformance).toEqual([{
      supplierId: "supplier-1",
      supplierName: "Reliable Supplies",
      orderCount: 3,
      orderedValue: 4500,
      receivedOrderCount: 1,
      partiallyReceivedOrderCount: 1,
      openOrderCount: 1,
      averageFirstReceiptLeadTimeDays: 3,
    }]);
  });

  it("compares stock only across active branches in the requested business", async () => {
    db.branch.findMany.mockResolvedValue([
      { id: SOURCE, name: "Central", inventoryStocks: [
        { inventoryItemId: "item-1", quantity: 10, reservedQuantity: 2, averageUnitCost: 50, inventoryItem: { lowStockThreshold: 3 } },
        { inventoryItemId: "item-2", quantity: 1, reservedQuantity: 0, averageUnitCost: 25, inventoryItem: { lowStockThreshold: 2 } },
      ] },
      { id: DESTINATION, name: "North", inventoryStocks: [
        { inventoryItemId: "item-1", quantity: 4, reservedQuantity: 1, averageUnitCost: 100, inventoryItem: { lowStockThreshold: 2 } },
      ] },
    ]);
    db.inventoryItem.findMany.mockResolvedValue([
      { id: "item-1", lowStockThreshold: 3 },
      { id: "item-2", lowStockThreshold: 2 },
      { id: "item-3", lowStockThreshold: 0 },
    ]);
    await expect(getInventoryBranchComparison({ businessId: BUSINESS })).resolves.toEqual([
      { branchId: SOURCE, branchName: "Central", catalogueItemCount: 3, totalValuation: 525, lowStockItems: 2 },
      { branchId: DESTINATION, branchName: "North", catalogueItemCount: 3, totalValuation: 400, lowStockItems: 3 },
    ]);
    expect(db.branch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: BUSINESS, isActive: true },
    }));
    expect(db.inventoryItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: BUSINESS, isActive: true },
    }));
  });


  it("rejects invalid purchase receipt quantities and costs before opening a transaction", async () => {
    const invalidLines = [
      { purchaseOrderLineId: "line-1", quantity: 0 },
      { purchaseOrderLineId: "line-1", quantity: -2 },
      { purchaseOrderLineId: "line-1", quantity: 1.5 },
      { purchaseOrderLineId: "line-1", quantity: 1, unitCost: -1 },
      { purchaseOrderLineId: "line-1", quantity: 1, unitCost: 1.25 },
    ];
    for (const line of invalidLines) {
      await expect(receiveInventoryPurchaseOrder(
        { businessId: BUSINESS, branchId: SOURCE },
        { purchaseOrderId: "po-1", receiptNumber: "GRN-1", receivedById: USER, lines: [line] },
      )).rejects.toMatchObject({ statusCode: 422 });
    }
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("requires an audit reason for returns, waste and expiry movements", async () => {
    for (const type of ["RETURN", "WASTE", "EXPIRED"] as const) {
      await expect(createInventoryMovement(
        { businessId: BUSINESS, branchId: SOURCE },
        { inventoryItemId: ITEM, quantity: 1, type, createdById: USER },
      )).rejects.toMatchObject({ statusCode: 422 });
    }
    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("rejects transfers to the same branch", async () => {
    await expect(createInventoryTransfer(
      { businessId: BUSINESS, branchId: SOURCE },
      { destinationBranchId: SOURCE, transferNumber: "TR-1", createdById: USER, lines: [{ inventoryItemId: ITEM, quantity: 2 }] },
    )).rejects.toMatchObject({ statusCode: 422 });
    expect(db.inventoryStock.upsert).not.toHaveBeenCalled();
  });

  it("dispatches a transfer only from available unreserved stock", async () => {
    db.branch.findFirst.mockResolvedValue({ id: SOURCE, isActive: true });
    db.inventoryItem.findMany.mockResolvedValue([{ id: ITEM }]);
    db.inventoryStock.upsert.mockResolvedValue({ id: "stock-1", quantity: 8, reservedQuantity: 3, averageUnitCost: 125 });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", quantity: 8, reservedQuantity: 3, averageUnitCost: 125 });
    db.inventoryStock.update.mockResolvedValue({ id: "stock-1", quantity: 5 });
    db.inventoryTransfer.create.mockResolvedValue({ id: "transfer-1", transferNumber: "TR-1", lines: [] });
    await createInventoryTransfer(
      { businessId: BUSINESS, branchId: SOURCE },
      { destinationBranchId: DESTINATION, transferNumber: "TR-1", createdById: USER, lines: [{ inventoryItemId: ITEM, quantity: 5 }] },
    );
    expect(db.inventoryStock.update).toHaveBeenCalledWith({ where: { id: "stock-1" }, data: { quantity: 3 } });
    expect(db.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "TRANSFER_OUT", quantity: 5, resultingQuantity: 3, unitCost: 125 }) });
  });

  it("rejects a transfer that would consume reserved stock", async () => {
    db.branch.findFirst.mockResolvedValue({ id: SOURCE, isActive: true });
    db.inventoryItem.findMany.mockResolvedValue([{ id: ITEM }]);
    db.inventoryStock.upsert.mockResolvedValue({ id: "stock-1" });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", quantity: 8, reservedQuantity: 4, averageUnitCost: 0 });
    await expect(createInventoryTransfer(
      { businessId: BUSINESS, branchId: SOURCE },
      { destinationBranchId: DESTINATION, transferNumber: "TR-2", createdById: USER, lines: [{ inventoryItemId: ITEM, quantity: 5 }] },
    )).rejects.toMatchObject({ statusCode: 422 });
    expect(db.inventoryTransfer.create).not.toHaveBeenCalled();
  });

  it("receives a transfer into the destination branch and records the inbound ledger entry", async () => {
    db.inventoryTransfer.findFirst.mockResolvedValue({
      id: "transfer-1", transferNumber: "TR-1", status: "DISPATCHED",
      lines: [{ id: "line-1", inventoryItemId: ITEM, quantityDispatched: 5, quantityReceived: 0, unitCost: 125 }],
    });
    db.inventoryStock.upsert.mockResolvedValue({ id: "stock-2" });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-2", quantity: 2, reservedQuantity: 0, averageUnitCost: 100 });
    db.inventoryStock.update.mockResolvedValue({ id: "stock-2", quantity: 5 });
    db.inventoryTransferLine.update.mockResolvedValue({});
    db.inventoryTransferLine.findMany.mockResolvedValue([{ quantityDispatched: 5, quantityReceived: 5 }]);
    db.inventoryTransfer.update.mockResolvedValue({ id: "transfer-1", status: "RECEIVED" });
    await receiveInventoryTransfer(
      { businessId: BUSINESS, branchId: DESTINATION },
      { transferId: "transfer-1", receivedById: USER, lines: [{ transferLineId: "line-1", quantity: 3 }] },
    );
    expect(db.inventoryStock.update).toHaveBeenCalledWith({ where: { id: "stock-2" }, data: { quantity: 5, averageUnitCost: 115 } });
    expect(db.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "TRANSFER_IN", branchId: DESTINATION, resultingQuantity: 5 }) });
  });

  it("creates a stocktake snapshot with expected and counted quantities", async () => {
    db.branch.findFirst.mockResolvedValue({ id: SOURCE, isActive: true });
    db.inventoryItem.findMany.mockResolvedValue([{ id: ITEM }]);
    db.inventoryStock.upsert.mockResolvedValue({ id: "stock-1" });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", quantity: 7, reservedQuantity: 0 });
    db.inventoryStocktake.create.mockResolvedValue({ id: "count-1" });
    await createInventoryStocktake(
      { businessId: BUSINESS, branchId: SOURCE },
      { reference: "COUNT-1", createdById: USER, lines: [{ inventoryItemId: ITEM, countedQuantity: 5 }] },
    );
    expect(db.inventoryStocktake.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lines: { create: [{ inventoryItemId: ITEM, expectedQuantity: 7, countedQuantity: 5, variance: -2 }] },
      }),
    }));
  });

  it("lists stocktakes within the active business and branch", async () => {
    db.inventoryStocktake.findMany.mockResolvedValue([{ id: "count-1" }]);
    await expect(listInventoryStocktakes({ businessId: BUSINESS, branchId: SOURCE })).resolves.toEqual({ stocktakes: [{ id: "count-1" }] });
    expect(db.inventoryStocktake.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: BUSINESS, branchId: SOURCE } }));
  });

  it("requires a submitted stocktake and a different user to approve it", async () => {
    db.inventoryStocktake.update.mockResolvedValue({ id: "count-1", status: "SUBMITTED" });
    db.inventoryStocktake.findFirst.mockResolvedValue({ id: "count-1", status: "DRAFT", createdById: USER });
    await expect(submitInventoryStocktake({ businessId: BUSINESS, branchId: SOURCE }, { stocktakeId: "count-1", submittedById: USER })).resolves.toBeDefined();
    expect(db.inventoryStocktake.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUBMITTED" }) }));
    db.inventoryStocktake.findFirst.mockResolvedValue({ id: "count-1", status: "SUBMITTED", createdById: USER });
    await expect(approveInventoryStocktake({ businessId: BUSINESS, branchId: SOURCE }, { stocktakeId: "count-1", approvedById: USER })).rejects.toMatchObject({ statusCode: 403 });
    expect(db.inventoryStocktake.update).toHaveBeenCalledTimes(1);
  });

  it("prevents the stocktake submitter from approving their own submission", async () => {
    db.inventoryStocktake.findFirst.mockResolvedValue({
      id: "count-2", status: "SUBMITTED", createdById: "creator-1", submittedById: "submitter-2",
    });
    await expect(approveInventoryStocktake(
      { businessId: BUSINESS, branchId: SOURCE },
      { stocktakeId: "count-2", approvedById: "submitter-2" },
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(db.inventoryStocktake.update).not.toHaveBeenCalled();
  });

  it("does not apply a stocktake before independent approval", async () => {
    db.inventoryStocktake.findFirst.mockResolvedValue({ id: "count-1", status: "SUBMITTED", lines: [] });
    await expect(applyInventoryStocktake({ businessId: BUSINESS, branchId: SOURCE }, { stocktakeId: "count-1", appliedById: "manager-2" })).rejects.toMatchObject({ statusCode: 422 });
    expect(db.inventoryStocktake.update).not.toHaveBeenCalled();
  });

  it("applies an approved stocktake and records the applied actor", async () => {
    db.inventoryStocktake.findFirst.mockResolvedValue({ id: "count-1", reference: "COUNT-1", status: "APPROVED", lines: [{ id: "line-1", inventoryItemId: ITEM, countedQuantity: 6 }] });
    db.inventoryStock.upsert.mockResolvedValue({ id: "stock-1" });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", quantity: 4, reservedQuantity: 0 });
    db.inventoryStock.update.mockResolvedValue({ id: "stock-1", quantity: 6 });
    db.inventoryStocktakeLine.update.mockResolvedValue({});
    db.inventoryStocktake.update.mockResolvedValue({ id: "count-1", status: "APPLIED", appliedById: "manager-2" });
    await applyInventoryStocktake({ businessId: BUSINESS, branchId: SOURCE }, { stocktakeId: "count-1", appliedById: "manager-2" });
    expect(db.inventoryStock.update).toHaveBeenCalledWith({ where: { id: "stock-1" }, data: { quantity: 6 } });
    expect(db.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "STOCKTAKE", quantity: 2, resultingQuantity: 6 }) });
    expect(db.inventoryStocktake.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "APPLIED", appliedById: "manager-2" }) }));
  });

  it("rejects reservations that expire in the past", async () => {
    await expect(createInventoryReservation(
      { businessId: BUSINESS, branchId: SOURCE },
      { inventoryItemId: ITEM, quantity: 1, createdById: USER, expiresAt: new Date(Date.now() - 1) },
    )).rejects.toMatchObject({ statusCode: 422 });
    expect(db.inventoryReservation.create).not.toHaveBeenCalled();
    expect(db.inventoryStock.upsert).not.toHaveBeenCalled();
  });

  it("prevents reservations beyond available stock", async () => {
    db.inventoryItem.findFirst.mockResolvedValue({ id: ITEM, isActive: true });
    db.inventoryStock.upsert.mockResolvedValue({ id: "stock-1" });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", quantity: 5, reservedQuantity: 4 });
    await expect(createInventoryReservation(
      { businessId: BUSINESS, branchId: SOURCE },
      { inventoryItemId: ITEM, quantity: 2, createdById: USER },
    )).rejects.toMatchObject({ statusCode: 422 });
    expect(db.inventoryReservation.create).not.toHaveBeenCalled();
  });

  it("does not change stock when the reservation balance is inconsistent", async () => {
    db.inventoryReservation.findFirst.mockResolvedValue({ id: "reservation-2", inventoryItemId: ITEM, quantity: 3, reference: null, createdById: USER });
    db.inventoryStock.findUnique.mockResolvedValue({ id: "stock-2" });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-2", quantity: 5, reservedQuantity: 2 });
    await expect(releaseInventoryReservation(
      { businessId: BUSINESS, branchId: SOURCE },
      { reservationId: "reservation-2", consumed: true },
    )).rejects.toMatchObject({ statusCode: 409 });
    expect(db.inventoryStock.update).not.toHaveBeenCalled();
    expect(db.inventoryReservation.update).not.toHaveBeenCalled();
  });

  it("does not release a reservation that is no longer active", async () => {
    db.inventoryReservation.findFirst.mockResolvedValue(null);
    await expect(releaseInventoryReservation(
      { businessId: BUSINESS, branchId: SOURCE },
      { reservationId: "reservation-3" },
    )).rejects.toMatchObject({ statusCode: 404 });
    expect(db.inventoryStock.findUnique).not.toHaveBeenCalled();
  });

  it("consumes an active reservation atomically and writes an issue movement", async () => {
    db.inventoryReservation.findFirst.mockResolvedValue({ id: "reservation-1", inventoryItemId: ITEM, quantity: 2, reference: "ORDER-1", createdById: USER });
    db.inventoryStock.findUnique.mockResolvedValue({ id: "stock-1" });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", quantity: 5, reservedQuantity: 2 });
    db.inventoryStock.update.mockResolvedValue({});
    db.inventoryMovement.create.mockResolvedValue({});
    db.inventoryReservation.update.mockResolvedValue({ id: "reservation-1", status: "CONSUMED" });
    await releaseInventoryReservation(
      { businessId: BUSINESS, branchId: SOURCE },
      { reservationId: "reservation-1", consumed: true },
    );
    expect(db.inventoryStock.update).toHaveBeenCalledWith({ where: { id: "stock-1" }, data: { reservedQuantity: { decrement: 2 }, quantity: { decrement: 2 } } });
    expect(db.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "ISSUE", quantity: 2, resultingQuantity: 3 }) });
  });
});
