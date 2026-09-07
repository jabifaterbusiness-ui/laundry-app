import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    inventoryItem: {
      update: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    inventoryStock: {
      upsert: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    inventoryMovement: {
      create: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  createInventoryItem,
  updateInventoryItem,
  createInventoryMovement,
  adjustInventoryStock,
  listInventoryItems,
  listInventoryStock,
  type CreateInventoryMovementInput,
} from "../../src/modules/inventory/inventory.service.js";

function mockTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (
      input:
        | readonly unknown[]
        | ((tx: typeof prismaMock) => unknown),
    ) => {
      if (typeof input === "function") {
        return input(prismaMock);
      }

      return Promise.all(input);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction();
});

describe("inventory.service", () => {
  describe("createInventoryMovement", () => {
    it("increases stock for a RECEIPT and records the resulting balance", async () => {
      const item = {
        id: "item-1",
        businessId: "biz-A",
        name: "Laundry Detergent",
        isActive: true,
      };

      const stock = {
        id: "stock-1",
        businessId: "biz-A",
        branchId: "branch-A",
        inventoryItemId: "item-1",
        quantity: 10,
      };

      const updatedStock = { ...stock, quantity: 15 };

      const movement = {
        id: "movement-1",
        businessId: "biz-A",
        branchId: "branch-A",
        inventoryItemId: "item-1",
        quantity: 5,
        type: "RECEIPT",
        resultingQuantity: 15,
        createdById: "user-1",
      };

      prismaMock.inventoryItem.findFirst.mockResolvedValue(item);
      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
        businessId: "biz-A",
      });
      prismaMock.inventoryStock.upsert.mockResolvedValue(stock);
      prismaMock.inventoryStock.update.mockResolvedValue(updatedStock);
      prismaMock.inventoryMovement.create.mockResolvedValue(movement);

      const input: CreateInventoryMovementInput = {
        inventoryItemId: "item-1",
        quantity: 5,
        type: "RECEIPT",
        createdById: "user-1",
      };

      const result = await createInventoryMovement({
        businessId: "biz-A",
        branchId: "branch-A",
      }, input);

      expect(result).toEqual({
        movement,
        stock: updatedStock,
        inventoryItem: item,
      });
      expect(prismaMock.inventoryStock.update).toHaveBeenCalledWith({
        where: { id: "stock-1" },
        data: { quantity: 15 },
      });
      expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          businessId: "biz-A",
          branchId: "branch-A",
          inventoryItemId: "item-1",
          quantity: 5,
          type: "RECEIPT",
          resultingQuantity: 15,
          reason: null,
          reference: null,
          createdById: "user-1",
        },
      });
    });

    it("decreases stock for an ISSUE", async () => {
      prismaMock.inventoryItem.findFirst.mockResolvedValue({
        id: "item-1",
        businessId: "biz-A",
        isActive: true,
      });
      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
        businessId: "biz-A",
      });
      prismaMock.inventoryStock.upsert.mockResolvedValue({
        id: "stock-1",
        quantity: 10,
      });
      prismaMock.inventoryStock.update.mockResolvedValue({
        id: "stock-1",
        quantity: 6,
      });
      prismaMock.inventoryMovement.create.mockResolvedValue({
        id: "movement-2",
        type: "ISSUE",
        quantity: 4,
        resultingQuantity: 6,
      });

      const result = await createInventoryMovement({
        businessId: "biz-A",
        branchId: "branch-A",
      }, {
        inventoryItemId: "item-1",
        quantity: 4,
        type: "ISSUE",
        createdById: "user-1",
      });

      expect(result.stock.quantity).toBe(6);
      expect(prismaMock.inventoryStock.update).toHaveBeenCalledWith({
        where: { id: "stock-1" },
        data: { quantity: 6 },
      });
    });
  });
});

    it("rejects an ISSUE that would make stock negative", async () => {
      prismaMock.inventoryItem.findFirst.mockResolvedValue({
        id: "item-1",
        businessId: "biz-A",
        isActive: true,
      });
      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
        businessId: "biz-A",
      });
      prismaMock.inventoryStock.upsert.mockResolvedValue({
        id: "stock-1",
        quantity: 3,
      });

      await expect(
        createInventoryMovement({
          businessId: "biz-A",
          branchId: "branch-A",
        }, {
          inventoryItemId: "item-1",
          quantity: 4,
          type: "ISSUE",
          createdById: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Insufficient inventory stock",
        statusCode: 422,
      });

      expect(prismaMock.inventoryStock.update).not.toHaveBeenCalled();
      expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("rejects an inventory item outside the authenticated business", async () => {
      prismaMock.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(
        createInventoryMovement({
          businessId: "biz-A",
          branchId: "branch-A",
        }, {
          inventoryItemId: "item-from-biz-B",
          quantity: 5,
          type: "RECEIPT",
          createdById: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Inventory item not found",
        statusCode: 404,
      });

      expect(prismaMock.inventoryItem.findFirst).toHaveBeenCalledWith({
        where: {
          id: "item-from-biz-B",
          businessId: "biz-A",
        },
      });
      expect(prismaMock.branch.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.inventoryStock.upsert).not.toHaveBeenCalled();
      expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("rejects a branch outside the authenticated business", async () => {
      prismaMock.inventoryItem.findFirst.mockResolvedValue({
        id: "item-1",
        businessId: "biz-A",
        isActive: true,
      });
      prismaMock.branch.findFirst.mockResolvedValue(null);

      await expect(
        createInventoryMovement({
          businessId: "biz-A",
          branchId: "branch-from-biz-B",
        }, {
          inventoryItemId: "item-1",
          quantity: 5,
          type: "RECEIPT",
          createdById: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Branch not found",
        statusCode: 404,
      });

      expect(prismaMock.branch.findFirst).toHaveBeenCalledWith({
        where: {
          id: "branch-from-biz-B",
          businessId: "biz-A",
        },
      });
      expect(prismaMock.inventoryStock.upsert).not.toHaveBeenCalled();
      expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("rejects movements for inactive inventory items", async () => {
      prismaMock.inventoryItem.findFirst.mockResolvedValue({
        id: "item-1",
        businessId: "biz-A",
        isActive: false,
      });

      await expect(
        createInventoryMovement({
          businessId: "biz-A",
          branchId: "branch-A",
        }, {
          inventoryItemId: "item-1",
          quantity: 5,
          type: "RECEIPT",
          createdById: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Cannot create movement for an inactive inventory item",
        statusCode: 422,
      });

      expect(prismaMock.branch.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.inventoryStock.upsert).not.toHaveBeenCalled();
      expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("creates a stock row when the first RECEIPT is recorded", async () => {
      prismaMock.inventoryItem.findFirst.mockResolvedValue({
        id: "item-2",
        businessId: "biz-A",
        isActive: true,
      });
      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
        businessId: "biz-A",
      });
      prismaMock.inventoryStock.upsert.mockResolvedValue({
        id: "stock-2",
        businessId: "biz-A",
        branchId: "branch-A",
        inventoryItemId: "item-2",
        quantity: 0,
      });
      prismaMock.inventoryStock.update.mockResolvedValue({
        id: "stock-2",
        quantity: 20,
      });
      prismaMock.inventoryMovement.create.mockResolvedValue({
        id: "movement-3",
        type: "RECEIPT",
        quantity: 20,
        resultingQuantity: 20,
      });

      await createInventoryMovement({
        businessId: "biz-A",
        branchId: "branch-A",
      }, {
        inventoryItemId: "item-2",
        quantity: 20,
        type: "RECEIPT",
        createdById: "user-1",
      });

      expect(prismaMock.inventoryStock.upsert).toHaveBeenCalledWith({
        where: {
          inventoryItemId_branchId: {
            inventoryItemId: "item-2",
            branchId: "branch-A",
          },
        },
        create: {
          businessId: "biz-A",
          branchId: "branch-A",
          inventoryItemId: "item-2",
          quantity: 0,
        },
        update: {},
      });
      expect(prismaMock.inventoryStock.update).toHaveBeenCalledWith({
        where: { id: "stock-2" },
        data: { quantity: 20 },
      });
    });

  describe("adjustInventoryStock", () => {
    it("increases stock for a positive adjustment and records the resulting balance", async () => {
      const item = {
        id: "item-1",
        businessId: "biz-A",
        name: "Laundry Detergent",
        isActive: true,
      };

      const stock = {
        id: "stock-1",
        businessId: "biz-A",
        branchId: "branch-A",
        inventoryItemId: "item-1",
        quantity: 10,
      };

      const updatedStock = { ...stock, quantity: 15 };

      const movement = {
        id: "movement-adjustment-1",
        businessId: "biz-A",
        branchId: "branch-A",
        inventoryItemId: "item-1",
        quantity: 5,
        type: "ADJUSTMENT",
        resultingQuantity: 15,
        reason: "Physical stock count",
        reference: "COUNT-001",
        createdById: "user-1",
      };

      prismaMock.inventoryItem.findFirst.mockResolvedValue(item);
      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
        businessId: "biz-A",
      });
      prismaMock.inventoryStock.upsert.mockResolvedValue(stock);
      prismaMock.inventoryStock.update.mockResolvedValue(updatedStock);
      prismaMock.inventoryMovement.create.mockResolvedValue(movement);

      const result = await adjustInventoryStock(
        {
          businessId: "biz-A",
          branchId: "branch-A",
        },
        {
          inventoryItemId: "item-1",
          quantity: 5,
          reason: "Physical stock count",
          reference: "COUNT-001",
          createdById: "user-1",
        },
      );

      expect(result).toEqual({
        movement,
        stock: updatedStock,
        inventoryItem: item,
      });

      expect(prismaMock.inventoryStock.update).toHaveBeenCalledWith({
        where: { id: "stock-1" },
        data: { quantity: 15 },
      });

      expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          businessId: "biz-A",
          branchId: "branch-A",
          inventoryItemId: "item-1",
          quantity: 5,
          type: "ADJUSTMENT",
          resultingQuantity: 15,
          reason: "Physical stock count",
          reference: "COUNT-001",
          createdById: "user-1",
        },
      });
    });
  });

    it("decreases stock for a negative adjustment and records the resulting balance", async () => {
      const item = {
        id: "item-1",
        businessId: "biz-A",
        name: "Laundry Detergent",
        isActive: true,
      };

      const stock = {
        id: "stock-1",
        businessId: "biz-A",
        branchId: "branch-A",
        inventoryItemId: "item-1",
        quantity: 10,
      };

      const updatedStock = { ...stock, quantity: 7 };

      const movement = {
        id: "movement-adjustment-2",
        businessId: "biz-A",
        branchId: "branch-A",
        inventoryItemId: "item-1",
        quantity: -3,
        type: "ADJUSTMENT",
        resultingQuantity: 7,
        reason: "Damaged items removed",
        reference: null,
        createdById: "user-1",
      };

      prismaMock.inventoryItem.findFirst.mockResolvedValue(item);
      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
        businessId: "biz-A",
      });
      prismaMock.inventoryStock.upsert.mockResolvedValue(stock);
      prismaMock.inventoryStock.update.mockResolvedValue(updatedStock);
      prismaMock.inventoryMovement.create.mockResolvedValue(movement);

      const result = await adjustInventoryStock(
        {
          businessId: "biz-A",
          branchId: "branch-A",
        },
        {
          inventoryItemId: "item-1",
          quantity: -3,
          reason: "Damaged items removed",
          createdById: "user-1",
        },
      );

      expect(result.stock.quantity).toBe(7);

      expect(prismaMock.inventoryStock.update).toHaveBeenCalledWith({
        where: { id: "stock-1" },
        data: { quantity: 7 },
      });

      expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          businessId: "biz-A",
          branchId: "branch-A",
          inventoryItemId: "item-1",
          quantity: -3,
          type: "ADJUSTMENT",
          resultingQuantity: 7,
          reason: "Damaged items removed",
          reference: null,
          createdById: "user-1",
        },
      });
    });

    it("rejects a negative adjustment that would make stock negative", async () => {
      prismaMock.inventoryItem.findFirst.mockResolvedValue({
        id: "item-1",
        businessId: "biz-A",
        isActive: true,
      });

      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
        businessId: "biz-A",
      });

      prismaMock.inventoryStock.upsert.mockResolvedValue({
        id: "stock-1",
        businessId: "biz-A",
        branchId: "branch-A",
        inventoryItemId: "item-1",
        quantity: 3,
      });

      await expect(
        adjustInventoryStock(
          {
            businessId: "biz-A",
            branchId: "branch-A",
          },
          {
            inventoryItemId: "item-1",
            quantity: -5,
            reason: "Stock correction",
            createdById: "user-1",
          },
        ),
      ).rejects.toMatchObject({
        message: "Inventory adjustment cannot make stock negative",
        statusCode: 422,
      });

      expect(prismaMock.inventoryStock.update).not.toHaveBeenCalled();
      expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("rejects an inventory item outside the authenticated business", async () => {
      prismaMock.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(
        adjustInventoryStock(
          {
            businessId: "biz-A",
            branchId: "branch-A",
          },
          {
            inventoryItemId: "item-from-biz-B",
            quantity: 5,
            reason: "Stock correction",
            createdById: "user-1",
          },
        ),
      ).rejects.toMatchObject({
        message: "Inventory item not found",
        statusCode: 404,
      });

      expect(prismaMock.inventoryItem.findFirst).toHaveBeenCalledWith({
        where: {
          id: "item-from-biz-B",
          businessId: "biz-A",
        },
      });
      expect(prismaMock.branch.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.inventoryStock.upsert).not.toHaveBeenCalled();
      expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("rejects adjustments for inactive inventory items", async () => {
      prismaMock.inventoryItem.findFirst.mockResolvedValue({
        id: "item-1",
        businessId: "biz-A",
        isActive: false,
      });

      await expect(
        adjustInventoryStock(
          {
            businessId: "biz-A",
            branchId: "branch-A",
          },
          {
            inventoryItemId: "item-1",
            quantity: 5,
            reason: "Stock correction",
            createdById: "user-1",
          },
        ),
      ).rejects.toMatchObject({
        message: "Cannot adjust stock for an inactive inventory item",
        statusCode: 422,
      });

      expect(prismaMock.branch.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.inventoryStock.upsert).not.toHaveBeenCalled();
      expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("rejects a branch outside the authenticated business", async () => {
      prismaMock.inventoryItem.findFirst.mockResolvedValue({
        id: "item-1",
        businessId: "biz-A",
        isActive: true,
      });

      prismaMock.branch.findFirst.mockResolvedValue(null);

      await expect(
        adjustInventoryStock(
          {
            businessId: "biz-A",
            branchId: "branch-from-biz-B",
          },
          {
            inventoryItemId: "item-1",
            quantity: 5,
            reason: "Stock correction",
            createdById: "user-1",
          },
        ),
      ).rejects.toMatchObject({
        message: "Branch not found",
        statusCode: 404,
      });

      expect(prismaMock.branch.findFirst).toHaveBeenCalledWith({
        where: {
          id: "branch-from-biz-B",
          businessId: "biz-A",
        },
      });
      expect(prismaMock.inventoryStock.upsert).not.toHaveBeenCalled();
      expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
    });

  describe("createInventoryItem", () => {
    it("creates an inventory item within the authenticated business", async () => {
      prismaMock.inventoryItem.create.mockResolvedValue({
        id: "item-1",
        businessId: "biz-A",
        name: "Laundry Detergent",
        description: "5 litre detergent",
        unit: "LITRE",
        lowStockThreshold: 10,
        isActive: true,
      });


      const result = await createInventoryItem({
        businessId: "biz-A",
      }, {
        name: " Laundry Detergent ",
        description: " 5 litre detergent ",
        unit: "LITRE",
        lowStockThreshold: 10,
      });

      expect(result).toEqual({
        id: "item-1",
        businessId: "biz-A",
        name: "Laundry Detergent",
        description: "5 litre detergent",
        unit: "LITRE",
        lowStockThreshold: 10,
        isActive: true,
      });
      expect(prismaMock.inventoryItem.create).toHaveBeenCalledWith({
        data: {
          businessId: "biz-A",
          name: "Laundry Detergent",
          description: "5 litre detergent",
          unit: "LITRE",
          lowStockThreshold: 10,
        },
      });
    });
  });

    it("rejects a duplicate inventory item name within the same business", async () => {
      prismaMock.inventoryItem.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.0.0",
      }));

      await expect(
        createInventoryItem({
          businessId: "biz-A",
        }, {
          name: "Laundry Detergent",
          unit: "LITRE",
        }),
      ).rejects.toMatchObject({
        message: "An inventory item with this name already exists",
        statusCode: 409,
      });

      expect(prismaMock.inventoryItem.create).toHaveBeenCalledWith({
        data: {
          businessId: "biz-A",
          name: "Laundry Detergent",
          description: null,
          unit: "LITRE",
          lowStockThreshold: 0,
        },
      });
    });

  describe("listInventoryItems", () => {
  it("lists inventory items for the authenticated business with pagination", async () => {
    const items = [
      {
        id: "item-1",
        businessId: "business-1",
        name: "Fabric Softener",
      },
      {
        id: "item-2",
        businessId: "business-1",
        name: "Laundry Detergent",
      },
    ];

    prismaMock.inventoryItem.findMany.mockResolvedValue(items);
    prismaMock.inventoryItem.count.mockResolvedValue(2);

    const result = await listInventoryItems(
      { businessId: "business-1" },
      {
        page: 1,
        pageSize: 10,
      },
    );

    expect(result).toEqual({
      items,
      pagination: {
        page: 1,
        pageSize: 10,
        total: 2,
        totalPages: 1,
      },
    });

    expect(prismaMock.inventoryItem.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
      },
      orderBy: {
        name: "asc",
      },
      skip: 0,
      take: 10,
    });

    expect(prismaMock.inventoryItem.count).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
      },
    });
  });

  it("filters inventory items by name search", async () => {
    const items = [
      {
        id: "item-1",
        businessId: "business-1",
        name: "Laundry Detergent",
      },
    ];

    prismaMock.inventoryItem.findMany.mockResolvedValue(items);
    prismaMock.inventoryItem.count.mockResolvedValue(1);

    const result = await listInventoryItems(
      { businessId: "business-1" },
      {
        search: "detergent",
        page: 1,
        pageSize: 10,
      },
    );

    expect(result.items).toEqual(items);

    expect(prismaMock.inventoryItem.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        name: {
          contains: "detergent",
          mode: "insensitive",
        },
      },
      orderBy: {
        name: "asc",
      },
      skip: 0,
      take: 10,
    });

    expect(prismaMock.inventoryItem.count).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        name: {
          contains: "detergent",
          mode: "insensitive",
        },
      },
    });
  });

  it("filters inventory items by active status", async () => {
    const items = [
      {
        id: "item-1",
        businessId: "business-1",
        name: "Laundry Detergent",
        isActive: true,
      },
    ];

    prismaMock.inventoryItem.findMany.mockResolvedValue(items);
    prismaMock.inventoryItem.count.mockResolvedValue(1);

    const result = await listInventoryItems(
      { businessId: "business-1" },
      {
        isActive: true,
        page: 1,
        pageSize: 10,
      },
    );

    expect(result.items).toEqual(items);

    expect(prismaMock.inventoryItem.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        isActive: true,
      },
      orderBy: {
        name: "asc",
      },
      skip: 0,
      take: 10,
    });

    expect(prismaMock.inventoryItem.count).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        isActive: true,
      },
    });
  });

  it("calculates the correct offset for later pages", async () => {
    const items = [
      {
        id: "item-11",
        businessId: "business-1",
        name: "Stain Remover",
      },
    ];

    prismaMock.inventoryItem.findMany.mockResolvedValue(items);
    prismaMock.inventoryItem.count.mockResolvedValue(21);

    const result = await listInventoryItems(
      { businessId: "business-1" },
      {
        page: 2,
        pageSize: 10,
      },
    );

    expect(result).toEqual({
      items,
      pagination: {
        page: 2,
        pageSize: 10,
        total: 21,
        totalPages: 3,
      },
    });

    expect(prismaMock.inventoryItem.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
      },
      orderBy: {
        name: "asc",
      },
      skip: 10,
      take: 10,
    });

    expect(prismaMock.inventoryItem.count).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
      },
    });
  });
});

