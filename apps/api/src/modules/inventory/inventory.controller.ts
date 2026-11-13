import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { sendHtmlEmail } from "../invoices/providers/resend.provider.js";
import { sendWhatsAppText } from "../invoices/providers/whatsapp.provider.js";
import { assertWhatsAppMessagingEnabled } from "../platform/platform-controls.middleware.js";
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
  createInventoryTransferSchema,
  receiveInventoryTransferSchema,
  createInventoryStocktakeSchema,
  createInventoryReservationSchema,
  inventoryOperationIdParamSchema,
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
  createInventoryTransfer,
  receiveInventoryTransfer,
  listInventoryTransfers,
  createInventoryStocktake,
  applyInventoryStocktake,
  submitInventoryStocktake,
  listInventoryStocktakes,
  approveInventoryStocktake,
  createInventoryReservation,
  listInventoryReservations,
  releaseInventoryReservation,
  getInventoryReorderRecommendations,
  getInventoryReports,
  getInventoryBranchComparison,
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
  const branchId = requireBranchId(req);
  const input = createInventoryItemSchema.parse(req.body);

  const item = await createInventoryItem(
    { businessId, branchId, userId: req.user!.id },
    {
      name: input.name,
      ...(input.sku !== undefined && { sku: input.sku }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.storageLocation !== undefined && { storageLocation: input.storageLocation }),
      ...(input.description !== undefined && { description: input.description }),
      unit: input.unit,
      reorderQuantity: input.reorderQuantity,
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
      sku: item.sku,
      category: item.category,
      storageLocation: item.storageLocation,
      unit: item.unit,
      reorderQuantity: item.reorderQuantity,
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
  const branchId = requireBranchId(req);
  const { id } = inventoryItemIdParamSchema.parse(req.params);
  const input = updateInventoryItemSchema.parse(req.body);

  const item = await updateInventoryItem(
    { businessId, branchId, userId: req.user!.id },
    id,
    {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.sku !== undefined && { sku: input.sku }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.storageLocation !== undefined && { storageLocation: input.storageLocation }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.reorderQuantity !== undefined && { reorderQuantity: input.reorderQuantity }),
      ...(input.lowStockThreshold !== undefined && { lowStockThreshold: input.lowStockThreshold }),
      ...(input.isActive !== undefined && {
        isActive: input.isActive,
      }),
    },
  );

  if (!item) throw new AppError("Inventory item not found", 404);

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
      sku: item.sku,
      category: item.category,
      storageLocation: item.storageLocation,
      unit: item.unit,
      reorderQuantity: item.reorderQuantity,
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
  const branchId = requireBranchId(req);
  const query = listInventoryItemsQuerySchema.parse(req.query);

  const result = await listInventoryItems(
    { businessId, branchId, userId: req.user!.id },
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
      userId: req.user!.id,
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
      userId: req.user!.id,
    },
    {
      inventoryItemId: input.inventoryItemId,
      quantity: input.quantity,
      type: input.type,
      ...(input.unitCost !== undefined && { unitCost: input.unitCost }),
      ...(input.batchNumber !== undefined && { batchNumber: input.batchNumber }),
      ...(input.expiryDate !== undefined && { expiryDate: input.expiryDate }),
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
      batchNumber: result.movement.batchNumber,
      expiryDate: result.movement.expiryDate,
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
      userId: req.user!.id,
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
    { businessId, branchId, userId: req.user!.id },
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
  const supplier = await createInventorySupplier({ businessId }, {
    name: input.name,
    ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
    ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  });
  await recordAuditEvent({ action: "inventory.supplier_created", entityType: "InventorySupplier", entityId: supplier.id,
    businessId, branchId: req.branchId ?? null, actorUserId: req.user!.id, correlationId: req.correlationId ?? null,
    metadata: { name: supplier.name } });
  res.status(201).json({ data: supplier });
}

export async function listSuppliers(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const query = listInventorySuppliersQuerySchema.parse(req.query);
  res.status(200).json(await listInventorySuppliers({ businessId }, {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.search !== undefined ? { search: query.search } : {}),
  }));
}

