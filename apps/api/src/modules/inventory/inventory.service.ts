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
  sku?: string;
  category?: string;
  storageLocation?: string;
  description?: string;
  unit: "PIECE" | "PACK" | "BOTTLE" | "LITRE" | "KILOGRAM" | "BOX" | "ROLL" | "OTHER";
  reorderQuantity?: number;
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
        sku: input.sku?.trim() || null,
        category: input.category?.trim() || null,
        storageLocation: input.storageLocation?.trim() || null,
        description: input.description?.trim() || null,
        unit: input.unit,
        reorderQuantity: input.reorderQuantity ?? 0,
        lowStockThreshold: input.lowStockThreshold ?? 0,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(",").toLowerCase()
        : String(error.meta?.target ?? "").toLowerCase();
      throw new AppError(
        target.includes("sku")
          ? "An inventory item with this SKU already exists"
          : "An inventory item with this name already exists",
        409,
      );
    }

    throw error;
  }
}

export type UpdateInventoryItemInput = {
  name?: string;
  sku?: string;
  category?: string;
  storageLocation?: string;
  description?: string;
  unit?: "PIECE" | "PACK" | "BOTTLE" | "LITRE" | "KILOGRAM" | "BOX" | "ROLL" | "OTHER";
  reorderQuantity?: number;
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

  if (input.sku !== undefined) data.sku = input.sku.trim() || null;
  if (input.category !== undefined) data.category = input.category.trim() || null;
  if (input.storageLocation !== undefined) data.storageLocation = input.storageLocation.trim() || null;
  if (input.description !== undefined) {
    data.description = input.description.trim() || null;
  }

  if (input.unit !== undefined) {
    data.unit = input.unit;
  }

  if (input.reorderQuantity !== undefined) data.reorderQuantity = input.reorderQuantity;
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
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(",").toLowerCase()
        : String(error.meta?.target ?? "").toLowerCase();
      throw new AppError(
        target.includes("sku")
          ? "An inventory item with this SKU already exists"
          : "An inventory item with this name already exists",
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

  const term = input.search?.trim();
  if (term) {
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { sku: { contains: term, mode: "insensitive" } },
      { category: { contains: term, mode: "insensitive" } },
    ];
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
      ? Prisma.sql`AND s."inventoryItemId" = ${input.inventoryItemId}`
      : Prisma.empty;

    const [stockRows, countRows] = await prisma.$transaction([
      prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT s.id
          FROM "inventory_stocks" AS s
          INNER JOIN "inventory_items" AS i
            ON i.id = s."inventoryItemId"
          WHERE s."businessId" = ${scope.businessId}
            AND s."branchId" = ${scope.branchId}
            ${itemFilter}
            AND (s.quantity - s."reservedQuantity") <= i."lowStockThreshold"
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
            ON i.id = s."inventoryItemId"
          WHERE s."businessId" = ${scope.businessId}
            AND s."branchId" = ${scope.branchId}
            ${itemFilter}
            AND (s.quantity - s."reservedQuantity") <= i."lowStockThreshold"
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
  type: "RECEIPT" | "ISSUE" | "RETURN" | "WASTE" | "EXPIRED";
  reason?: string;
  reference?: string;
  unitCost?: number;
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

    // Lock and re-read the balance inside this transaction. Without the
    // row lock, concurrent issues/receipts can both calculate from the same
    // stale quantity and overwrite one another.
    await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "inventory_stocks" WHERE "id" = ${stock.id} FOR UPDATE`,
    );
    const lockedStock = await tx.inventoryStock.findUniqueOrThrow({
      where: { id: stock.id },
    });

    const change = input.type === "RECEIPT" || input.type === "RETURN" ? input.quantity : -input.quantity;
    const resultingQuantity = lockedStock.quantity + change;

    if (resultingQuantity < 0) {
      throw new AppError("Insufficient inventory stock", 422);
    }
    if (["ISSUE", "WASTE", "EXPIRED"].includes(input.type) && lockedStock.quantity - (lockedStock.reservedQuantity ?? 0) < input.quantity) {
      throw new AppError("Insufficient available inventory stock", 422);
    }

    const updatedStock = await tx.inventoryStock.update({
      where: { id: stock.id },
      data: {
        quantity: resultingQuantity,
        ...(["RECEIPT", "RETURN"].includes(input.type) ? { averageUnitCost: Math.round(((lockedStock.quantity * (lockedStock.averageUnitCost ?? 0)) + (input.quantity * (input.unitCost ?? lockedStock.averageUnitCost ?? 0))) / Math.max(1, resultingQuantity)) } : {}),
      },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
        type: input.type,
        resultingQuantity,
        unitCost: input.unitCost ?? lockedStock.averageUnitCost ?? 0,
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

    // Serialize stock adjustments and calculate from the latest committed
    // balance rather than the value returned before a concurrent update.
    await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "inventory_stocks" WHERE "id" = ${stock.id} FOR UPDATE`,
    );
    const lockedStock = await tx.inventoryStock.findUniqueOrThrow({
      where: { id: stock.id },
    });
    const resultingQuantity = lockedStock.quantity + input.quantity;

    if (resultingQuantity < 0) {
      throw new AppError("Inventory adjustment cannot make stock negative", 422);
    }
    if (resultingQuantity < (lockedStock.reservedQuantity ?? 0)) {
      throw new AppError("Inventory adjustment cannot reduce stock below reserved quantities", 422);
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
    type?: "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "RETURN" | "WASTE" | "EXPIRED" | "TRANSFER_IN" | "TRANSFER_OUT" | "STOCKTAKE";
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
      const unitCost = lineInput.unitCost ?? orderLine.unitCost;
      const averageUnitCost = Math.round(((lockedStock.quantity * (lockedStock.averageUnitCost ?? 0)) + (lineInput.quantity * unitCost)) / Math.max(1, resultingQuantity));
      await tx.inventoryStock.update({ where: { id: stock.id }, data: { quantity: resultingQuantity, averageUnitCost } });
      await tx.inventoryMovement.create({ data: {
        businessId: scope.businessId, branchId: scope.branchId, inventoryItemId: orderLine.inventoryItemId,
        quantity: lineInput.quantity, type: "RECEIPT", unitCost, resultingQuantity,
        reason: "Goods received against purchase order", reference: receipt.receiptNumber, createdById: input.receivedById,
      } });
    }
    const updatedLines = await tx.inventoryPurchaseOrderLine.findMany({ where: { purchaseOrderId: order.id } });
    const complete = updatedLines.every((line) => line.quantityReceived >= line.quantityOrdered);
    return { receipt, status: complete ? "RECEIVED" as const : "PARTIALLY_RECEIVED" as const,
      purchaseOrder: await tx.inventoryPurchaseOrder.update({ where: { id: order.id }, data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED" } }) };
  });
}


export async function createInventoryTransfer(scope: BranchScope, input: {
  destinationBranchId: string; transferNumber: string; createdById: string; notes?: string;
  lines: Array<{ inventoryItemId: string; quantity: number }>;
}) {
  return prisma.$transaction(async (tx) => {
    if (input.destinationBranchId === scope.branchId) throw new AppError("Source and destination branches must be different", 422);
    const [source, destination] = await Promise.all([
      tx.branch.findFirst({ where: { id: scope.branchId, businessId: scope.businessId, isActive: true } }),
      tx.branch.findFirst({ where: { id: input.destinationBranchId, businessId: scope.businessId, isActive: true } }),
    ]);
    if (!source || !destination) throw new AppError("Both transfer branches must be active branches in this business", 404);
    if (!input.lines.length || new Set(input.lines.map((line) => line.inventoryItemId)).size !== input.lines.length) {
      throw new AppError("Transfer must contain unique inventory items", 422);
    }
    const ids = input.lines.map((line) => line.inventoryItemId);
    const items = await tx.inventoryItem.findMany({ where: { id: { in: ids }, businessId: scope.businessId, isActive: true } });
    if (items.length !== ids.length) throw new AppError("One or more inventory items are unavailable", 422);
    const transferLines: Array<{ inventoryItemId: string; quantity: number; unitCost: number; resultingQuantity: number }> = [];
    for (const line of input.lines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new AppError("Transfer quantities must be positive whole numbers", 422);
      const stock = await tx.inventoryStock.upsert({
        where: { inventoryItemId_branchId: { inventoryItemId: line.inventoryItemId, branchId: scope.branchId } },
        create: { businessId: scope.businessId, branchId: scope.branchId, inventoryItemId: line.inventoryItemId, quantity: 0 },
        update: {},
      });
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_stocks" WHERE "id" = ${stock.id} FOR UPDATE`);
      const locked = await tx.inventoryStock.findUniqueOrThrow({ where: { id: stock.id } });
      const available = locked.quantity - locked.reservedQuantity;
      if (available < line.quantity) throw new AppError("Insufficient available stock for transfer", 422);
      const remaining = locked.quantity - line.quantity;
      await tx.inventoryStock.update({ where: { id: stock.id }, data: { quantity: remaining } });
      transferLines.push({ inventoryItemId: line.inventoryItemId, quantity: line.quantity, unitCost: locked.averageUnitCost, resultingQuantity: remaining });
    }
    const transfer = await tx.inventoryTransfer.create({ data: {
      businessId: scope.businessId, sourceBranchId: scope.branchId, destinationBranchId: destination.id,
      transferNumber: input.transferNumber.trim(), status: "DISPATCHED", notes: input.notes?.trim() || null,
      createdById: input.createdById, dispatchedById: input.createdById,
      lines: { create: transferLines.map((line) => ({ inventoryItemId: line.inventoryItemId, quantityDispatched: line.quantity, unitCost: line.unitCost })) },
    }, include: { lines: { include: { inventoryItem: true } }, sourceBranch: true, destinationBranch: true } });
    for (const line of transferLines) {
      await tx.inventoryMovement.create({ data: {
        businessId: scope.businessId, branchId: scope.branchId, inventoryItemId: line.inventoryItemId,
        quantity: line.quantity, type: "TRANSFER_OUT", unitCost: line.unitCost,
        resultingQuantity: line.resultingQuantity, reason: "Inter-branch transfer dispatched",
        reference: transfer.transferNumber, createdById: input.createdById,
      } });
    }
    return transfer;
  });
}

export async function receiveInventoryTransfer(scope: BranchScope, input: {
  transferId: string; receivedById: string; lines: Array<{ transferLineId: string; quantity: number }>;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_transfers" WHERE "id" = ${input.transferId} AND "businessId" = ${scope.businessId} AND "destinationBranchId" = ${scope.branchId} FOR UPDATE`);
    const transfer = await tx.inventoryTransfer.findFirst({
      where: { id: input.transferId, businessId: scope.businessId, destinationBranchId: scope.branchId },
      include: { lines: true },
    });
    if (!transfer) throw new AppError("Transfer not found for this receiving branch", 404);
    if (transfer.status !== "DISPATCHED" && transfer.status !== "PARTIALLY_RECEIVED") throw new AppError("This transfer cannot receive more stock", 422);
    if (!input.lines.length || new Set(input.lines.map((line) => line.transferLineId)).size !== input.lines.length) throw new AppError("Receipt must contain unique transfer lines", 422);
    for (const received of input.lines) {
      const line = transfer.lines.find((candidate) => candidate.id === received.transferLineId);
      if (!line) throw new AppError("A transfer line does not belong to this transfer", 422);
      if (!Number.isSafeInteger(received.quantity) || received.quantity <= 0 || received.quantity > line.quantityDispatched - line.quantityReceived) {
        throw new AppError("Received quantity exceeds the outstanding transfer quantity", 422);
      }
      const stock = await tx.inventoryStock.upsert({
        where: { inventoryItemId_branchId: { inventoryItemId: line.inventoryItemId, branchId: scope.branchId } },
        create: { businessId: scope.businessId, branchId: scope.branchId, inventoryItemId: line.inventoryItemId, quantity: 0 },
        update: {},
      });
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_stocks" WHERE "id" = ${stock.id} FOR UPDATE`);
      const locked = await tx.inventoryStock.findUniqueOrThrow({ where: { id: stock.id } });
      const nextQuantity = locked.quantity + received.quantity;
      const nextAverage = nextQuantity === 0 ? 0 : Math.round(((locked.quantity * locked.averageUnitCost) + (received.quantity * line.unitCost)) / nextQuantity);
      await tx.inventoryStock.update({ where: { id: stock.id }, data: { quantity: nextQuantity, averageUnitCost: nextAverage } });
      await tx.inventoryTransferLine.update({ where: { id: line.id }, data: { quantityReceived: { increment: received.quantity } } });
      await tx.inventoryMovement.create({ data: {
        businessId: scope.businessId, branchId: scope.branchId, inventoryItemId: line.inventoryItemId,
        quantity: received.quantity, type: "TRANSFER_IN", unitCost: line.unitCost,
        resultingQuantity: nextQuantity, reason: "Inter-branch transfer received",
        reference: transfer.transferNumber, createdById: input.receivedById,
      } });
    }
    const updatedLines = await tx.inventoryTransferLine.findMany({ where: { transferId: transfer.id } });
    const complete = updatedLines.every((line) => line.quantityReceived === line.quantityDispatched);
    return tx.inventoryTransfer.update({
      where: { id: transfer.id },
      data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED", ...(complete ? { receivedById: input.receivedById, receivedAt: new Date() } : {}) },
      include: { lines: { include: { inventoryItem: true } }, sourceBranch: true, destinationBranch: true },
    });
  });
}

export async function listInventoryTransfers(scope: BranchScope, input: { page: number; pageSize: number }) {
  const where: Prisma.InventoryTransferWhereInput = {
    businessId: scope.businessId,
    OR: [{ sourceBranchId: scope.branchId }, { destinationBranchId: scope.branchId }],
  };
  const [transfers, total] = await prisma.$transaction([
    prisma.inventoryTransfer.findMany({ where, include: { sourceBranch: true, destinationBranch: true, lines: { include: { inventoryItem: true } } }, orderBy: { createdAt: "desc" }, skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.inventoryTransfer.count({ where }),
  ]);
  return { transfers, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
}

export async function createInventoryStocktake(scope: BranchScope, input: {
  reference: string; createdById: string; notes?: string;
  lines: Array<{ inventoryItemId: string; countedQuantity: number }>;
}) {
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({ where: { id: scope.branchId, businessId: scope.businessId, isActive: true } });
    if (!branch) throw new AppError("Branch not found or inactive", 404);
    if (!input.lines.length || new Set(input.lines.map((line) => line.inventoryItemId)).size !== input.lines.length) throw new AppError("Stocktake requires unique inventory items", 422);
    const ids = input.lines.map((line) => line.inventoryItemId);
    const items = await tx.inventoryItem.findMany({ where: { id: { in: ids }, businessId: scope.businessId, isActive: true } });
    if (items.length !== ids.length) throw new AppError("One or more inventory items are unavailable", 422);
    const lines = [];
    for (const line of input.lines) {
      if (!Number.isSafeInteger(line.countedQuantity) || line.countedQuantity < 0) throw new AppError("Counted quantities cannot be negative", 422);
      const stock = await tx.inventoryStock.upsert({
        where: { inventoryItemId_branchId: { inventoryItemId: line.inventoryItemId, branchId: scope.branchId } },
        create: { businessId: scope.businessId, branchId: scope.branchId, inventoryItemId: line.inventoryItemId, quantity: 0 },
        update: {},
      });
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_stocks" WHERE "id" = ${stock.id} FOR UPDATE`);
      const locked = await tx.inventoryStock.findUniqueOrThrow({ where: { id: stock.id } });
      lines.push({ inventoryItemId: line.inventoryItemId, expectedQuantity: locked.quantity, countedQuantity: line.countedQuantity, variance: line.countedQuantity - locked.quantity });
    }
    return tx.inventoryStocktake.create({ data: {
      businessId: scope.businessId, branchId: scope.branchId, reference: input.reference.trim(),
      notes: input.notes?.trim() || null, createdById: input.createdById,
      lines: { create: lines },
    }, include: { lines: { include: { inventoryItem: true } } } });
  });
}

export async function listInventoryStocktakes(scope: BranchScope) {
  const stocktakes = await prisma.inventoryStocktake.findMany({
    where: { businessId: scope.businessId, branchId: scope.branchId },
    include: { lines: { include: { inventoryItem: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return { stocktakes };
}

export async function submitInventoryStocktake(scope: BranchScope, input: { stocktakeId: string; submittedById: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_stocktakes" WHERE "id" = ${input.stocktakeId} AND "businessId" = ${scope.businessId} AND "branchId" = ${scope.branchId} FOR UPDATE`);
    const stocktake = await tx.inventoryStocktake.findFirst({ where: { id: input.stocktakeId, businessId: scope.businessId, branchId: scope.branchId } });
    if (!stocktake) throw new AppError("Stocktake not found for this branch", 404);
    if (stocktake.status !== "DRAFT") throw new AppError("Only draft stocktakes can be submitted", 422);
    return tx.inventoryStocktake.update({ where: { id: stocktake.id }, data: { status: "SUBMITTED", submittedById: input.submittedById, submittedAt: new Date() }, include: { lines: { include: { inventoryItem: true } } } });
  });
}

export async function approveInventoryStocktake(scope: BranchScope, input: { stocktakeId: string; approvedById: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_stocktakes" WHERE "id" = ${input.stocktakeId} AND "businessId" = ${scope.businessId} AND "branchId" = ${scope.branchId} FOR UPDATE`);
    const stocktake = await tx.inventoryStocktake.findFirst({ where: { id: input.stocktakeId, businessId: scope.businessId, branchId: scope.branchId } });
    if (!stocktake) throw new AppError("Stocktake not found for this branch", 404);
    if (stocktake.status !== "SUBMITTED") throw new AppError("Only submitted stocktakes can be approved", 422);
    if (stocktake.createdById === input.approvedById) throw new AppError("Stocktake creator cannot approve their own stocktake", 403);
    return tx.inventoryStocktake.update({ where: { id: stocktake.id }, data: { status: "APPROVED", approvedById: input.approvedById, approvedAt: new Date() }, include: { lines: { include: { inventoryItem: true } } } });
  });
}

export async function applyInventoryStocktake(scope: BranchScope, input: { stocktakeId: string; appliedById: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_stocktakes" WHERE "id" = ${input.stocktakeId} AND "businessId" = ${scope.businessId} AND "branchId" = ${scope.branchId} FOR UPDATE`);
    const stocktake = await tx.inventoryStocktake.findFirst({ where: { id: input.stocktakeId, businessId: scope.businessId, branchId: scope.branchId }, include: { lines: true } });
    if (!stocktake) throw new AppError("Stocktake not found for this branch", 404);
    if (stocktake.status !== "APPROVED") throw new AppError("Only approved stocktakes can be applied", 422);
    for (const line of stocktake.lines) {
      const stock = await tx.inventoryStock.upsert({
        where: { inventoryItemId_branchId: { inventoryItemId: line.inventoryItemId, branchId: scope.branchId } },
        create: { businessId: scope.businessId, branchId: scope.branchId, inventoryItemId: line.inventoryItemId, quantity: 0 },
        update: {},
      });
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_stocks" WHERE "id" = ${stock.id} FOR UPDATE`);
      const locked = await tx.inventoryStock.findUniqueOrThrow({ where: { id: stock.id } });
      const variance = line.countedQuantity - locked.quantity;
      if ((locked.reservedQuantity ?? 0) > line.countedQuantity) throw new AppError("Stocktake count is below the quantity already reserved", 422);
      await tx.inventoryStock.update({ where: { id: stock.id }, data: { quantity: line.countedQuantity } });
      await tx.inventoryStocktakeLine.update({ where: { id: line.id }, data: { expectedQuantity: locked.quantity, variance } });
      if (variance !== 0) await tx.inventoryMovement.create({ data: {
        businessId: scope.businessId, branchId: scope.branchId, inventoryItemId: line.inventoryItemId,
        quantity: Math.abs(variance), type: "STOCKTAKE", resultingQuantity: line.countedQuantity,
        reason: variance > 0 ? "Stocktake surplus" : "Stocktake shortage",
        reference: stocktake.reference, createdById: input.appliedById,
      } });
    }
    return tx.inventoryStocktake.update({ where: { id: stocktake.id }, data: { status: "APPLIED", appliedById: input.appliedById, appliedAt: new Date() }, include: { lines: { include: { inventoryItem: true } } } });
  });
}

export async function createInventoryReservation(scope: BranchScope, input: {
  inventoryItemId: string; quantity: number; createdById: string; reference?: string; expiresAt?: Date;
}) {
  return prisma.$transaction(async (tx) => {
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new AppError("Reservation quantity must be a positive whole number", 422);
    const item = await tx.inventoryItem.findFirst({ where: { id: input.inventoryItemId, businessId: scope.businessId, isActive: true } });
    if (!item) throw new AppError("Inventory item not found or inactive", 404);
    const stock = await tx.inventoryStock.upsert({
      where: { inventoryItemId_branchId: { inventoryItemId: input.inventoryItemId, branchId: scope.branchId } },
      create: { businessId: scope.businessId, branchId: scope.branchId, inventoryItemId: input.inventoryItemId, quantity: 0 },
      update: {},
    });
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_stocks" WHERE "id" = ${stock.id} FOR UPDATE`);
    const locked = await tx.inventoryStock.findUniqueOrThrow({ where: { id: stock.id } });
    if (locked.quantity - locked.reservedQuantity < input.quantity) throw new AppError("Insufficient available stock to reserve", 422);
    const reservation = await tx.inventoryReservation.create({ data: {
      businessId: scope.businessId, branchId: scope.branchId, inventoryItemId: input.inventoryItemId,
      quantity: input.quantity, reference: input.reference?.trim() || null, createdById: input.createdById,
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    } });
    await tx.inventoryStock.update({ where: { id: stock.id }, data: { reservedQuantity: { increment: input.quantity } } });
    return reservation;
  });
}

export async function releaseInventoryReservation(scope: BranchScope, input: { reservationId: string; consumed?: boolean }) {
  return prisma.$transaction(async (tx) => {
    // Serialize release/consume requests on the reservation itself. Locking
    // only the stock row allows two requests to read ACTIVE before either
    // updates the reservation and both to decrement the same reserved units.
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "inventory_reservations"
      WHERE "id" = ${input.reservationId}
        AND "businessId" = ${scope.businessId}
        AND "branchId" = ${scope.branchId}
      FOR UPDATE
    `);
    const reservation = await tx.inventoryReservation.findFirst({
      where: { id: input.reservationId, businessId: scope.businessId, branchId: scope.branchId, status: "ACTIVE" },
    });
    if (!reservation) throw new AppError("Active reservation not found for this branch", 404);
    const stock = await tx.inventoryStock.findUnique({ where: { inventoryItemId_branchId: { inventoryItemId: reservation.inventoryItemId, branchId: scope.branchId } } });
    if (!stock) throw new AppError("Reserved stock balance not found", 409);
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_stocks" WHERE "id" = ${stock.id} FOR UPDATE`);
    const locked = await tx.inventoryStock.findUniqueOrThrow({ where: { id: stock.id } });
    if (locked.reservedQuantity < reservation.quantity || (input.consumed && locked.quantity < reservation.quantity)) {
      throw new AppError("Reserved stock balance is inconsistent; reservation was not changed", 409);
    }
    const nextStatus = input.consumed ? "CONSUMED" : "RELEASED";
    await tx.inventoryStock.update({ where: { id: stock.id }, data: {
      reservedQuantity: { decrement: reservation.quantity },
      ...(input.consumed ? { quantity: { decrement: reservation.quantity } } : {}),
    } });
    if (input.consumed) {
      const resultingQuantity = locked.quantity - reservation.quantity;
      await tx.inventoryMovement.create({ data: {
        businessId: scope.businessId, branchId: scope.branchId, inventoryItemId: reservation.inventoryItemId,
        quantity: reservation.quantity, type: "ISSUE", resultingQuantity,
        reason: "Reserved inventory consumed", reference: reservation.reference, createdById: reservation.createdById,
      } });
    }
    return tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: nextStatus, releasedAt: new Date() } });
  });
}

export async function getInventoryReorderRecommendations(scope: BranchScope) {
  const items = await prisma.inventoryItem.findMany({
    where: { businessId: scope.businessId, isActive: true },
    include: { stocks: { where: { businessId: scope.businessId, branchId: scope.branchId } } },
    orderBy: { name: "asc" },
  });
  return items.map((item) => {
    const stock = item.stocks[0];
    const quantity = stock?.quantity ?? 0;
    const reservedQuantity = stock?.reservedQuantity ?? 0;
    const averageUnitCost = stock?.averageUnitCost ?? 0;
    return {
      inventoryItem: item, quantity, reservedQuantity,
      availableQuantity: quantity - reservedQuantity,
      suggestedOrderQuantity: Math.max(0, Math.max(item.reorderQuantity, item.lowStockThreshold + item.reorderQuantity - (quantity - reservedQuantity))),
      averageUnitCost, stockValue: quantity * averageUnitCost,
    };
  }).filter((row) => row.availableQuantity <= row.inventoryItem.lowStockThreshold);
}

export async function getInventoryBranchComparison(scope: BusinessScope) {
  const branches = await prisma.branch.findMany({
    where: { businessId: scope.businessId, isActive: true },
    select: {
      id: true,
      name: true,
      inventoryStocks: {
        where: { businessId: scope.businessId },
        include: { inventoryItem: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return branches.map((branch) => {
    const stocks = branch.inventoryStocks;
    // Quantities from different inventory units (kg, bottles, pieces, etc.)
    // must not be added together; valuation and item counts are comparable.
    const totalValuation = stocks.reduce((sum, stock) => sum + stock.quantity * stock.averageUnitCost, 0);
    const lowStockItems = stocks.filter((stock) =>
      stock.quantity - stock.reservedQuantity <= stock.inventoryItem.lowStockThreshold
    ).length;
    return {
      branchId: branch.id,
      branchName: branch.name,
      itemCount: stocks.length,
      totalValuation,
      lowStockItems,
    };
  });
}

export async function getInventoryReports(scope: BranchScope) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const [stocks, movements, purchaseOrders] = await prisma.$transaction([
    prisma.inventoryStock.findMany({
      where: { businessId: scope.businessId, branchId: scope.branchId },
      include: { inventoryItem: true },
      orderBy: { inventoryItem: { name: "asc" } },
    }),
    prisma.inventoryMovement.findMany({
      where: { businessId: scope.businessId, branchId: scope.branchId, createdAt: { gte: since } },
      include: { inventoryItem: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    prisma.inventoryPurchaseOrder.findMany({
      where: { businessId: scope.businessId, branchId: scope.branchId, createdAt: { gte: since } },
      include: { supplier: true, lines: true, receipts: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);
  const valuation = stocks.map((stock) => ({
    inventoryItem: stock.inventoryItem, quantity: stock.quantity,
    reservedQuantity: stock.reservedQuantity, availableQuantity: stock.quantity - stock.reservedQuantity,
    averageUnitCost: stock.averageUnitCost, totalValue: stock.quantity * stock.averageUnitCost,
  }));
  const totalValuation = valuation.reduce((sum, row) => sum + row.totalValue, 0);
  const movementTotals = movements.reduce<Record<string, number>>((totals, movement) => {
    totals[movement.type] = (totals[movement.type] ?? 0) + movement.quantity;
    return totals;
  }, {});
  const supplierPerformance = new Map<string, { supplierId: string; supplierName: string; orderCount: number; orderedValue: number; receivedOrderCount: number }>();
  for (const order of purchaseOrders) {
    const row = supplierPerformance.get(order.supplierId) ?? {
      supplierId: order.supplierId, supplierName: order.supplier.name, orderCount: 0, orderedValue: 0, receivedOrderCount: 0,
    };
    row.orderCount += 1;
    row.orderedValue += order.lines.reduce((sum, line) => sum + line.quantityOrdered * line.unitCost, 0);
    if (order.status === "RECEIVED") row.receivedOrderCount += 1;
    supplierPerformance.set(order.supplierId, row);
  }
  return {
    periodDays: 30, totalValuation, valuation,
    movementTotals, movementCount: movements.length,
    consumptionQuantity: (movementTotals.ISSUE ?? 0) + (movementTotals.WASTE ?? 0) + (movementTotals.EXPIRED ?? 0),
    adjustmentQuantity: movementTotals.ADJUSTMENT ?? 0,
    supplierPerformance: [...supplierPerformance.values()].sort((a, b) => b.orderedValue - a.orderedValue),
  };
}
