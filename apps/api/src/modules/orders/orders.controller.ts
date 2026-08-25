import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
  updateOrderStatusSchema,
} from "./orders.validation.js";
import {
  createOrder,
  getOrderForBusiness,
  listOrders,
  updateOrderStatus,
} from "./orders.service.js";

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
    customerId: input.customerId,
    items: input.items,
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

export async function updateStatus(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = orderIdParamSchema.parse(req.params);
  const input = updateOrderStatusSchema.parse(req.body);

  const order = await updateOrderStatus(
    id,
    businessId,
    branchId,
    input.status,
  );

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
      status: order.status,
    },
  });

  res.status(200).json(order);
}