export async function createPurchaseOrder(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const input = createInventoryPurchaseOrderSchema.parse(req.body);
  const order = await createInventoryPurchaseOrder({ businessId, branchId, userId: req.user!.id }, {
    supplierId: input.supplierId,
    orderNumber: input.orderNumber,
    notificationChannel: input.notificationChannel,
    createdById: req.user!.id,
    lines: input.lines,
    ...(input.expectedAt !== undefined ? { expectedAt: input.expectedAt } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  });
  await recordAuditEvent({ action: "inventory.purchase_order_created", entityType: "InventoryPurchaseOrder", entityId: order.id,
    businessId, branchId, actorUserId: req.user!.id, correlationId: req.correlationId ?? null,
    metadata: { orderNumber: order.orderNumber, supplierId: order.supplierId, lineCount: order.lines.length } });
  const notificationChannel = input.notificationChannel;
  const destination = notificationChannel === "EMAIL" ? order.supplier.email : order.supplier.phone;
  let notification: { channel: "EMAIL" | "WHATSAPP"; status: "SENT" | "FAILED"; destination: string | null; providerMessageId?: string; error?: string } = {
    channel: notificationChannel,
    status: "FAILED",
    destination,
  };
  try {
    if (!destination) throw new Error(notificationChannel === "EMAIL" ? "Supplier email address is missing" : "Supplier WhatsApp phone number is missing");
    const lines = order.lines.map((line) => `${line.inventoryItem.name}: ${line.quantityOrdered} × ₦${line.unitCost.toLocaleString("en-NG")}`);
    const total = order.lines.reduce((sum, line) => sum + line.quantityOrdered * line.unitCost, 0);
    if (notificationChannel === "EMAIL") {
      const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
      const html = `<div style="font-family:Arial,sans-serif;color:#172033"><h2>Purchase Order ${escapeHtml(order.orderNumber)}</h2><p>Hello ${escapeHtml(order.supplier.contactName || order.supplier.name)},</p><p>Please find our purchase order details below.</p><table style="border-collapse:collapse;width:100%"><thead><tr><th align="left">Item</th><th align="right">Quantity</th><th align="right">Unit cost</th><th align="right">Line total</th></tr></thead><tbody>${order.lines.map((line) => `<tr><td>${escapeHtml(line.inventoryItem.name)}</td><td align="right">${line.quantityOrdered}</td><td align="right">₦${line.unitCost.toLocaleString("en-NG")}</td><td align="right">₦${(line.quantityOrdered * line.unitCost).toLocaleString("en-NG")}</td></tr>`).join("")}</tbody></table><p><strong>Estimated total: ₦${total.toLocaleString("en-NG")}</strong></p>${order.expectedAt ? `<p>Expected delivery: ${new Date(order.expectedAt).toLocaleDateString("en-NG")}</p>` : ""}${order.notes ? `<p>Notes: ${escapeHtml(order.notes)}</p>` : ""}<p>Please confirm receipt of this purchase order.</p></div>`;
      const sent = await sendHtmlEmail({ to: destination, subject: `Purchase Order ${order.orderNumber}`, html });
      notification = { channel: notificationChannel, status: "SENT", destination, providerMessageId: sent.id };
    } else {
      await assertWhatsAppMessagingEnabled();
      const body = [
        `PURCHASE ORDER ${order.orderNumber}`,
        ...lines,
        `Estimated total: ₦${total.toLocaleString("en-NG")}`,
        ...(order.expectedAt ? [`Expected delivery: ${new Date(order.expectedAt).toLocaleDateString("en-NG")}`] : []),
        ...(order.notes ? [`Notes: ${order.notes}`] : []),
        "Please confirm receipt of this purchase order.",
      ].join("\\n");
      const sent = await sendWhatsAppText({ businessId, to: destination, body });
      notification = { channel: notificationChannel, status: "SENT", destination, providerMessageId: sent.id };
    }
  } catch (error) {
    notification = {
      channel: notificationChannel,
      status: "FAILED",
      destination,
      error: error instanceof Error ? error.message : "Supplier notification delivery failed",
    };
  }
  res.status(201).json({ data: order, notification });
}

export async function listPurchaseOrders(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const query = listInventoryPurchaseOrdersQuerySchema.parse(req.query);
  res.status(200).json(await listInventoryPurchaseOrders({ businessId, branchId, userId: req.user!.id }, {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.status !== undefined ? { status: query.status } : {}),
  }));
}

