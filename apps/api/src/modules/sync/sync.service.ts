import type {
  OfflineSyncOperationType,
  OfflineSyncStatus,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { hasPermission } from "../permissions/permissions.service.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  syncPayloadSchema,
  syncOperationTypeSchema,
} from "./sync.validation.js";
import type {
  EnqueueSyncOperationInput,
  ListSyncOperationsInput,
} from "./sync.types.js";

const ALLOWED_OPERATION_TYPES = new Set<OfflineSyncOperationType>([
  "ORDER_CREATE",
  "ORDER_UPDATE",
  "CUSTOMER_CREATE",
  "CUSTOMER_UPDATE",
]);

export type SyncRequiredPermission =
  | "orders.create"
  | "orders.update"
  | "orders.change_status"
  | "customers.create"
  | "customers.update";

export function getRequiredPermission(
  operationType: OfflineSyncOperationType,
  payload: unknown,
): SyncRequiredPermission {
  switch (operationType) {
    case "ORDER_CREATE":
      return "orders.create";

    case "CUSTOMER_CREATE":
      return "customers.create";

    case "CUSTOMER_UPDATE":
      return "customers.update";

    case "ORDER_UPDATE": {
      const orderPayload = payload as {
        action: "TRANSFER_CUSTOMER" | "UPDATE_STATUS";
      };

      return orderPayload.action === "UPDATE_STATUS"
        ? "orders.change_status"
        : "orders.update";
    }

    default:
      throw new AppError(
        `Offline operation "${operationType}" is not supported`,
        422,
      );
  }
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalizeJson(child)]),
    );
  }

  return value;
}

function sameJson(a: unknown, b: unknown): boolean {
  return (
    JSON.stringify(canonicalizeJson(a)) ===
    JSON.stringify(canonicalizeJson(b))
  );
}

function assertAllowedOperationType(
  operationType: OfflineSyncOperationType,
): void {
  if (!ALLOWED_OPERATION_TYPES.has(operationType)) {
    throw new AppError(
      `Offline operation "${operationType}" is not supported`,
      422,
    );
  }
}

function validatePayload(
  operationType: OfflineSyncOperationType,
  payload: unknown,
) {
  const parsed = syncPayloadSchema.safeParse({
    operationType,
    payload,
  });

  if (!parsed.success) {
    throw new AppError(
      "Invalid offline sync operation payload",
      422,
    );
  }

  return parsed.data.payload;
}

async function assertContextBelongsToBusiness(
  businessId: string,
  branchId: string,
  actorUserId: string,
): Promise<void> {
  const [branch, actor] = await Promise.all([
    prisma.branch.findFirst({
      where: {
        id: branchId,
        businessId,
      },
      select: {
        id: true,
      },
    }),

    prisma.user.findFirst({
      where: {
        id: actorUserId,
        businessId,
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!branch) {
    throw new AppError("Branch is not part of the business context", 403);
  }

  if (!actor) {
    throw new AppError("Actor is not part of the business context", 403);
  }
}

async function resolveDuplicate(
  input: EnqueueSyncOperationInput,
) {
  const existing = await prisma.offlineSyncOperation.findFirst({
    where: {
      businessId: input.context.businessId,
      clientOperationId: input.clientOperationId,
    },
  });

  if (!existing) {
    return null;
  }

  const payloadVersion = input.payloadVersion ?? 1;

  if (
    existing.operationType === input.operationType &&
    existing.payloadVersion === payloadVersion &&
    sameJson(existing.payload, input.payload)
  ) {
    return existing;
  }

  throw new AppError(
    "Client operation ID is already used for a different sync operation",
    409,
  );
}

export async function enqueueSyncOperation(
  input: EnqueueSyncOperationInput,
) {
  const operationType = syncOperationTypeSchema.parse(input.operationType);

  assertAllowedOperationType(operationType);

  const payload = validatePayload(operationType, input.payload);

  const requiredPermission = getRequiredPermission(
    operationType,
    payload,
  );

  const allowed = await hasPermission(
    input.context.actorUserId,
    input.context.businessId,
    input.context.actorRole,
    requiredPermission,
  );

  if (!allowed) {
    throw new AppError(
      "Insufficient permissions for this offline sync operation",
      403,
    );
  }

  await assertContextBelongsToBusiness(
    input.context.businessId,
    input.context.branchId,
    input.context.actorUserId,
  );

  const existing = await resolveDuplicate(input);

  if (existing) {
    return existing;
  }

  const payloadVersion = input.payloadVersion ?? 1;

  try {
    const operation = await prisma.offlineSyncOperation.create({
      data: {
        businessId: input.context.businessId,
        branchId: input.context.branchId,
        actorUserId: input.context.actorUserId,
        clientOperationId: input.clientOperationId,
        operationType,
        payloadVersion,
        payload: payload as Prisma.InputJsonValue,
        status: "PENDING",
        correlationId: input.correlationId ?? null,
      },
    });

    await recordAuditEvent({
      action: "sync.operation_queued",
      entityType: "OfflineSyncOperation",
      entityId: operation.id,
      businessId: input.context.businessId,
      branchId: input.context.branchId,
      actorUserId: input.context.actorUserId,
      correlationId: input.correlationId ?? null,
      metadata: {
        clientOperationId: input.clientOperationId,
        operationType,
        payloadVersion,
      },
    });

    return operation;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const duplicate = await resolveDuplicate(input);

      if (duplicate) {
        return duplicate;
      }
    }

    throw err;
  }
}

export async function getSyncOperation(
  id: string,
  context: {
    businessId: string;
    branchId: string;
  },
) {
  const operation = await prisma.offlineSyncOperation.findFirst({
    where: {
      id,
      businessId: context.businessId,
      branchId: context.branchId,
    },
  });

  if (!operation) {
    throw new AppError("Sync operation not found", 404);
  }

  return operation;
}

export async function listSyncOperations(
  input: ListSyncOperationsInput,
) {
  const where = {
    businessId: input.context.businessId,
    branchId: input.context.branchId,
    ...(input.status !== undefined && {
      status: input.status as OfflineSyncStatus,
    }),
  };

  const [operations, total] = await Promise.all([
    prisma.offlineSyncOperation.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),

    prisma.offlineSyncOperation.count({
      where,
    }),
  ]);

  return {
    data: operations,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}
