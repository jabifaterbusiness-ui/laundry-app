import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  garmentIdParamSchema,
  listGarmentsQuerySchema,
  orderIdParamSchema,
  updateGarmentStatusSchema,
} from "./garments.validation.js";
import {
  createGarmentsForOrder,
  getGarmentForBusiness,
  listGarments,
  updateGarmentStatus,
} from "./garments.service.js";

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

export async function createForOrder(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { orderId } = orderIdParamSchema.parse(req.params);

  const garments = await createGarmentsForOrder(
    orderId,
    businessId,
    branchId,
  );

  await recordAuditEvent({
    action: "garments.created_for_order",
    entityType: "Order",
    entityId: orderId,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      garmentCount: garments.length,
    },
  });

  res.status(201).json({
    data: garments,
  });
}

export async function list(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const query = listGarmentsQuerySchema.parse(req.query);

  const result = await listGarments({
    businessId,
    branchId,
    page: query.page,
    pageSize: query.pageSize,
    ...(query.orderId !== undefined && {
      orderId: query.orderId,
    }),
    ...(query.orderItemId !== undefined && {
      orderItemId: query.orderItemId,
    }),
    ...(query.status !== undefined && {
      status: query.status,
    }),
  });

  res.status(200).json(result);
}

export async function getOne(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = garmentIdParamSchema.parse(req.params);

  const garment = await getGarmentForBusiness(
    id,
    businessId,
    branchId,
  );

  if (!garment) {
    throw new AppError("Garment not found", 404);
  }

  res.status(200).json(garment);
}

export async function updateStatus(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = garmentIdParamSchema.parse(req.params);
  const input = updateGarmentStatusSchema.parse(req.body);

  const garment = await updateGarmentStatus(
    id,
    businessId,
    branchId,
    input.status,
    input.note,
  );

  await recordAuditEvent({
    action: "garment.status_updated",
    entityType: "Garment",
    entityId: garment.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      status: garment.status,
      orderId: garment.orderId,
    },
  });

  res.status(200).json(garment);
}