export async function receivePurchaseOrder(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = inventoryItemIdParamSchema.parse({ id: req.params.id });
  const input = receiveInventoryPurchaseOrderSchema.parse(req.body);
  const result = await receiveInventoryPurchaseOrder({ businessId, branchId, userId: req.user!.id }, {
    purchaseOrderId: id,
    receiptNumber: input.receiptNumber,
    receivedById: req.user!.id,
    lines: input.lines.map((line) => ({
      purchaseOrderLineId: line.purchaseOrderLineId,
      quantity: line.quantity,
      ...(line.unitCost !== undefined ? { unitCost: line.unitCost } : {}),
      ...(line.batchNumber !== undefined ? { batchNumber: line.batchNumber } : {}),
      ...(line.expiryDate !== undefined ? { expiryDate: line.expiryDate } : {}),
    })),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  });
  await recordAuditEvent({ action: "inventory.goods_received", entityType: "InventoryGoodsReceipt", entityId: result.receipt.id,
    businessId, branchId, actorUserId: req.user!.id, correlationId: req.correlationId ?? null,
    metadata: { receiptNumber: result.receipt.receiptNumber, purchaseOrderId: id, lineCount: result.receipt.lines.length, status: result.status } });
  res.status(201).json({ data: result });
}


export async function createTransfer(req: Request, res: Response) {
  const businessId = requireBusinessId(req), branchId = requireBranchId(req);
  const input = createInventoryTransferSchema.parse(req.body);
  const transfer = await createInventoryTransfer({ businessId, branchId, userId: req.user!.id }, { destinationBranchId: input.destinationBranchId, transferNumber: input.transferNumber, ...(input.notes !== undefined ? { notes: input.notes } : {}), lines: input.lines, createdById: req.user!.id });
  await recordAuditEvent({ action: "inventory.transfer_dispatched", entityType: "InventoryTransfer", entityId: transfer.id, businessId, branchId, actorUserId: req.user!.id, correlationId: req.correlationId ?? null, metadata: { transferNumber: transfer.transferNumber, destinationBranchId: transfer.destinationBranchId, lineCount: transfer.lines.length } });
  res.status(201).json({ data: transfer });
}

export async function receiveTransfer(req: Request, res: Response) {
  const businessId = requireBusinessId(req), branchId = requireBranchId(req);
  const { id } = inventoryOperationIdParamSchema.parse(req.params);
  const input = receiveInventoryTransferSchema.parse(req.body);
  const transfer = await receiveInventoryTransfer({ businessId, branchId, userId: req.user!.id }, { transferId: id, receivedById: req.user!.id, lines: input.lines });
  await recordAuditEvent({ action: "inventory.transfer_received", entityType: "InventoryTransfer", entityId: transfer.id, businessId, branchId, actorUserId: req.user!.id, correlationId: req.correlationId ?? null, metadata: { transferNumber: transfer.transferNumber, status: transfer.status } });
  res.status(200).json({ data: transfer });
}

export async function listTransfers(req: Request, res: Response) {
  const businessId = requireBusinessId(req), branchId = requireBranchId(req);
  const result = await listInventoryTransfers({ businessId, branchId, userId: req.user!.id }, { page: 1, pageSize: 100 });
  res.status(200).json(result);
}

export async function createStocktake(req: Request, res: Response) {
  const businessId = requireBusinessId(req), branchId = requireBranchId(req);
  const input = createInventoryStocktakeSchema.parse(req.body);
  const stocktake = await createInventoryStocktake({ businessId, branchId, userId: req.user!.id }, { reference: input.reference, ...(input.notes !== undefined ? { notes: input.notes } : {}), lines: input.lines, createdById: req.user!.id });
  await recordAuditEvent({ action: "inventory.stocktake_created", entityType: "InventoryStocktake", entityId: stocktake.id, businessId, branchId, actorUserId: req.user!.id, correlationId: req.correlationId ?? null, metadata: { reference: stocktake.reference, lineCount: stocktake.lines.length } });
  res.status(201).json({ data: stocktake });
}

export async function listStocktakes(req: Request, res: Response) {
  const businessId = requireBusinessId(req), branchId = requireBranchId(req);
  res.status(200).json(await listInventoryStocktakes({ businessId, branchId, userId: req.user!.id }));
}

