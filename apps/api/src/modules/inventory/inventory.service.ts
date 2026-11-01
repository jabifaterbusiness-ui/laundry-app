import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

type BusinessScope = {
  businessId: string;
};

type BranchScope = {
  businessId: string;
  branchId: string;
};

type CreateInventoryItemInput = {
  name: string;
  description?: string;
  unit: "PIECE" | "PACK" | "BOTTLE" | "LITRE" | "KILOGRAM" | "BOX" | "ROLL" | "OTHER";
  lowStockThreshold?: number;
};

export async function createInventoryItem(
  scope: BusinessScope,
  input: CreateInventoryItemInput,
) {
  const name = input.name.trim();

  if (!name) {
    throw new AppError("Inventory item name is required", 422);
  }

  try {
    return await prisma.inventoryItem.create({
      data: {
        businessId: scope.businessId,
        name,
        description: input.description?.trim() || null,
        unit: input.unit,
        lowStockThreshold: input.lowStockThreshold ?? 0,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError(
        "An inventory item with this name already exists",
        409,
      );
    }

    throw error;
  }
}

export type UpdateInventoryItemInput = {
  name?: string;
  description?: string;
  unit?: "PIECE" | "PACK" | "BOTTLE" | "LITRE" | "KILOGRAM" | "BOX" | "ROLL" | "OTHER";
  lowStockThreshold?: number;
  isActive?: boolean;
};

export async function updateInventoryItem(
  scope: BusinessScope,
  inventoryItemId: string,
  input: UpdateInventoryItemInput,
) {
  const existing = await prisma.inventoryItem.findFirst({
    where: {
      id: inventoryItemId,
      businessId: scope.businessId,
    },
  });

  if (!existing) {
    throw new AppError("Inventory item not found", 404);
  }

  const data: Prisma.InventoryItemUpdateInput = {};

  if (input.name !== undefined) {
    const name = input.name.trim();

    if (!name) {
      throw new AppError("Inventory item name is required", 422);
    }

    const duplicate = await prisma.inventoryItem.findFirst({
      where: {
        businessId: scope.businessId,
        name,
        NOT: {
          id: inventoryItemId,
        },
      },
    });

    if (duplicate) {
      throw new AppError(
        "An inventory item with this name already exists",
        409,
      );
    }

    data.name = name;
  }

  if (input.description !== undefined) {
    data.description = input.description.trim() || null;
  }

  if (input.unit !== undefined) {
    data.unit = input.unit;
  }

  if (input.lowStockThreshold !== undefined) {
    data.lowStockThreshold = input.lowStockThreshold;
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }

  try {
    return await prisma.inventoryItem.update({
      where: { id: inventoryItemId },
      data,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError(
        "An inventory item with this name already exists",
        409,
      );
    }

    throw error;
  }
}

export async function listInventoryItems(
  scope: BusinessScope,
  input: {
    isActive?: boolean;
    search?: string;
    page: number;
    pageSize: number;
  },
) {
  const where: Prisma.InventoryItemWhereInput = {
    businessId: scope.businessId,
  };

  if (input.isActive !== undefined) {
    where.isActive = input.isActive;
  }

  if (input.search) {
    where.name = {
      contains: input.search.trim(),
      mode: "insensitive",
    };
  }

  const skip = (input.page - 1) * input.pageSize;

  const [items, total] = await prisma.$transaction([
    prisma.inventoryItem.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: input.pageSize,
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

export async function listInventoryStock(
  scope: BranchScope,
  input: {
    inventoryItemId?: string;
    lowStockOnly?: boolean;
    page: number;
    pageSize: number;
  },
) {
  const where: Prisma.InventoryStockWhereInput = {
    businessId: scope.businessId,
    branchId: scope.branchId,
  };

  if (input.inventoryItemId) {
    where.inventoryItemId = input.inventoryItemId;
  }

  const skip = (input.page - 1) * input.pageSize;

  if (input.lowStockOnly) {
    const itemFilter = input.inventoryItemId
      ? Prisma.sql`AND s.inventory_item_id = ${input.inventoryItemId}`
      : Prisma.empty;

    const [stockRows, countRows] = await prisma.$transaction([
      prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT s.id
          FROM "inventory_stocks" AS s
          INNER JOIN "inventory_items" AS i
            ON i.id = s.inventory_item_id
          WHERE s.business_id = ${scope.businessId}
            AND s.branch_id = ${scope.branchId}
            ${itemFilter}
            AND s.quantity <= i.low_stock_threshold
          ORDER BY i.name ASC, s.id ASC
          LIMIT ${input.pageSize}
          OFFSET ${skip}
        `,
      ),
      prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM "inventory_stocks" AS s
          INNER JOIN "inventory_items" AS i
            ON i.id = s.inventory_item_id
          WHERE s.business_id = ${scope.businessId}
            AND s.branch_id = ${scope.branchId}
            ${itemFilter}
            AND s.quantity <= i.low_stock_threshold
        `,
      ),
    ]);

    const stockIds = stockRows.map((row) => row.id);

    const stocks = stockIds.length
      ? await prisma.inventoryStock.findMany({
          where: {
            ...where,
            id: { in: stockIds },
          },
          include: { inventoryItem: true },
        })
      : [];

    const stockById = new Map(stocks.map((stock) => [stock.id, stock]));
    const orderedStocks = stockIds
      .map((id) => stockById.get(id))
      .filter((stock): stock is NonNullable<typeof stock> => Boolean(stock));

    const total = Number(countRows[0]?.count ?? 0);

    return {
      stocks: orderedStocks,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }

  const [stocks, total] = await prisma.$transaction([
    prisma.inventoryStock.findMany({
      where,
      include: { inventoryItem: true },
      orderBy: { inventoryItem: { name: "asc" } },
      skip,
      take: input.pageSize,
    }),
    prisma.inventoryStock.count({ where }),
  ]);

  return {
    stocks,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

export type CreateInventoryMovementInput = {
  inventoryItemId: string;
  quantity: number;
  type: "RECEIPT" | "ISSUE";
  reason?: string;
  reference?: string;
  createdById: string;
};

export type AdjustInventoryStockInput = {
  inventoryItemId: string;
  quantity: number;
  reason: string;
  reference?: string;
  createdById: string;
};

export async function createInventoryMovement(
  scope: BranchScope,
  input: CreateInventoryMovementInput,
) {
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({
      where: {
        id: input.inventoryItemId,
        businessId: scope.businessId,
      },
    });

    if (!item) {
      throw new AppError("Inventory item not found", 404);
    }

    if (!item.isActive) {
      throw new AppError("Cannot create movement for an inactive inventory item", 422);
    }

    const branch = await tx.branch.findFirst({
      where: {
        id: scope.branchId,
        businessId: scope.businessId,
      },
    });

    if (!branch) {
      throw new AppError("Branch not found", 404);
    }

    const stock = await tx.inventoryStock.upsert({
      where: {
        inventoryItemId_branchId: {
          inventoryItemId: input.inventoryItemId,
          branchId: scope.branchId,
        },
      },
      create: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        inventoryItemId: input.inventoryItemId,
        quantity: 0,
      },
      update: {},
    });

    const change = input.type === "RECEIPT" ? input.quantity : -input.quantity;
    const resultingQuantity = stock.quantity + change;

    if (resultingQuantity < 0) {
      throw new AppError("Insufficient inventory stock", 422);
    }

    const updatedStock = await tx.inventoryStock.update({
      where: { id: stock.id },
      data: { quantity: resultingQuantity },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
        type: input.type,
        resultingQuantity,
        reason: input.reason?.trim() || null,
        reference: input.reference?.trim() || null,
        createdById: input.createdById,
      },
    });

    return { movement, stock: updatedStock, inventoryItem: item };
  });

  return result;
}


export async function adjustInventoryStock(
  scope: BranchScope,
  input: AdjustInventoryStockInput,
) {
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({
      where: {
        id: input.inventoryItemId,
        businessId: scope.businessId,
      },
    });

    if (!item) {
      throw new AppError("Inventory item not found", 404);
    }

    if (!item.isActive) {
      throw new AppError(
        "Cannot adjust stock for an inactive inventory item",
        422,
      );
    }

    const branch = await tx.branch.findFirst({
      where: {
        id: scope.branchId,
        businessId: scope.businessId,
      },
    });

    if (!branch) {
      throw new AppError("Branch not found", 404);
    }

    const stock = await tx.inventoryStock.upsert({
      where: {
        inventoryItemId_branchId: {
          inventoryItemId: input.inventoryItemId,
          branchId: scope.branchId,
        },
      },
      create: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        inventoryItemId: input.inventoryItemId,
        quantity: 0,
      },
      update: {},
    });

    const resultingQuantity = stock.quantity + input.quantity;

    if (resultingQuantity < 0) {
      throw new AppError("Inventory adjustment cannot make stock negative", 422);
    }

    const updatedStock = await tx.inventoryStock.update({
      where: { id: stock.id },
      data: { quantity: resultingQuantity },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
        type: "ADJUSTMENT",
        resultingQuantity,
        reason: input.reason.trim(),
        reference: input.reference?.trim() || null,
        createdById: input.createdById,
      },
    });

    return {
      movement,
      stock: updatedStock,
      inventoryItem: item,
    };
  });

  return result;
}


