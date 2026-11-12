import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(), $queryRaw: vi.fn(),
    branchResourceShare: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    branch: { findFirst: vi.fn(), findMany: vi.fn() },
    inventoryItem: { findMany: vi.fn(), findFirst: vi.fn() },
    inventoryStock: { upsert: vi.fn(), findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    inventoryTransfer: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    inventoryTransferLine: { findMany: vi.fn(), update: vi.fn() },
    inventoryMovement: { create: vi.fn(), findMany: vi.fn() },
    inventoryPurchaseOrder: { findMany: vi.fn() },
    inventoryGoodsReceiptLine: { findMany: vi.fn() },
    inventoryStocktake: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    inventoryStocktakeLine: { update: vi.fn() },
    inventoryReservation: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({ prisma: db }));

import {
  createInventoryMovement, adjustInventoryStock, createInventoryTransfer, receiveInventoryTransfer, receiveInventoryPurchaseOrder, createInventoryStocktake, listInventoryStocktakes, getInventoryBranchComparison,
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
  db.inventoryGoodsReceiptLine.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (input: readonly unknown[] | ((tx: typeof db) => unknown)) =>
    typeof input === "function" ? input(db) : Promise.all(input),
  );
});

describe("inventory operations", () => {
  it("reports supplier receipt lead time and order fulfilment states", async () => {
    const orderedAt = new Date("2026-10-01T09:00:00.000Z");
    const receivedAt = new Date("2026-10-04T09:00:00.000Z");
    db.inventoryStock.findMany.mockResolvedValue([]);
    db.inventoryMovement.findMany
      .mockResolvedValueOnce([{ type: "DAMAGED", quantity: 3 }])
      .mockResolvedValueOnce([{
        id: "movement-expiry-1",
        inventoryItem: { id: ITEM, name: "Detergent" },
        batchNumber: "LOT-1",
        expiryDate: new Date(Date.now() + 5 * 86400000),
        quantity: 4,
        reference: "GRN-1",
        createdAt: new Date(),
      }]);
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
    const report = await getInventoryReports({ businessId: BUSINESS, branchId: SOURCE, userId: USER });
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
    expect(db.inventoryMovement.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: {
        businessId: BUSINESS,
        branchId: SOURCE,
        type: { in: ["RECEIPT", "RETURN"] },
        expiryDate: { not: null },
      },
      orderBy: { expiryDate: "asc" },
    }));
    expect(report.expiryRegister).toHaveLength(1);
    expect(report.expiryRegister[0]).toMatchObject({
      batchNumber: "LOT-1",
      receiptNumber: "GRN-1",
      quantityReceived: 4,
      status: "DUE_SOON",
    });
    expect(report.movementTotals).toEqual({ DAMAGED: 3 });
    expect(report.consumptionQuantity).toBe(3);
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
      { purchaseOrderLineId: "line-1", quantity: 1, expiryDate: new Date("2027-01-01") },
      { purchaseOrderLineId: "line-1", quantity: 1, batchNumber: "LOT-OLD", expiryDate: new Date("2020-01-01") },
    ];
    for (const line of invalidLines) {
      await expect(receiveInventoryPurchaseOrder(
        { businessId: BUSINESS, branchId: SOURCE, userId: USER },
        { purchaseOrderId: "po-1", receiptNumber: "GRN-1", receivedById: USER, lines: [line] },
      )).rejects.toMatchObject({ statusCode: 422 });
    }
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid movement quantities and unit costs before opening a transaction", async () => {
    const invalidInputs = [
      { quantity: 0 },
      { quantity: -1 },
      { quantity: 1.5 },
      { quantity: Number.MAX_SAFE_INTEGER + 1 },
      { quantity: 1, unitCost: -1 },
      { quantity: 1, unitCost: 1.25 },
      { quantity: 1, unitCost: 2147483648 },
    ];
    for (const invalid of invalidInputs) {
      await expect(createInventoryMovement(
        { businessId: BUSINESS, branchId: SOURCE, userId: USER },
        { inventoryItemId: ITEM, type: "RECEIPT", createdById: USER, ...invalid },
      )).rejects.toMatchObject({ statusCode: 422 });
    }
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects zero, fractional and reasonless adjustments before opening a transaction", async () => {
    for (const input of [
      { quantity: 0, reason: "Count correction" },
      { quantity: 1.5, reason: "Count correction" },
      { quantity: 2, reason: "   " },
    ]) {
      await expect(adjustInventoryStock(
        { businessId: BUSINESS, branchId: SOURCE, userId: USER },
        { inventoryItemId: ITEM, createdById: USER, ...input },
      )).rejects.toMatchObject({ statusCode: 422 });
    }
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("deducts damaged quantities from available stock and preserves batch trace", async () => {
    db.inventoryItem.findFirst.mockResolvedValue({ id: ITEM, businessId: BUSINESS, ownerBranchId: SOURCE, isActive: true });
    db.branch.findFirst.mockResolvedValue({ id: SOURCE, businessId: BUSINESS, isActive: true });
    db.inventoryStock.upsert.mockResolvedValue({ id: "stock-damaged", quantity: 9, reservedQuantity: 2, averageUnitCost: 125 });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-damaged", quantity: 9, reservedQuantity: 2, averageUnitCost: 125 });
    db.inventoryStock.update.mockResolvedValue({ id: "stock-damaged", quantity: 6 });
    db.inventoryMovement.create.mockResolvedValue({ id: "movement-damaged", type: "DAMAGED" });

    const result = await createInventoryMovement(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      {
        inventoryItemId: ITEM,
        quantity: 3,
        type: "DAMAGED",
        reason: "Container leaked in storage",
        batchNumber: "LOT-DMG-01",
        expiryDate: new Date("2027-03-01"),
        createdById: USER,
      },
    );

    expect(db.inventoryStock.update).toHaveBeenCalledWith({
      where: { id: "stock-damaged" },
      data: { quantity: 6 },
    });
    expect(db.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "DAMAGED",
        quantity: 3,
        resultingQuantity: 6,
        reason: "Container leaked in storage",
        batchNumber: "LOT-DMG-01",
        expiryDate: new Date("2027-03-01"),
      }),
    });
    expect(result.stock.quantity).toBe(6);
  });

  it("requires an audit reason for returns, waste, damage and expiry movements", async () => {
    for (const type of ["RETURN", "WASTE", "DAMAGED", "EXPIRED"] as const) {
      await expect(createInventoryMovement(
        { businessId: BUSINESS, branchId: SOURCE, userId: USER },
        { inventoryItemId: ITEM, quantity: 1, type, createdById: USER },
      )).rejects.toMatchObject({ statusCode: 422 });
    }
    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("requires batch and a non-future expiry date for expired-stock movements", async () => {
    await expect(createInventoryMovement(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      { inventoryItemId: ITEM, quantity: 1, type: "EXPIRED", createdById: USER, reason: "Expired product", batchNumber: "LOT-1" },
    )).rejects.toMatchObject({ statusCode: 422 });
    await expect(createInventoryMovement(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      { inventoryItemId: ITEM, quantity: 1, type: "EXPIRED", createdById: USER, reason: "Expired product", expiryDate: new Date("2025-01-01") },
    )).rejects.toMatchObject({ statusCode: 422 });
    await expect(createInventoryMovement(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      { inventoryItemId: ITEM, quantity: 1, type: "EXPIRED", createdById: USER, reason: "Expired product", batchNumber: "LOT-1", expiryDate: new Date(Date.now() + 86400000) },
    )).rejects.toMatchObject({ statusCode: 422 });
    await expect(createInventoryMovement(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      { inventoryItemId: ITEM, quantity: 1, type: "RECEIPT", createdById: USER, batchNumber: "LOT-OLD", expiryDate: new Date("2020-01-01") },
    )).rejects.toMatchObject({ statusCode: 422 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects transfers to the same branch", async () => {
    await expect(createInventoryTransfer(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
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
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
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
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
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
      { businessId: BUSINESS, branchId: DESTINATION, userId: USER },
      { transferId: "transfer-1", receivedById: USER, lines: [{ transferLineId: "line-1", quantity: 3 }] },
    );
    expect(db.inventoryStock.update).toHaveBeenCalledWith({ where: { id: "stock-2" }, data: { quantity: 5, averageUnitCost: 115 } });
    expect(db.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "TRANSFER_IN", branchId: DESTINATION, resultingQuantity: 5 }) });
  });

  it("rejects transfers to a destination branch outside the active business", async () => {
    db.branch.findFirst
      .mockResolvedValueOnce({ id: SOURCE, isActive: true })
      .mockResolvedValueOnce(null);
    await expect(createInventoryTransfer(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      { destinationBranchId: "foreign-business-branch", transferNumber: "TR-FOREIGN", createdById: USER, lines: [{ inventoryItemId: ITEM, quantity: 1 }] },
    )).rejects.toMatchObject({ statusCode: 404 });
    expect(db.inventoryItem.findMany).not.toHaveBeenCalled();
    expect(db.inventoryTransfer.create).not.toHaveBeenCalled();
  });

  it("allows a transfer receipt only from its destination branch", async () => {
    db.inventoryTransfer.findFirst.mockResolvedValue(null);
    await expect(receiveInventoryTransfer(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      { transferId: "transfer-owned-by-another-branch", receivedById: USER, lines: [{ transferLineId: "line-1", quantity: 1 }] },
    )).rejects.toMatchObject({ statusCode: 404 });
    expect(db.inventoryTransfer.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "transfer-owned-by-another-branch", businessId: BUSINESS, destinationBranchId: SOURCE },
    }));
    expect(db.inventoryStock.upsert).not.toHaveBeenCalled();
    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("creates a stocktake snapshot with expected and counted quantities", async () => {
    db.branch.findFirst.mockResolvedValue({ id: SOURCE, isActive: true });
    db.inventoryItem.findMany.mockResolvedValue([{ id: ITEM }]);
    db.inventoryStock.upsert.mockResolvedValue({ id: "stock-1" });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", quantity: 7, reservedQuantity: 0 });
    db.inventoryStocktake.create.mockResolvedValue({ id: "count-1" });
    await createInventoryStocktake(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
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
    await expect(listInventoryStocktakes({ businessId: BUSINESS, branchId: SOURCE, userId: USER })).resolves.toEqual({ stocktakes: [{ id: "count-1" }] });
    expect(db.inventoryStocktake.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: BUSINESS, branchId: SOURCE } }));
  });

  it("requires a submitted stocktake and a different user to approve it", async () => {
    db.inventoryStocktake.update.mockResolvedValue({ id: "count-1", status: "SUBMITTED" });
    db.inventoryStocktake.findFirst.mockResolvedValue({ id: "count-1", status: "DRAFT", createdById: USER });
    await expect(submitInventoryStocktake({ businessId: BUSINESS, branchId: SOURCE, userId: USER }, { stocktakeId: "count-1", submittedById: USER })).resolves.toBeDefined();
    expect(db.inventoryStocktake.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUBMITTED" }) }));
    db.inventoryStocktake.findFirst.mockResolvedValue({ id: "count-1", status: "SUBMITTED", createdById: USER });
    await expect(approveInventoryStocktake({ businessId: BUSINESS, branchId: SOURCE, userId: USER }, { stocktakeId: "count-1", approvedById: USER })).rejects.toMatchObject({ statusCode: 403 });
    expect(db.inventoryStocktake.update).toHaveBeenCalledTimes(1);
  });

  it("prevents the stocktake submitter from approving their own submission", async () => {
    db.inventoryStocktake.findFirst.mockResolvedValue({
      id: "count-2", status: "SUBMITTED", createdById: "creator-1", submittedById: "submitter-2",
    });
    await expect(approveInventoryStocktake(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      { stocktakeId: "count-2", approvedById: "submitter-2" },
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(db.inventoryStocktake.update).not.toHaveBeenCalled();
  });

  it("does not apply a stocktake before independent approval", async () => {
    db.inventoryStocktake.findFirst.mockResolvedValue({ id: "count-1", status: "SUBMITTED", lines: [] });
    await expect(applyInventoryStocktake({ businessId: BUSINESS, branchId: SOURCE, userId: USER }, { stocktakeId: "count-1", appliedById: "manager-2" })).rejects.toMatchObject({ statusCode: 422 });
    expect(db.inventoryStocktake.update).not.toHaveBeenCalled();
  });

  it("rejects a stocktake variance that would make the latest balance negative", async () => {
    db.inventoryStocktake.findFirst.mockResolvedValue({
      id: "count-negative", reference: "COUNT-NEG", status: "APPROVED",
      lines: [{ id: "line-1", inventoryItemId: ITEM, expectedQuantity: 5, countedQuantity: 1, variance: -4 }],
    });
    db.inventoryStock.upsert.mockResolvedValue({ id: "stock-1" });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", quantity: 2, reservedQuantity: 0 });
    await expect(applyInventoryStocktake(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      { stocktakeId: "count-negative", appliedById: "manager-2" },
    )).rejects.toMatchObject({ statusCode: 422 });
    expect(db.inventoryStock.update).not.toHaveBeenCalled();
    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
    expect(db.inventoryStocktake.update).not.toHaveBeenCalled();
  });

  it("applies the recorded stocktake variance to the latest balance and preserves the count snapshot", async () => {
    db.inventoryStocktake.findFirst.mockResolvedValue({
      id: "count-1", reference: "COUNT-1", status: "APPROVED",
      lines: [{ id: "line-1", inventoryItemId: ITEM, expectedQuantity: 4, countedQuantity: 6, variance: 2 }],
    });
    db.inventoryStock.upsert.mockResolvedValue({ id: "stock-1" });
    // A receipt of one unit occurred after the count was taken.
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", quantity: 5, reservedQuantity: 0 });
    db.inventoryStock.update.mockResolvedValue({ id: "stock-1", quantity: 7 });
    db.inventoryStocktake.update.mockResolvedValue({ id: "count-1", status: "APPLIED", appliedById: "manager-2" });
    await applyInventoryStocktake({ businessId: BUSINESS, branchId: SOURCE, userId: USER }, { stocktakeId: "count-1", appliedById: "manager-2" });
    expect(db.inventoryStock.update).toHaveBeenCalledWith({ where: { id: "stock-1" }, data: { quantity: 7 } });
    expect(db.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "STOCKTAKE", quantity: 2, resultingQuantity: 7 }) });
    expect(db.inventoryStocktakeLine.update).not.toHaveBeenCalled();
    expect(db.inventoryStocktake.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "APPLIED", appliedById: "manager-2" }) }));
  });

  it("rejects reservations that expire in the past", async () => {
    await expect(createInventoryReservation(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
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
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      { inventoryItemId: ITEM, quantity: 2, createdById: USER },
    )).rejects.toMatchObject({ statusCode: 422 });
    expect(db.inventoryReservation.create).not.toHaveBeenCalled();
  });

  it("does not change stock when the reservation balance is inconsistent", async () => {
    db.inventoryReservation.findFirst.mockResolvedValue({ id: "reservation-2", inventoryItemId: ITEM, quantity: 3, reference: null, createdById: USER });
    db.inventoryStock.findUnique.mockResolvedValue({ id: "stock-2" });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-2", quantity: 5, reservedQuantity: 2 });
    await expect(releaseInventoryReservation(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      { reservationId: "reservation-2", consumed: true, actedById: "consumer-2" },
    )).rejects.toMatchObject({ statusCode: 409 });
    expect(db.inventoryStock.update).not.toHaveBeenCalled();
    expect(db.inventoryReservation.update).not.toHaveBeenCalled();
  });

  it("does not release a reservation that is no longer active", async () => {
    db.inventoryReservation.findFirst.mockResolvedValue(null);
    await expect(releaseInventoryReservation(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      { reservationId: "reservation-3", actedById: "manager-2" },
    )).rejects.toMatchObject({ statusCode: 404 });
    expect(db.inventoryStock.findUnique).not.toHaveBeenCalled();
  });

  it("does not consume an expired reservation while the expiry scheduler is pending", async () => {
    db.inventoryReservation.findFirst.mockResolvedValue({
      id: "reservation-expired", inventoryItemId: ITEM, quantity: 2,
      createdById: USER, expiresAt: new Date(Date.now() - 1000),
    });
    await expect(releaseInventoryReservation(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      { reservationId: "reservation-expired", consumed: true, actedById: "consumer-2" },
    )).rejects.toMatchObject({ statusCode: 422 });
    expect(db.inventoryStock.findUnique).not.toHaveBeenCalled();
    expect(db.inventoryStock.update).not.toHaveBeenCalled();
    expect(db.inventoryReservation.update).not.toHaveBeenCalled();
  });

  it("consumes an active reservation atomically and writes an issue movement", async () => {
    db.inventoryReservation.findFirst.mockResolvedValue({ id: "reservation-1", inventoryItemId: ITEM, quantity: 2, reference: "ORDER-1", createdById: USER });
    db.inventoryStock.findUnique.mockResolvedValue({ id: "stock-1" });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", quantity: 5, reservedQuantity: 2 });
    db.inventoryStock.update.mockResolvedValue({});
    db.inventoryMovement.create.mockResolvedValue({});
    db.inventoryReservation.update.mockResolvedValue({ id: "reservation-1", status: "CONSUMED" });
    await releaseInventoryReservation(
      { businessId: BUSINESS, branchId: SOURCE, userId: USER },
      { reservationId: "reservation-1", consumed: true, actedById: "consumer-2" },
    );
    expect(db.inventoryStock.update).toHaveBeenCalledWith({ where: { id: "stock-1" }, data: { reservedQuantity: { decrement: 2 }, quantity: { decrement: 2 } } });
    expect(db.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "ISSUE", quantity: 2, resultingQuantity: 3, createdById: "consumer-2" }) });
  });
});
