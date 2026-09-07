import { apiFetch, ApiError, NetworkError } from "./api-client.js";
import {
  listOfflineSyncOperations,
  updateOfflineSyncOperation,
  type OfflineSyncOperationStatus,
  type OfflineSyncQueueEntry,
} from "./offline-sync-queue.js";

const REPLAYABLE_OPERATION_TYPES = new Set([
  "ORDER_CREATE",
  "ORDER_UPDATE",
  "CUSTOMER_CREATE",
  "CUSTOMER_UPDATE",
]);

export interface ReplaySyncContext {
  businessId: string;
  branchId: string;
  accessToken: string;
}

export interface ReplayOperationResponse {
  status: "APPLIED" | "CONFLICT" | "REJECTED" | "FAILED";
  operation: {
    id: string;
    status: OfflineSyncOperationStatus;
    lastError?: string | null;
    conflictReason?: string | null;
  };
  result?: unknown;
}

export interface ReplaySyncResult {
  processed: number;
  applied: number;
  conflicts: number;
  rejected: number;
  failed: number;
  skipped: number;
}

let replayWorkerRunning = false;

function isReplayable(entry: OfflineSyncQueueEntry): boolean {
  return REPLAYABLE_OPERATION_TYPES.has(entry.operationType);
}

function isRetryableHttpError(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return true;
  }

  if (error instanceof ApiError) {
    return error.status >= 500;
  }

  return false;
}

async function replayOne(
  entry: OfflineSyncQueueEntry,
  context: ReplaySyncContext,
): Promise<"APPLIED" | "CONFLICT" | "REJECTED" | "FAILED" | "SKIPPED"> {
  if (entry.id === undefined) {
    return "SKIPPED";
  }

  if (!isReplayable(entry)) {
    return "SKIPPED";
  }

  try {
    const response = await apiFetch<ReplayOperationResponse>(
      `/sync/${encodeURIComponent(String(entry.id))}/replay`,
      {
        method: "POST",
        accessToken: context.accessToken,
        branchId: context.branchId,
      },
    );

    if (
      response.status !== "APPLIED" &&
      response.status !== "CONFLICT" &&
      response.status !== "REJECTED" &&
      response.status !== "FAILED"
    ) {
      return "FAILED";
    }

    await updateOfflineSyncOperation(entry.id, {
      status: response.status,
      lastError:
        response.operation.lastError ??
        (response.status === "CONFLICT"
          ? response.operation.conflictReason ?? null
          : null),
    });

    return response.status;
  } catch (error) {
    if (isRetryableHttpError(error)) {
      await updateOfflineSyncOperation(entry.id, {
        status: "PENDING",
        lastError:
          error instanceof Error
            ? error.message
            : "Temporary offline sync failure",
      });

      return "FAILED";
    }

    if (error instanceof ApiError) {
      if (error.status === 403) {
        await updateOfflineSyncOperation(entry.id, {
          status: "REJECTED",
          lastError: error.message,
        });

        return "REJECTED";
      }

      if (error.status === 404) {
        await updateOfflineSyncOperation(entry.id, {
          status: "REJECTED",
          lastError: error.message,
        });

        return "REJECTED";
      }

      if (error.status === 409) {
        await updateOfflineSyncOperation(entry.id, {
          status: "PENDING",
          lastError: error.message,
        });

        return "FAILED";
      }
    }

    await updateOfflineSyncOperation(entry.id, {
      status: "FAILED",
      lastError:
        error instanceof Error ? error.message : "Offline sync replay failed",
    });

    return "FAILED";
  }
}

export async function replayOfflineSyncQueue(
  context: ReplaySyncContext,
): Promise<ReplaySyncResult> {
  if (replayWorkerRunning) {
    return {
      processed: 0,
      applied: 0,
      conflicts: 0,
      rejected: 0,
      failed: 0,
      skipped: 0,
    };
  }

  replayWorkerRunning = true;

  try {
    const entries = await listOfflineSyncOperations(
      context.businessId,
      context.branchId,
      "PENDING",
    );

    entries.sort((a, b) => a.createdAt - b.createdAt);

    const result: ReplaySyncResult = {
      processed: 0,
      applied: 0,
      conflicts: 0,
      rejected: 0,
      failed: 0,
      skipped: 0,
    };

    for (const entry of entries) {
      if (!isReplayable(entry)) {
        result.skipped += 1;
        continue;
      }

      result.processed += 1;

      const status = await replayOne(entry, context);

      switch (status) {
        case "APPLIED":
          result.applied += 1;
          break;
        case "CONFLICT":
          result.conflicts += 1;
          break;
        case "REJECTED":
          result.rejected += 1;
          break;
        case "FAILED":
          result.failed += 1;
          break;
        case "SKIPPED":
          result.skipped += 1;
          break;
      }
    }

    return result;
  } finally {
    replayWorkerRunning = false;
  }
}
