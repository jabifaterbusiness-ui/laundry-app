import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import {
  createOrderSchema,
  editOrderSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
  transferOrderSchema,
  updateOrderStatusSchema,
} from "./orders.validation.js";
import {
  createOrder,
  getOrderForBusiness,
  listOrders,
  transferOrder,
  updateOrderStatus,
} from "./orders.service.js";
import { editOrderWithCorrection } from "./order-corrections.service.js";

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

export async function create(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const input = createOrderSchema.parse(req.body);

  const order = await createOrder({
    businessId,
    branchId,
    actorUserId: req.user!.id,
    customerId: input.customerId,
    items: input.items,
    ...(input.adjustments !== undefined ? {
      adjustments: input.adjustments.map((selection) => ({
        adjustmentId: selection.adjustmentId,
        scope: selection.scope,
        ...(selection.itemIndexes !== undefined ? { itemIndexes: selection.itemIndexes } : {}),
      })),
    } : {}),
    ...(input.taxRuleIds !== undefined ? { taxRuleIds: input.taxRuleIds } : {}),
    ...(input.garmentNote !== undefined && {
      garmentNote: input.garmentNote,
    }),
    ...(input.internalNote !== undefined && {
      internalNote: input.internalNote,
    }),
    ...(input.expectedReadyAt !== undefined && {
      expectedReadyAt: input.expectedReadyAt,
    }),
  });

  await recordAuditEvent({
    action: "order.created",
    entityType: "Order",
    entityId: order.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      orderTotal: order.orderTotal,
      itemCount: order.items.length,
    },
  });

  res.status(201).json(order);
}

export async function list(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const query = listOrdersQuerySchema.parse(req.query);

  const result = await listOrders({
    businessId,
    branchId,
    page: query.page,
    pageSize: query.pageSize,
    ...(query.customerId !== undefined && {
      customerId: query.customerId,
    }),
    ...(query.status !== undefined && {
      status: query.status,
    }),
  });

  res.status(200).json(result);
}

export async function getOne(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = orderIdParamSchema.parse(req.params);

  const order = await getOrderForBusiness(
    id,
    businessId,
    branchId,
  );

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  res.status(200).json(order);
}

export async function transfer(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = orderIdParamSchema.parse(req.params);
  const input = transferOrderSchema.parse(req.body);

  const previousOrder = await getOrderForBusiness(
    id,
    businessId,
    branchId,
  );

  if (!previousOrder) {
    throw new AppError("Order not found", 404);
  }

  const previousCustomerId = previousOrder.customerId;

  const order = await transferOrder(
    id,
    businessId,
    branchId,
    input.customerId,
    prisma,
    req.user!.id,
  );

  await recordAuditEvent({
    action: "order.customer_transferred",
    entityType: "Order",
    entityId: order.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      orderNumber: order.orderNumber,
      previousCustomerId,
      newCustomerId: order.customerId,
    },
  });

  res.status(200).json(order);
}


export async function updateStatus(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = orderIdParamSchema.parse(req.params);
  const input = updateOrderStatusSchema.parse(req.body);

  const previousOrder = await getOrderForBusiness(id, businessId, branchId);
  if (!previousOrder) throw new AppError("Order not found", 404);

  const order = await updateOrderStatus(
    id,
    businessId,
    branchId,
    input.status,
  );

  if (previousOrder.status !== order.status) {
    const statusUpdate = order as typeof order & {
      notificationResults?: Array<{ channel: string; status: string; deliveryId?: string | null; error?: string }>;
      notificationError?: string | null;
    };
    const notificationResults = (statusUpdate.notificationResults ?? []).map((result) => ({
      channel: result.channel,
      status: result.status,
      deliveryId: result.deliveryId ?? null,
      error: result.error ?? null,
    }));
    const notificationError = statusUpdate.notificationError
      ? "One or more status notifications could not be processed. See Communications delivery history."
      : null;

    await recordAuditEvent({
      action: "order.status_updated",
      entityType: "Order",
      entityId: order.id,
      businessId,
      branchId,
      actorUserId: req.user!.id,
      correlationId: req.correlationId ?? null,
      metadata: {
        orderNumber: order.orderNumber,
        previousStatus: previousOrder.status,
        status: order.status,
        notificationResults,
        notificationError,
      },
    });
  }

  res.status(200).json(order);
}