export async function submitStocktake(req: Request, res: Response) {
  const businessId = requireBusinessId(req), branchId = requireBranchId(req);
  const { id } = inventoryOperationIdParamSchema.parse(req.params);
  const stocktake = await submitInventoryStocktake({ businessId, branchId, userId: req.user!.id }, { stocktakeId: id, submittedById: req.user!.id });
  await recordAuditEvent({ action: "inventory.stocktake_submitted", entityType: "InventoryStocktake", entityId: stocktake.id, businessId, branchId, actorUserId: req.user!.id, correlationId: req.correlationId ?? null, metadata: { reference: stocktake.reference } });
  res.status(200).json({ data: stocktake });
}

export async function approveStocktake(req: Request, res: Response) {
  const businessId = requireBusinessId(req), branchId = requireBranchId(req);
  const { id } = inventoryOperationIdParamSchema.parse(req.params);
  const stocktake = await approveInventoryStocktake({ businessId, branchId, userId: req.user!.id }, { stocktakeId: id, approvedById: req.user!.id });
  await recordAuditEvent({ action: "inventory.stocktake_approved", entityType: "InventoryStocktake", entityId: stocktake.id, businessId, branchId, actorUserId: req.user!.id, correlationId: req.correlationId ?? null, metadata: { reference: stocktake.reference } });
  res.status(200).json({ data: stocktake });
}

export async function applyStocktake(req: Request, res: Response) {
  const businessId = requireBusinessId(req), branchId = requireBranchId(req);
  const { id } = inventoryOperationIdParamSchema.parse(req.params);
  const stocktake = await applyInventoryStocktake({ businessId, branchId, userId: req.user!.id }, { stocktakeId: id, appliedById: req.user!.id });
  await recordAuditEvent({ action: "inventory.stocktake_applied", entityType: "InventoryStocktake", entityId: stocktake.id, businessId, branchId, actorUserId: req.user!.id, correlationId: req.correlationId ?? null, metadata: { reference: stocktake.reference, lineCount: stocktake.lines.length } });
  res.status(200).json({ data: stocktake });
}

export async function listReservations(req: Request, res: Response) {
  const businessId = requireBusinessId(req), branchId = requireBranchId(req);
  const reservations = await listInventoryReservations({ businessId, branchId, userId: req.user!.id });
  res.status(200).json({ data: reservations });
}

export async function createReservation(req: Request, res: Response) {
  const businessId = requireBusinessId(req), branchId = requireBranchId(req);
  const input = createInventoryReservationSchema.parse(req.body);
  const reservation = await createInventoryReservation({ businessId, branchId, userId: req.user!.id }, { inventoryItemId: input.inventoryItemId, quantity: input.quantity, ...(input.reference !== undefined ? { reference: input.reference } : {}), ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}), createdById: req.user!.id });
  await recordAuditEvent({ action: "inventory.stock_reserved", entityType: "InventoryReservation", entityId: reservation.id, businessId, branchId, actorUserId: req.user!.id, correlationId: req.correlationId ?? null, metadata: { inventoryItemId: reservation.inventoryItemId, quantity: reservation.quantity } });
  res.status(201).json({ data: reservation });
}

export async function releaseReservation(req: Request, res: Response) {
  const businessId = requireBusinessId(req), branchId = requireBranchId(req);
  const { id } = inventoryOperationIdParamSchema.parse(req.params);
  const consumed = req.body?.consumed === true;
  const reservation = await releaseInventoryReservation({ businessId, branchId, userId: req.user!.id }, { reservationId: id, consumed, actedById: req.user!.id });
  await recordAuditEvent({ action: consumed ? "inventory.reservation_consumed" : "inventory.reservation_released", entityType: "InventoryReservation", entityId: reservation.id, businessId, branchId, actorUserId: req.user!.id, correlationId: req.correlationId ?? null, metadata: { status: reservation.status } });
  res.status(200).json({ data: reservation });
}

export async function reorderRecommendations(req: Request, res: Response) {
  const businessId = requireBusinessId(req), branchId = requireBranchId(req);
  res.status(200).json({ data: await getInventoryReorderRecommendations({ businessId, branchId, userId: req.user!.id }) });
}

export async function inventoryReports(req: Request, res: Response) {
  const businessId = requireBusinessId(req), branchId = requireBranchId(req);
  res.status(200).json({ data: await getInventoryReports({ businessId, branchId, userId: req.user!.id }) });
}


export async function inventoryBranchComparison(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  res.status(200).json({ data: await getInventoryBranchComparison({ businessId }) });
}
