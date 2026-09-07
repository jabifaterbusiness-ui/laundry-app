import type {
  OfflineSyncOperationType,
  OfflineSyncStatus,
  Role,
} from "@prisma/client";

export interface SyncContext {
  businessId: string;
  branchId: string;
  actorUserId: string;
  actorRole: Role;
}

export interface EnqueueSyncOperationInput {
  context: SyncContext;
  clientOperationId: string;
  operationType: OfflineSyncOperationType;
  payloadVersion?: number;
  payload: unknown;
  correlationId?: string | null;
}

export interface ListSyncOperationsInput {
  context: SyncContext;
  status?: OfflineSyncStatus;
  page: number;
  pageSize: number;
}
