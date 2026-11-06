
import type {
  OfflineSyncOperationType,
  OfflineSyncStatus,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { hasPermission } from "../permissions/permissions.service.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  createCustomer,
  findPossibleDuplicates,
  updateCustomer,
} from "../customers/customers.service.js";
import {
  createOrder,
  transferOrder,
  updateOrderStatus,
} from "../orders/orders.service.js";
import {
  syncPayloadSchema,
  syncOperationTypeSchema,
} from "./sync.validation.js";
import type {
  EnqueueSyncOperationInput,
  ListSyncOperationsInput,
  SyncContext,
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


const PROCESSING_STALE_AFTER_MS = 5 * 60 * 1000;

export interface ReplaySyncOperationInput {
  context: {
    businessId: string;
    branchId: string;
    actorUserId: string;
    actorRole: SyncContext["actorRole"];
  };
  id: string;
}

function isStaleProcessingOperation(lastAttemptAt: Date | null): boolean {
  if (!lastAttemptAt) return true;
  return Date.now() - lastAttemptAt.getTime() >= PROCESSING_STALE_AFTER_MS;
}

async function claimSyncOperation(
  id: string,
  context: ReplaySyncOperationInput["context"],
) {
  const existing = await prisma.offlineSyncOperation.findFirst({
    where: {
      id,
      businessId: context.businessId,
      branchId: context.branchId,
    },
  });

  if (!existing) {
    throw new AppError("Sync operation not found", 404);
  }

  if (existing.status === "APPLIED") {
    return { operation: existing, claimed: false };
  }

  if (
    existing.status === "PROCESSING" &&
    !isStaleProcessingOperation(existing.lastAttemptAt)
  ) {
    throw new AppError("Sync operation is already being processed", 409);
  }

  if (
    existing.status !== "PENDING" &&
    existing.status !== "PROCESSING" &&
    existing.status !== "FAILED"
  ) {
    throw new AppError(
      `Sync operation cannot be replayed from status "${existing.status}"`,
      409,
    );
  }

  const now = new Date();

  const claimed = await prisma.offlineSyncOperation.updateMany({
    where: {
      id: existing.id,
      businessId: context.businessId,
      branchId: context.branchId,
      ...(existing.status === "PENDING"
        ? { status: "PENDING" }
        : existing.status === "FAILED"
          ? { status: "FAILED" }
          : {
              status: "PROCESSING",
              lastAttemptAt: existing.lastAttemptAt,
            }),
    },
    data: {
      status: "PROCESSING",
      attemptCount: { increment: 1 },
      lastAttemptAt: now,
      lastError: null,
      conflictReason: null,
    },
  });

  if (claimed.count !== 1) {
    throw new AppError("Sync operation is already being processed", 409);
  }

  return {
    operation: await prisma.offlineSyncOperation.findUniqueOrThrow({
      where: { id: existing.id },
    }),
    claimed: true,
  };
}

const DUPLICATE_CUSTOMER_CONFLICT_MESSAGE =
  "A customer with this phone number already exists";

function isDuplicateConflict(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.statusCode === 409 &&
    error.message === DUPLICATE_CUSTOMER_CONFLICT_MESSAGE
  );
}

async function applySyncOperation(
  operation: Awaited<ReturnType<typeof prisma.offlineSyncOperation.findUniqueOrThrow>>,
  context: ReplaySyncOperationInput["context"],
) {
  const payload = validatePayload(operation.operationType, operation.payload);

  return prisma.$transaction(async (tx) => {
    let result: unknown;

    switch (operation.operationType) {
      case "CUSTOMER_CREATE": {
        const input = payload as {
          name: string;
          phone: string;
          email?: string;
          address?: string;
          notes?: string;
          whatsappOptIn?: boolean;
          whatsappOptInSource?: string;
        };

        const duplicates = await findPossibleDuplicates(
          context.businessId,
          context.branchId,
          context.actorUserId,
          input.phone,
          undefined,
          tx,
        );

        if (duplicates.length > 0) {
          throw new AppError(
            DUPLICATE_CUSTOMER_CONFLICT_MESSAGE,
            409,
          );
        }

        result = await createCustomer(
          {
            businessId: context.businessId,
            branchId: context.branchId,
            name: input.name,
            phone: input.phone,
            ...(input.email !== undefined && { email: input.email }),
            ...(input.address !== undefined && { address: input.address }),
            ...(input.notes !== undefined && { notes: input.notes }),
            ...(input.whatsappOptIn !== undefined && { whatsappOptIn: input.whatsappOptIn }),
            ...(input.whatsappOptInSource !== undefined && { whatsappOptInSource: input.whatsappOptInSource }),
          },
          tx,
        );
        break;
      }

      case "CUSTOMER_UPDATE": {
        const input = payload as {
          customerId: string;
          data: {
            name?: string;
            phone?: string;
            email?: string;
            address?: string;
            notes?: string;
            whatsappOptIn?: boolean;
            whatsappOptInSource?: string;
          };
        };

        if (input.data.phone !== undefined) {
          const duplicates = await findPossibleDuplicates(
            context.businessId,
            context.branchId,
            context.actorUserId,
            input.data.phone,
            input.customerId,
            tx,
            context.actorUserId,
          );

          if (duplicates.length > 0) {
            throw new AppError(
              "A customer with this phone number already exists",
              409,
            );
          }
        }

        result = await updateCustomer(
          input.customerId,
          context.businessId,
          context.branchId,
          context.actorUserId,
          input.data,
          tx,
        );
        break;
      }

      case "ORDER_CREATE": {
        const input = payload as {
          customerId: string;
          items: Array<{
            serviceId: string;
            quantity: number;
          }>;
          expectedReadyAt?: string;
          garmentNote?: string;
          internalNote?: string;
        };

        result = await createOrder(
          {
            businessId: context.businessId,
            branchId: context.branchId,
            actorUserId: context.actorUserId,
            customerId: input.customerId,
            items: input.items,
            ...(input.expectedReadyAt !== undefined && {
              expectedReadyAt: new Date(input.expectedReadyAt),
            }),
            ...(input.garmentNote !== undefined && {
              garmentNote: input.garmentNote,
            }),
            ...(input.internalNote !== undefined && {
              internalNote: input.internalNote,
            }),
          },
          tx,
        );
        break;
      }

      case "ORDER_UPDATE": {
        const input = payload as
          | {
              action: "TRANSFER_CUSTOMER";
              orderId: string;
              customerId: string;
            }
          | {
              action: "UPDATE_STATUS";
              orderId: string;
              status: OrderStatus;
            };

        if (input.action === "TRANSFER_CUSTOMER") {
          result = await transferOrder(
            input.orderId,
            context.businessId,
            context.branchId,
            input.customerId,
            tx,
          );
        } else {
          result = await updateOrderStatus(
            input.orderId,
            context.businessId,
            context.branchId,
            input.status,
            tx,
          );
        }
        break;
      }
    }

    const applied = await tx.offlineSyncOperation.update({
      where: { id: operation.id },
      data: {
        status: "APPLIED",
        processedAt: new Date(),
        lastError: null,
        conflictReason: null,
      },
    });

    return { operation: applied, result };
  });
}