export async function listInventoryMovements(
  scope: BranchScope,
  input: {
    inventoryItemId?: string;
    type?: "RECEIPT" | "ISSUE" | "ADJUSTMENT";
    page: number;
    pageSize: number;
  },
) {
  const where: Prisma.InventoryMovementWhereInput = {
    businessId: scope.businessId,
    branchId: scope.branchId,
    ...(input.inventoryItemId ? { inventoryItemId: input.inventoryItemId } : {}),
    ...(input.type ? { type: input.type } : {}),
  };
  const skip = (input.page - 1) * input.pageSize;
  const [movements, total] = await prisma.$transaction([
    prisma.inventoryMovement.findMany({
      where,
      include: { inventoryItem: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: input.pageSize,
    }),
    prisma.inventoryMovement.count({ where }),
  ]);
  return {
    movements,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}


export async function createInventorySupplier(scope: BusinessScope, input: {
  name: string; contactName?: string; email?: string; phone?: string;
  address?: string; taxId?: string; notes?: string;
}) {
  try {
    return await prisma.inventorySupplier.create({ data: {
      businessId: scope.businessId, name: input.name.trim(),
      contactName: input.contactName?.trim() || null,
      email: input.email?.trim() || null, phone: input.phone?.trim() || null,
      address: input.address?.trim() || null, taxId: input.taxId?.trim() || null,
      notes: input.notes?.trim() || null,
    } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("A supplier with this name already exists", 409);
    }
    throw error;
  }
}

export async function listInventorySuppliers(scope: BusinessScope, input: {
  search?: string; page: number; pageSize: number;
}) {
  const where: Prisma.InventorySupplierWhereInput = {
    businessId: scope.businessId,
    ...(input.search ? { OR: [
      { name: { contains: input.search, mode: "insensitive" } },
      { contactName: { contains: input.search, mode: "insensitive" } },
      { email: { contains: input.search, mode: "insensitive" } },
    ] } : {}),
  };
  const [suppliers, total] = await prisma.$transaction([
    prisma.inventorySupplier.findMany({ where, orderBy: { name: "asc" }, skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.inventorySupplier.count({ where }),
  ]);
  return { suppliers, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
}

export async function createInventoryPurchaseOrder(scope: BranchScope, input: {
  supplierId: string; orderNumber: string; expectedAt?: Date; notes?: string;
  createdById: string; lines: Array<{ inventoryItemId: string; quantityOrdered: number; unitCost: number }>;
}) {
  return prisma.$transaction(async (tx) => {
    const [branch, supplier] = await Promise.all([
      tx.branch.findFirst({ where: { id: scope.branchId, businessId: scope.businessId, isActive: true } }),
      tx.inventorySupplier.findFirst({ where: { id: input.supplierId, businessId: scope.businessId, isActive: true } }),
    ]);
    if (!branch) throw new AppError("Branch not found or inactive", 404);
    if (!supplier) throw new AppError("Supplier not found or inactive for this business", 404);
    const itemIds = [...new Set(input.lines.map((line) => line.inventoryItemId))];
    if (itemIds.length !== input.lines.length) throw new AppError("Each inventory item may appear only once on a purchase order", 422);
    const items = await tx.inventoryItem.findMany({ where: { id: { in: itemIds }, businessId: scope.businessId, isActive: true }, select: { id: true } });
    if (items.length !== itemIds.length) throw new AppError("One or more inventory items are unavailable in this business", 422);
    try {
      return await tx.inventoryPurchaseOrder.create({ data: {
        businessId: scope.businessId, branchId: scope.branchId, supplierId: supplier.id,
        orderNumber: input.orderNumber.trim(), status: "ORDERED", orderedAt: new Date(),
        expectedAt: input.expectedAt ?? null, notes: input.notes?.trim() || null, createdById: input.createdById,
        lines: { create: input.lines.map((line) => ({
          inventoryItemId: line.inventoryItemId, quantityOrdered: line.quantityOrdered,
          unitCost: line.unitCost,
        })) },
      }, include: { supplier: true, lines: { include: { inventoryItem: true } } } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("A purchase order with this number already exists", 409);
      }
      throw error;
    }
  });
}

export async function listInventoryPurchaseOrders(scope: BranchScope, input: {
  status?: "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  page: number; pageSize: number;
}) {
  const where: Prisma.InventoryPurchaseOrderWhereInput = {
    businessId: scope.businessId, branchId: scope.branchId,
    ...(input.status ? { status: input.status } : {}),
  };
  const [purchaseOrders, total] = await prisma.$transaction([
    prisma.inventoryPurchaseOrder.findMany({
      where, include: { supplier: true, lines: { include: { inventoryItem: true } }, receipts: true },
      orderBy: { createdAt: "desc" }, skip: (input.page - 1) * input.pageSize, take: input.pageSize,
    }),
    prisma.inventoryPurchaseOrder.count({ where }),
  ]);
  return { purchaseOrders, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
}

export async function receiveInventoryPurchaseOrder(scope: BranchScope, input: {
  purchaseOrderId: string; receiptNumber: string; receivedById: string; notes?: string;
  lines: Array<{ purchaseOrderLineId: string; quantity: number; unitCost?: number }>;
}) {
  return prisma.$transaction(async (tx) => {
    // Serialize receipts for the same purchase order. This prevents concurrent
    // deliveries on different lines from calculating a stale final order status.
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_purchase_orders" WHERE "id" = ${input.purchaseOrderId} AND "businessId" = ${scope.businessId} AND "branchId" = ${scope.branchId} FOR UPDATE`);
    const order = await tx.inventoryPurchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, businessId: scope.businessId, branchId: scope.branchId },
      include: { lines: true },
    });
    if (!order) throw new AppError("Purchase order not found for this branch", 404);
    if (order.status !== "ORDERED" && order.status !== "PARTIALLY_RECEIVED") {
      throw new AppError("Only ordered or partially received purchase orders can receive goods", 422);
    }
    if (input.lines.length === 0) throw new AppError("At least one receipt line is required", 422);
    const ids = [...new Set(input.lines.map((line) => line.purchaseOrderLineId))];
    if (ids.length !== input.lines.length) throw new AppError("A purchase order line may appear only once per receipt", 422);
    for (const lineInput of input.lines) {
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_purchase_order_lines" WHERE "id" = ${lineInput.purchaseOrderLineId} FOR UPDATE`);
      const orderLine = await tx.inventoryPurchaseOrderLine.findFirst({
        where: { id: lineInput.purchaseOrderLineId, purchaseOrderId: order.id },
        include: { inventoryItem: true },
      });
      if (!orderLine) throw new AppError("A receipt line does not belong to this purchase order", 422);
      if (!orderLine.inventoryItem.isActive) throw new AppError("Cannot receive an inactive inventory item", 422);
      if (lineInput.quantity > orderLine.quantityOrdered - orderLine.quantityReceived) {
        throw new AppError(`Received quantity exceeds the outstanding quantity for ${orderLine.inventoryItem.name}`, 422);
      }
    }
    const receipt = await tx.inventoryGoodsReceipt.create({ data: {
      businessId: scope.businessId, branchId: scope.branchId, purchaseOrderId: order.id,
      receiptNumber: input.receiptNumber.trim(), receivedById: input.receivedById,
      notes: input.notes?.trim() || null,
      lines: { create: input.lines.map((line) => {
        const orderLine = order.lines.find((candidate) => candidate.id === line.purchaseOrderLineId)!;
        return { purchaseOrderLineId: line.purchaseOrderLineId, inventoryItemId: orderLine.inventoryItemId,
          quantity: line.quantity, unitCost: line.unitCost ?? orderLine.unitCost };
      }) },
    }, include: { lines: true } });
    for (const lineInput of input.lines) {
      const orderLine = await tx.inventoryPurchaseOrderLine.findUniqueOrThrow({ where: { id: lineInput.purchaseOrderLineId } });
      await tx.inventoryPurchaseOrderLine.update({ where: { id: orderLine.id }, data: { quantityReceived: { increment: lineInput.quantity } } });
      const stock = await tx.inventoryStock.upsert({
        where: { inventoryItemId_branchId: { inventoryItemId: orderLine.inventoryItemId, branchId: scope.branchId } },
        create: { businessId: scope.businessId, branchId: scope.branchId, inventoryItemId: orderLine.inventoryItemId, quantity: 0 },
        update: {},
      });
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_stocks" WHERE "id" = ${stock.id} FOR UPDATE`);
      const lockedStock = await tx.inventoryStock.findUniqueOrThrow({ where: { id: stock.id } });
      const resultingQuantity = lockedStock.quantity + lineInput.quantity;
      await tx.inventoryStock.update({ where: { id: stock.id }, data: { quantity: resultingQuantity } });
      await tx.inventoryMovement.create({ data: {
        businessId: scope.businessId, branchId: scope.branchId, inventoryItemId: orderLine.inventoryItemId,
        quantity: lineInput.quantity, type: "RECEIPT", resultingQuantity,
        reason: "Goods received against purchase order", reference: receipt.receiptNumber, createdById: input.receivedById,
      } });
    }
    const updatedLines = await tx.inventoryPurchaseOrderLine.findMany({ where: { purchaseOrderId: order.id } });
    const complete = updatedLines.every((line) => line.quantityReceived >= line.quantityOrdered);
    return { receipt, status: complete ? "RECEIVED" as const : "PARTIALLY_RECEIVED" as const,
      purchaseOrder: await tx.inventoryPurchaseOrder.update({ where: { id: order.id }, data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED" } }) };
  });
}
