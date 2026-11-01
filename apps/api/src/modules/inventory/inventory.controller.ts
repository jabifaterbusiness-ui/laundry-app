import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  inventoryItemIdParamSchema,
  listInventoryItemsQuerySchema,
  listInventoryStockQuerySchema,
  createInventoryMovementSchema,
  adjustInventoryStockSchema,
  listInventoryMovementsQuerySchema,
  createInventorySupplierSchema,
  listInventorySuppliersQuerySchema,
  createInventoryPurchaseOrderSchema,
  listInventoryPurchaseOrdersQuerySchema,
  receiveInventoryPurchaseOrderSchema,
} from "./inventory.validation.js";
import {
  createInventoryItem,
  updateInventoryItem,
  listInventoryItems,
  listInventoryStock,
  createInventoryMovement,
  adjustInventoryStock,
  listInventoryMovements,
  createInventorySupplier,
  listInventorySuppliers,
  createInventoryPurchaseOrder,
  listInventoryPurchaseOrders,
  receiveInventoryPurchaseOrder,
} from "./inventory.service.js";

function requireBusinessId(req: Request): string {
  if (!req.user?.businessId) {
    throw new AppError(
      "This action requires an account scoped to a business",
      403,
    );
  }

  return req.user.businessId;
}

function requireBranchId(req: Request): string {
  if (!req.branchId) {
    throw new AppError(
      "A valid branch context is required",
      400,
    );
  }

  return req.branchId;
}

export async function createItem(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const input = createInventoryItemSchema.parse(req.body);

  const item = await createInventoryItem(
    { businessId },
    {
      name: input.name,
      ...(input.description !== undefined && {
        description: input.description,
      }),
      unit: input.unit,
      lowStockThreshold: input.lowStockThreshold,
    },
  );

  await recordAuditEvent({
    action: "inventory.item_created",
    entityType: "InventoryItem",
    entityId: item.id,
    businessId,
    branchId: req.branchId ?? null,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      name: item.name,
      unit: item.unit,
    },
  });

  res.status(201).json({
    data: item,
  });
}

export async function updateItem(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const { id } = inventoryItemIdParamSchema.parse(req.params);
  const input = updateInventoryItemSchema.parse(req.body);

  const item = await updateInventoryItem(
    { businessId },
    id,
    {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && {
        description: input.description,
      }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.lowStockThreshold !== undefined && {
        lowStockThreshold: input.lowStockThreshold,
      }),
      ...(input.isActive !== undefined && {
        isActive: input.isActive,
      }),
    },
  );

  await recordAuditEvent({
    action: "inventory.item_updated",
    entityType: "InventoryItem",
    entityId: item.id,
    businessId,
    branchId: req.branchId ?? null,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      name: item.name,
      unit: item.unit,
      isActive: item.isActive,
    },
  });

  res.status(200).json({
    data: item,
  });
}

export async function listItems(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const query = listInventoryItemsQuerySchema.parse(req.query);

  const result = await listInventoryItems(
    { businessId },
    {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.isActive !== undefined && {
        isActive: query.isActive,
      }),
      ...(query.search !== undefined && {
        search: query.search,
      }),
    },
  );

  res.status(200).json(result);
}

export async function listStock(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const query = listInventoryStockQuerySchema.parse(req.query);

  const result = await listInventoryStock(
    {
      businessId,
      branchId,
    },
    {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.inventoryItemId !== undefined && {
        inventoryItemId: query.inventoryItemId,
      }),
      ...(query.lowStockOnly !== undefined && {
        lowStockOnly: query.lowStockOnly,
      }),
    },
  );

  res.status(200).json(result);
}