describe("listInventoryItems empty results", () => {
  it("returns an empty result with zero total pages when no inventory items exist", async () => {
    prismaMock.inventoryItem.findMany.mockResolvedValue([]);
    prismaMock.inventoryItem.count.mockResolvedValue(0);

    const result = await listInventoryItems(
      { businessId: "business-1" },
      {
        page: 1,
        pageSize: 10,
      },
    );

    expect(result).toEqual({
      items: [],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      },
    });
  });
});

describe("listInventoryStock", () => {
  it("lists inventory stock for the authenticated business and branch with pagination", async () => {
    const stocks = [
      {
        id: "stock-1",
        businessId: "business-1",
        branchId: "branch-1",
        inventoryItemId: "item-1",
        quantity: 25,
        inventoryItem: {
          id: "item-1",
          name: "Laundry Detergent",
        },
      },
      {
        id: "stock-2",
        businessId: "business-1",
        branchId: "branch-1",
        inventoryItemId: "item-2",
        quantity: 10,
        inventoryItem: {
          id: "item-2",
          name: "Fabric Softener",
        },
      },
    ];

    prismaMock.inventoryStock.findMany.mockResolvedValue(stocks);
    prismaMock.inventoryStock.count.mockResolvedValue(2);

    const result = await listInventoryStock(
      {
        businessId: "business-1",
        branchId: "branch-1",
      },
      {
        page: 1,
        pageSize: 10,
      },
    );

    expect(result).toEqual({
      stocks,
      pagination: {
        page: 1,
        pageSize: 10,
        total: 2,
        totalPages: 1,
      },
    });

    expect(prismaMock.inventoryStock.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        branchId: "branch-1",
      },
      include: {
        inventoryItem: true,
      },
      orderBy: {
        inventoryItem: {
          name: "asc",
        },
      },
      skip: 0,
      take: 10,
    });

    expect(prismaMock.inventoryStock.count).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        branchId: "branch-1",
      },
    });
  });

  it("filters stock by inventory item", async () => {
    const stocks = [
      {
        id: "stock-1",
        businessId: "business-1",
        branchId: "branch-1",
        inventoryItemId: "item-1",
        quantity: 25,
        inventoryItem: {
          id: "item-1",
          name: "Laundry Detergent",
        },
      },
    ];

    prismaMock.inventoryStock.findMany.mockResolvedValue(stocks);
    prismaMock.inventoryStock.count.mockResolvedValue(1);

    const result = await listInventoryStock(
      {
        businessId: "business-1",
        branchId: "branch-1",
      },
      {
        inventoryItemId: "item-1",
        page: 1,
        pageSize: 10,
      },
    );

    expect(result.stocks).toEqual(stocks);

    expect(prismaMock.inventoryStock.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        branchId: "branch-1",
        inventoryItemId: "item-1",
      },
      include: {
        inventoryItem: true,
      },
      orderBy: {
        inventoryItem: {
          name: "asc",
        },
      },
      skip: 0,
      take: 10,
    });

    expect(prismaMock.inventoryStock.count).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        branchId: "branch-1",
        inventoryItemId: "item-1",
      },
    });
  });

  it("filters stock using each inventory item's low-stock threshold", async () => {
    const stocks = [
      {
        id: "stock-1",
        businessId: "business-1",
        branchId: "branch-1",
        inventoryItemId: "item-1",
        quantity: 7,
        inventoryItem: {
          id: "item-1",
          name: "Laundry Detergent",
          lowStockThreshold: 10,
        },
      },
      {
        id: "stock-2",
        businessId: "business-1",
        branchId: "branch-1",
        inventoryItemId: "item-2",
        quantity: 10,
        inventoryItem: {
          id: "item-2",
          name: "Stain Remover",
          lowStockThreshold: 10,
        },
      },
    ];

    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        { id: "stock-1" },
        { id: "stock-2" },
      ])
      .mockResolvedValueOnce([{ count: 2n }]);

    prismaMock.inventoryStock.findMany.mockResolvedValue(stocks);

    const result = await listInventoryStock(
      {
        businessId: "business-1",
        branchId: "branch-1",
      },
      {
        lowStockOnly: true,
        page: 1,
        pageSize: 10,
      },
    );

    expect(result).toEqual({
      stocks,
      pagination: {
        page: 1,
        pageSize: 10,
        total: 2,
        totalPages: 1,
      },
    });

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);

    expect(prismaMock.inventoryStock.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        branchId: "branch-1",
        id: {
          in: ["stock-1", "stock-2"],
        },
      },
      include: {
        inventoryItem: true,
      },
    });
  });

  it("calculates the correct offset for later stock pages", async () => {
    const stocks = [
      {
        id: "stock-11",
        businessId: "business-1",
        branchId: "branch-1",
        inventoryItemId: "item-11",
        quantity: 8,
        inventoryItem: {
          id: "item-11",
          name: "Stain Remover",
        },
      },
    ];

    prismaMock.inventoryStock.findMany.mockResolvedValue(stocks);
    prismaMock.inventoryStock.count.mockResolvedValue(21);

    const result = await listInventoryStock(
      {
        businessId: "business-1",
        branchId: "branch-1",
      },
      {
        page: 2,
        pageSize: 10,
      },
    );

    expect(result).toEqual({
      stocks,
      pagination: {
        page: 2,
        pageSize: 10,
        total: 21,
        totalPages: 3,
      },
    });

    expect(prismaMock.inventoryStock.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        branchId: "branch-1",
      },
      include: {
        inventoryItem: true,
      },
      orderBy: {
        inventoryItem: {
          name: "asc",
        },
      },
      skip: 10,
      take: 10,
    });

    expect(prismaMock.inventoryStock.count).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        branchId: "branch-1",
      },
    });
  });

  it("does not apply the low-stock filter when lowStockOnly is false", async () => {
    const stocks = [
      {
        id: "stock-1",
        businessId: "business-1",
        branchId: "branch-1",
        inventoryItemId: "item-1",
        quantity: 25,
        inventoryItem: {
          id: "item-1",
          name: "Laundry Detergent",
        },
      },
    ];

    prismaMock.inventoryStock.findMany.mockResolvedValue(stocks);
    prismaMock.inventoryStock.count.mockResolvedValue(1);

    const result = await listInventoryStock(
      {
        businessId: "business-1",
        branchId: "branch-1",
      },
      {
        lowStockOnly: false,
        page: 1,
        pageSize: 10,
      },
    );

    expect(result.stocks).toEqual(stocks);

    expect(prismaMock.inventoryStock.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        branchId: "branch-1",
      },
      include: {
        inventoryItem: true,
      },
      orderBy: {
        inventoryItem: {
          name: "asc",
        },
      },
      skip: 0,
      take: 10,
    });

    expect(prismaMock.inventoryStock.count).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        branchId: "branch-1",
      },
    });
  });
});

