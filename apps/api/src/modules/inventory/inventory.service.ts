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
