import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    inventorySupplier: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    inventoryPurchaseOrder: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    inventoryPurchaseOrderLine: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    inventoryGoodsReceipt: { create: vi.fn() },
    inventoryStock: { upsert: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    branch: { findFirst: vi.fn() },
    inventoryItem: { findMany: vi.fn() },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({ prisma: db }));

import {
  createInventorySupplier,
  createInventoryPurchaseOrder,
  receiveInventoryPurchaseOrder,
} from "../../src/modules/inventory/inventory.service.js";

beforeEach(() => {
  vi.clearAllMocks();
  db.$queryRaw.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (input: readonly unknown[] | ((tx: typeof db) => unknown)) =>
    typeof input === "function" ? input(db) : Promise.all(input),
  );
});

describe("inventory procurement service", () => {
  it("creates suppliers within the authenticated business", async () => {
    db.inventorySupplier.create.mockResolvedValue({ id: "supplier-1", businessId: "biz-A", name: "Clean Supply" });
    const result = await createInventorySupplier({ businessId: "biz-A" }, { name: " Clean Supply ", email: "sales@example.com" });
    expect(result).toMatchObject({ businessId: "biz-A", name: "Clean Supply" });
    expect(db.inventorySupplier.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ businessId: "biz-A", name: "Clean Supply", email: "sales@example.com" }),
    });
  });

  it("rejects purchase orders for a branch or supplier outside the business", async () => {
    db.branch.findFirst.mockResolvedValue({ id: "branch-A", businessId: "biz-A", isActive: true });
    db.inventorySupplier.findFirst.mockResolvedValue(null);
    await expect(createInventoryPurchaseOrder(
      { businessId: "biz-A", branchId: "branch-A" },
      { supplierId: "supplier-B", orderNumber: "PO-1", createdById: "user-A", lines: [{ inventoryItemId: "item-A", quantityOrdered: 5, unitCost: 100 }] },
    )).rejects.toMatchObject({ statusCode: 404, message: "Supplier not found or inactive for this business" });
    expect(db.inventoryPurchaseOrder.create).not.toHaveBeenCalled();
  });

  it("records a partial goods receipt, updates stock and keeps the order partially received", async () => {
    const line = { id: "line-1", purchaseOrderId: "po-1", inventoryItemId: "item-1", quantityOrdered: 10, quantityReceived: 0, unitCost: 250 };
    db.inventoryPurchaseOrder.findFirst.mockResolvedValue({
      id: "po-1", status: "ORDERED", lines: [line],
    });
    db.inventoryPurchaseOrderLine.findFirst.mockResolvedValue({
      ...line, inventoryItem: { id: "item-1", name: "Detergent", isActive: true },
    });
    db.inventoryGoodsReceipt.create.mockResolvedValue({ id: "receipt-1", receiptNumber: "GRN-1", lines: [{ id: "receipt-line-1", quantity: 4 }] });
    db.inventoryPurchaseOrderLine.findUniqueOrThrow.mockResolvedValue(line);
    db.inventoryStock.upsert.mockResolvedValue({ id: "stock-1", quantity: 0 });
    db.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", quantity: 0 });
    db.inventoryStock.update.mockResolvedValue({ id: "stock-1", quantity: 4 });
    db.inventoryPurchaseOrderLine.findMany.mockResolvedValue([{ ...line, quantityReceived: 4 }]);
    db.inventoryPurchaseOrder.update.mockResolvedValue({ id: "po-1", status: "PARTIALLY_RECEIVED" });

    const result = await receiveInventoryPurchaseOrder(
      { businessId: "biz-A", branchId: "branch-A" },
      { purchaseOrderId: "po-1", receiptNumber: "GRN-1", receivedById: "user-A", lines: [{ purchaseOrderLineId: "line-1", quantity: 4 }] },
    );

    expect(result.status).toBe("PARTIALLY_RECEIVED");
    expect(db.inventoryPurchaseOrderLine.update).toHaveBeenCalledWith({
      where: { id: "line-1" }, data: { quantityReceived: { increment: 4 } },
    });
    expect(db.inventoryStock.update).toHaveBeenCalledWith({ where: { id: "stock-1" }, data: { quantity: 4 } });
    expect(db.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ businessId: "biz-A", branchId: "branch-A", inventoryItemId: "item-1", quantity: 4, type: "RECEIPT", resultingQuantity: 4, reference: "GRN-1" }),
    });
  });

  it("rejects a receipt quantity above the outstanding purchase order quantity", async () => {
    const line = { id: "line-1", purchaseOrderId: "po-1", inventoryItemId: "item-1", quantityOrdered: 5, quantityReceived: 4, unitCost: 250 };
    db.inventoryPurchaseOrder.findFirst.mockResolvedValue({ id: "po-1", status: "PARTIALLY_RECEIVED", lines: [line] });
    db.inventoryPurchaseOrderLine.findFirst.mockResolvedValue({
      ...line, inventoryItem: { id: "item-1", name: "Detergent", isActive: true },
    });
    await expect(receiveInventoryPurchaseOrder(
      { businessId: "biz-A", branchId: "branch-A" },
      { purchaseOrderId: "po-1", receiptNumber: "GRN-2", receivedById: "user-A", lines: [{ purchaseOrderLineId: "line-1", quantity: 2 }] },
    )).rejects.toMatchObject({ statusCode: 422, message: "Received quantity exceeds the outstanding quantity for Detergent" });
    expect(db.inventoryGoodsReceipt.create).not.toHaveBeenCalled();
    expect(db.inventoryStock.update).not.toHaveBeenCalled();
  });
});
