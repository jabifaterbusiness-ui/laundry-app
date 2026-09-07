import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import {
  enqueueSyncOperationSchema,
  listSyncOperationsQuerySchema,
  syncOperationIdParamSchema,
} from "./sync.validation.js";
import {
  enqueueSyncOperation,
  getSyncOperation,
  listSyncOperations,
  replaySyncOperation,
} from "./sync.service.js";

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
    throw new AppError("A valid branch context is required", 400);
  }

  return req.branchId;
}

export async function enqueue(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);

  const input = enqueueSyncOperationSchema.parse(req.body);

  const operation = await enqueueSyncOperation({
    context: {
      businessId,
      branchId,
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
    },
    clientOperationId: input.clientOperationId,
    operationType: input.operationType,
    ...(input.payloadVersion !== undefined && {
      payloadVersion: input.payloadVersion,
    }),
    payload: input.payload,
    correlationId: req.correlationId ?? input.correlationId ?? null,
  });

  res.status(201).json(operation);
}

export async function getOne(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = syncOperationIdParamSchema.parse(req.params);

  const operation = await getSyncOperation(id, {
    businessId,
    branchId,
  });

  res.status(200).json(operation);
}

export async function list(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const query = listSyncOperationsQuerySchema.parse(req.query);

  const result = await listSyncOperations({
    context: {
      businessId,
      branchId,
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
    },
    ...(query.status !== undefined && {
      status: query.status,
    }),
    page: query.page,
    pageSize: query.pageSize,
  });

  res.status(200).json(result);
}


export async function replay(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = syncOperationIdParamSchema.parse(req.params);

  const result = await replaySyncOperation({
    context: {
      businessId,
      branchId,
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
    },
    id,
  });

  res.status(200).json(result);
}