describe("listInventoryStock empty results", () => {
  it("returns an empty result with zero total pages when no stock exists", async () => {
    prismaMock.inventoryStock.findMany.mockResolvedValue([]);
    prismaMock.inventoryStock.count.mockResolvedValue(0);

    const result = await listInventoryStock(
      {
        businessId: "business-1",
        branchId: "branch-1",
      },
      {
        page: 1,
        pageSize: 10,
      },
    );

    expect(result).toEqual({
      stocks: [],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      },
    });
  });
});

describe("updateInventoryItem", () => {
    it("updates an inventory item within the authenticated business", async () => {
      prismaMock.inventoryItem.findFirst
        .mockResolvedValueOnce({
          id: "item-1",
          businessId: "biz-A",
          name: "Laundry Detergent",
          description: "Old description",
          unit: "LITRE",
          lowStockThreshold: 10,
          isActive: true,
        })
        .mockResolvedValueOnce(null);
      prismaMock.inventoryItem.update.mockResolvedValue({
        id: "item-1",
        businessId: "biz-A",
        name: "Fabric Softener",
        description: "New description",
        unit: "BOTTLE",
        lowStockThreshold: 5,
        isActive: false,
      });

      const result = await updateInventoryItem({
        businessId: "biz-A",
      }, "item-1", {
        name: " Fabric Softener ",
        description: " New description ",
        unit: "BOTTLE",
        lowStockThreshold: 5,
        isActive: false,
      });

      expect(result).toEqual({
        id: "item-1",
        businessId: "biz-A",
        name: "Fabric Softener",
        description: "New description",
        unit: "BOTTLE",
        lowStockThreshold: 5,
        isActive: false,
      });
      expect(prismaMock.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: "item-1" },
        data: {
          name: "Fabric Softener",
          description: "New description",
          unit: "BOTTLE",
          lowStockThreshold: 5,
          isActive: false,
        },
      });
    });
  });

    it("rejects updating an inventory item outside the authenticated business", async () => {
      prismaMock.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(
        updateInventoryItem({
          businessId: "biz-A",
        }, "item-from-biz-B", {
          name: "Unauthorized Update",
        }),
      ).rejects.toMatchObject({
        message: "Inventory item not found",
        statusCode: 404,
      });

      expect(prismaMock.inventoryItem.findFirst).toHaveBeenCalledWith({
        where: {
          id: "item-from-biz-B",
          businessId: "biz-A",
        },
      });
      expect(prismaMock.inventoryItem.update).not.toHaveBeenCalled();
    });

    it("rejects updating an inventory item to a duplicate name within the same business", async () => {
      prismaMock.inventoryItem.findFirst
        .mockResolvedValueOnce({
          id: "item-1",
          businessId: "biz-A",
          name: "Laundry Detergent",
        })
        .mockResolvedValueOnce({
          id: "item-2",
          businessId: "biz-A",
          name: "Fabric Softener",
        });

      await expect(
        updateInventoryItem({
          businessId: "biz-A",
        }, "item-1", {
          name: " Fabric Softener ",
        }),
      ).rejects.toMatchObject({
        message: "An inventory item with this name already exists",
        statusCode: 409,
      });

      expect(prismaMock.inventoryItem.update).not.toHaveBeenCalled();
    });