export async function replaySyncOperation(
  input: ReplaySyncOperationInput,
) {
  const operationType = await prisma.offlineSyncOperation.findFirst({
    where: {
      id: input.id,
      businessId: input.context.businessId,
      branchId: input.context.branchId,
    },
    select: {
      operationType: true,
      payload: true,
      status: true,
    },
  });

  if (!operationType) {
    throw new AppError("Sync operation not found", 404);
  }

  if (operationType.status === "APPLIED") {
    return {
      status: "APPLIED" as const,
      operation: await getSyncOperation(input.id, input.context),
    };
  }

  const payload = validatePayload(
    operationType.operationType,
    operationType.payload,
  );
  const requiredPermission = getRequiredPermission(
    operationType.operationType,
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
      "Insufficient permissions to replay this offline sync operation",
      403,
    );
  }

  const claim = await claimSyncOperation(input.id, input.context);

  if (!claim.claimed) {
    return {
      status: "APPLIED" as const,
      operation: claim.operation,
    };
  }

  try {
    const applied = await applySyncOperation(
      claim.operation,
      input.context,
    );

    await recordAuditEvent({
      action: "sync.operation_applied",
      entityType: "OfflineSyncOperation",
      entityId: applied.operation.id,
      businessId: input.context.businessId,
      branchId: input.context.branchId,
      actorUserId: input.context.actorUserId,
      correlationId: applied.operation.correlationId,
      metadata: {
        clientOperationId: applied.operation.clientOperationId,
        operationType: applied.operation.operationType,
        attemptCount: applied.operation.attemptCount,
      },
    });

    return {
      status: "APPLIED" as const,
      operation: applied.operation,
      result: applied.result,
    };
  } catch (error) {
    if (isDuplicateConflict(error)) {
      const conflict = await prisma.offlineSyncOperation.update({
        where: { id: claim.operation.id },
        data: {
          status: "CONFLICT",
          conflictReason:
            error instanceof AppError ? error.message : "Sync conflict",
          lastError: null,
        },
      });

      await recordAuditEvent({
        action: "sync.operation_conflict",
        entityType: "OfflineSyncOperation",
        entityId: conflict.id,
        businessId: input.context.businessId,
        branchId: input.context.branchId,
        actorUserId: input.context.actorUserId,
        correlationId: conflict.correlationId,
        metadata: {
          clientOperationId: conflict.clientOperationId,
          operationType: conflict.operationType,
          reason: conflict.conflictReason,
        },
      });

      return {
        status: "CONFLICT" as const,
        operation: conflict,
      };
    }

    if (error instanceof AppError && error.statusCode === 404) {
      const rejected = await prisma.offlineSyncOperation.update({
        where: { id: claim.operation.id },
        data: {
          status: "REJECTED",
          lastError: error.message,
        },
      });

      await recordAuditEvent({
        action: "sync.operation_rejected",
        entityType: "OfflineSyncOperation",
        entityId: rejected.id,
        businessId: input.context.businessId,
        branchId: input.context.branchId,
        actorUserId: input.context.actorUserId,
        correlationId: rejected.correlationId,
        metadata: {
          clientOperationId: rejected.clientOperationId,
          operationType: rejected.operationType,
          reason: rejected.lastError,
        },
      });

      return {
        status: "REJECTED" as const,
        operation: rejected,
      };
    }

    const failed = await prisma.offlineSyncOperation.update({
      where: { id: claim.operation.id },
      data: {
        status: "FAILED",
        lastError:
          error instanceof Error ? error.message : "Offline sync replay failed",
      },
    });

    await recordAuditEvent({
      action: "sync.operation_failed",
      entityType: "OfflineSyncOperation",
      entityId: failed.id,
      businessId: input.context.businessId,
      branchId: input.context.branchId,
      actorUserId: input.context.actorUserId,
      correlationId: failed.correlationId,
      metadata: {
        clientOperationId: failed.clientOperationId,
        operationType: failed.operationType,
        reason: failed.lastError,
      },
    });

    return {
      status: "FAILED" as const,
      operation: failed,
    };
  }
}