export async function createMovement(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const input = createInventoryMovementSchema.parse(req.body);

  const result = await createInventoryMovement(
    {
      businessId,
      branchId,
    },
    {
      inventoryItemId: input.inventoryItemId,
      quantity: input.quantity,
      type: input.type,
      createdById: req.user!.id,
      ...(input.reason !== undefined && {
        reason: input.reason,
      }),
      ...(input.reference !== undefined && {
        reference: input.reference,
      }),
    },
  );

  await recordAuditEvent({
    action: "inventory.movement_created",
    entityType: "InventoryMovement",
    entityId: result.movement.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      inventoryItemId: result.inventoryItem.id,
      type: result.movement.type,
      quantity: result.movement.quantity,
      resultingQuantity: result.movement.resultingQuantity,
    },
  });

  res.status(201).json({
    data: result,
  });
}

export async function adjustStock(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const input = adjustInventoryStockSchema.parse(req.body);

  const result = await adjustInventoryStock(
    {
      businessId,
      branchId,
    },
    {
      inventoryItemId: input.inventoryItemId,
      quantity: input.quantity,
      reason: input.reason,
      createdById: req.user!.id,
      ...(input.reference !== undefined && {
        reference: input.reference,
      }),
    },
  );

  await recordAuditEvent({
    action: "inventory.stock_adjusted",
    entityType: "InventoryMovement",
    entityId: result.movement.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      inventoryItemId: result.inventoryItem.id,
      quantity: result.movement.quantity,
      resultingQuantity: result.movement.resultingQuantity,
      reason: result.movement.reason,
      reference: result.movement.reference,
    },
  });

  res.status(201).json({
    data: result,
  });
}


export async function listMovements(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const query = listInventoryMovementsQuerySchema.parse(req.query);
  const result = await listInventoryMovements(
    { businessId, branchId },
    {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.inventoryItemId ? { inventoryItemId: query.inventoryItemId } : {}),
      ...(query.type ? { type: query.type } : {}),
    },
  );
  res.status(200).json(result);
}


export async function createSupplier(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const input = createInventorySupplierSchema.parse(req.body);
  const supplier = await createInventorySupplier({ businessId }, input);
  await recordAuditEvent({ action: "inventory.supplier_created", entityType: "InventorySupplier", entityId: supplier.id,
    businessId, branchId: req.branchId ?? null, actorUserId: req.user!.id, correlationId: req.correlationId ?? null,
    metadata: { name: supplier.name } });
  res.status(201).json({ data: supplier });
}

export async function listSuppliers(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const query = listInventorySuppliersQuerySchema.parse(req.query);
  res.status(200).json(await listInventorySuppliers({ businessId }, query));
}

export async function createPurchaseOrder(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const input = createInventoryPurchaseOrderSchema.parse(req.body);
  const order = await createInventoryPurchaseOrder({ businessId, branchId }, {
    ...input, createdById: req.user!.id,
  });
  await recordAuditEvent({ action: "inventory.purchase_order_created", entityType: "InventoryPurchaseOrder", entityId: order.id,
    businessId, branchId, actorUserId: req.user!.id, correlationId: req.correlationId ?? null,
    metadata: { orderNumber: order.orderNumber, supplierId: order.supplierId, lineCount: order.lines.length } });
  res.status(201).json({ data: order });
}

export async function listPurchaseOrders(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const query = listInventoryPurchaseOrdersQuerySchema.parse(req.query);
  res.status(200).json(await listInventoryPurchaseOrders({ businessId, branchId }, query));
}

export async function receivePurchaseOrder(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = inventoryItemIdParamSchema.parse({ id: req.params.id });
  const input = receiveInventoryPurchaseOrderSchema.parse(req.body);
  const result = await receiveInventoryPurchaseOrder({ businessId, branchId }, {
    purchaseOrderId: id, ...input, receivedById: req.user!.id,
  });
  await recordAuditEvent({ action: "inventory.goods_received", entityType: "InventoryGoodsReceipt", entityId: result.receipt.id,
    businessId, branchId, actorUserId: req.user!.id, correlationId: req.correlationId ?? null,
    metadata: { receiptNumber: result.receipt.receiptNumber, purchaseOrderId: id, lineCount: result.receipt.lines.length, status: result.status } });
  res.status(201).json({ data: result });
}