export async function statusHistory(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = orderIdParamSchema.parse(req.params);
  const order = await getOrderForBusiness(id, businessId, branchId);
  if (!order) throw new AppError("Order not found", 404);

  const entries = await prisma.auditLog.findMany({
    where: {
      businessId,
      branchId,
      entityType: "Order",
      entityId: id,
      action: "order.status_updated",
    },
    include: { actor: { select: { fullName: true } } },
    orderBy: { timestamp: "desc" },
    take: 100,
  });
  const deliveryIds = [...new Set(entries.flatMap((entry) => {
    const metadata = entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
      ? entry.metadata as Record<string, unknown>
      : {};
    return Array.isArray(metadata.notificationResults)
      ? metadata.notificationResults.flatMap((value) => {
          if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
          const deliveryId = (value as Record<string, unknown>).deliveryId;
          return typeof deliveryId === "string" ? [deliveryId] : [];
        })
      : [];
  }))];
  const deliveryRows = deliveryIds.length
    ? await prisma.communicationDelivery.findMany({
        where: { businessId, orderId: id, id: { in: deliveryIds } },
        select: { id: true, status: true, errorMessage: true },
      })
    : [];
  const deliveryById = new Map(deliveryRows.map((delivery) => [delivery.id, delivery]));

  res.status(200).json(entries.map((entry) => {
    const metadata = entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
      ? entry.metadata as Record<string, unknown>
      : {};
    const notificationResults = Array.isArray(metadata.notificationResults)
      ? metadata.notificationResults.flatMap((value) => {
          if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
          const result = value as Record<string, unknown>;
          if (typeof result.channel !== "string" || typeof result.status !== "string") return [];
          const deliveryId = typeof result.deliveryId === "string" ? result.deliveryId : null;
          const latestDelivery = deliveryId ? deliveryById.get(deliveryId) : undefined;
          return [{
            channel: result.channel,
            status: latestDelivery?.status ?? result.status,
            deliveryId,
            error: latestDelivery?.errorMessage ?? (typeof result.error === "string" ? result.error : null),
          }];
        })
      : [];
    return {
      id: entry.id,
      previousStatus: typeof metadata.previousStatus === "string" ? metadata.previousStatus : null,
      status: typeof metadata.status === "string" ? metadata.status : "UNKNOWN",
      changedAt: entry.timestamp,
      changedBy: entry.actor?.fullName ?? "Unknown user",
      branchName: order.branch.name,
      notificationResults,
      notificationError: typeof metadata.notificationError === "string" ? metadata.notificationError : null,
    };
  }));
}

export async function editInvoice(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = orderIdParamSchema.parse(req.params);
  const input = editOrderSchema.parse(req.body);

  const result = await editOrderWithCorrection({
    orderId: id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    input: {
      reason: input.reason,
      confirmed: input.confirmed,
      items: input.items.map((item) => ({
        serviceId: item.serviceId,
        quantity: item.quantity,
        colors: item.colors,
        ...(item.id !== undefined ? { id: item.id } : {}),
      })),
      ...(input.garmentNote !== undefined && {
        garmentNote: input.garmentNote,
      }),
      ...(input.internalNote !== undefined && {
        internalNote: input.internalNote,
      }),
      ...(input.expectedReadyAt !== undefined && {
        expectedReadyAt: input.expectedReadyAt,
      }),
      ...(input.customerAgreement !== undefined && {
        customerAgreement: input.customerAgreement,
      }),
    },
  });

  await recordAuditEvent({
    action: "order.invoice_edited",
    entityType: "Order",
    entityId: result.order.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      orderNumber: result.order.orderNumber,
      invoiceNumber: result.invoice.invoiceNumber,
      reason: result.reason,
      historyId: result.history.id,
      before: result.before,
      after: result.after,
    },
  });

  res.status(200).json(result.order);
}
