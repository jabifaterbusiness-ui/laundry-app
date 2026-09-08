import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineSyncQueueEntry } from "./offline-sync-queue.js";

const mocks = vi.hoisted(() => {
  class TestApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
      this.name = "ApiError";
    }
  }

  class TestNetworkError extends Error {
    constructor(message = "Unable to reach the server") {
      super(message);
      this.name = "NetworkError";
    }
  }

  return {
    apiFetch: vi.fn(),
    listOfflineSyncOperations: vi.fn(),
    updateOfflineSyncOperation: vi.fn(),
    ApiError: TestApiError,
    NetworkError: TestNetworkError,
  };
});

vi.mock("./api-client.js", () => ({
  apiFetch: mocks.apiFetch,
  ApiError: mocks.ApiError,
  NetworkError: mocks.NetworkError,
}));

vi.mock("./offline-sync-queue.js", () => ({
  listOfflineSyncOperations: mocks.listOfflineSyncOperations,
  updateOfflineSyncOperation: mocks.updateOfflineSyncOperation,
}));

import { replayOfflineSyncQueue } from "./offline-sync-replay.js";

function makeEntry(
  overrides: Partial<OfflineSyncQueueEntry> = {},
): OfflineSyncQueueEntry {
  return {
    id: 1,
    businessId: "business-1",
    branchId: "branch-1",
    actorUserId: "user-1",
    clientOperationId: "client-op-1",
    operationType: "CUSTOMER_CREATE",
    payloadVersion: 1,
    payload: {
      name: "Test Customer",
      phone: "08000000000",
    },
    correlationId: null,
    status: "PENDING",
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const context = {
  businessId: "business-1",
  branchId: "branch-1",
  accessToken: "access-token",
};

beforeEach(() => {
  vi.clearAllMocks();

  mocks.listOfflineSyncOperations.mockResolvedValue([]);
  mocks.updateOfflineSyncOperation.mockResolvedValue(undefined);
});

describe("replayOfflineSyncQueue", () => {
  it("replays pending operations in FIFO order", async () => {
    const first = makeEntry({
      id: 1,
      clientOperationId: "first",
      createdAt: 100,
    });

    const second = makeEntry({
      id: 2,
      clientOperationId: "second",
      createdAt: 200,
    });

    mocks.listOfflineSyncOperations.mockResolvedValue([second, first]);

    mocks.apiFetch
      .mockResolvedValueOnce({
        status: "APPLIED",
        operation: {
          id: "server-1",
          status: "APPLIED",
          lastError: null,
          conflictReason: null,
        },
      })
      .mockResolvedValueOnce({
        status: "APPLIED",
        operation: {
          id: "server-2",
          status: "APPLIED",
          lastError: null,
          conflictReason: null,
        },
      });

    const result = await replayOfflineSyncQueue(context);

    expect(result).toEqual({
      processed: 2,
      applied: 2,
      conflicts: 0,
      rejected: 0,
      failed: 0,
      skipped: 0,
    });

    expect(mocks.apiFetch).toHaveBeenNthCalledWith(
      1,
      "/sync/1/replay",
      expect.objectContaining({
        method: "POST",
        accessToken: "access-token",
        branchId: "branch-1",
      }),
    );

    expect(mocks.apiFetch).toHaveBeenNthCalledWith(
      2,
      "/sync/2/replay",
      expect.objectContaining({
        method: "POST",
        accessToken: "access-token",
        branchId: "branch-1",
      }),
    );
  });

  it("loads only the active business and branch queue", async () => {
    await replayOfflineSyncQueue(context);

    expect(mocks.listOfflineSyncOperations).toHaveBeenCalledWith(
      "business-1",
      "branch-1",
      "PENDING",
    );
  });

  it("marks an applied operation as APPLIED locally", async () => {
    const entry = makeEntry();

    mocks.listOfflineSyncOperations.mockResolvedValue([entry]);

    mocks.apiFetch.mockResolvedValue({
      status: "APPLIED",
      operation: {
        id: "server-1",
        status: "APPLIED",
        lastError: null,
        conflictReason: null,
      },
      result: {
        id: "customer-1",
      },
    });

    const result = await replayOfflineSyncQueue(context);

    expect(result.applied).toBe(1);

    expect(mocks.updateOfflineSyncOperation).toHaveBeenCalledWith(1, {
      status: "APPLIED",
      lastError: null,
    });
  });

  it("retains a conflict locally", async () => {
    const entry = makeEntry();

    mocks.listOfflineSyncOperations.mockResolvedValue([entry]);

    mocks.apiFetch.mockResolvedValue({
      status: "CONFLICT",
      operation: {
        id: "server-1",
        status: "CONFLICT",
        lastError: null,
        conflictReason: "Customer already exists",
      },
    });

    const result = await replayOfflineSyncQueue(context);

    expect(result.conflicts).toBe(1);

    expect(mocks.updateOfflineSyncOperation).toHaveBeenCalledWith(1, {
      status: "CONFLICT",
      lastError: "Customer already exists",
    });
  });

  it("retains a rejected operation locally", async () => {
    const entry = makeEntry();

    mocks.listOfflineSyncOperations.mockResolvedValue([entry]);

    mocks.apiFetch.mockResolvedValue({
      status: "REJECTED",
      operation: {
        id: "server-1",
        status: "REJECTED",
        lastError: "Customer no longer exists",
        conflictReason: null,
      },
    });

    const result = await replayOfflineSyncQueue(context);

    expect(result.rejected).toBe(1);

    expect(mocks.updateOfflineSyncOperation).toHaveBeenCalledWith(1, {
      status: "REJECTED",
      lastError: "Customer no longer exists",
    });
  });

  it("returns temporary network failures to PENDING for retry", async () => {
    const entry = makeEntry();

    mocks.listOfflineSyncOperations.mockResolvedValue([entry]);
    mocks.apiFetch.mockRejectedValue(new mocks.NetworkError());

    const result = await replayOfflineSyncQueue(context);

    expect(result.failed).toBe(1);

    expect(mocks.updateOfflineSyncOperation).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: "PENDING",
      }),
    );
  });

  it("returns HTTP 5xx failures to PENDING for retry", async () => {
    const entry = makeEntry();

    mocks.listOfflineSyncOperations.mockResolvedValue([entry]);
    mocks.apiFetch.mockRejectedValue(
      new mocks.ApiError("Server unavailable", 503),
    );

    const result = await replayOfflineSyncQueue(context);

    expect(result.failed).toBe(1);

    expect(mocks.updateOfflineSyncOperation).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: "PENDING",
        lastError: "Server unavailable",
      }),
    );
  });

  it("marks HTTP 403 as REJECTED", async () => {
    const entry = makeEntry();

    mocks.listOfflineSyncOperations.mockResolvedValue([entry]);
    mocks.apiFetch.mockRejectedValue(
      new mocks.ApiError("Permission denied", 403),
    );

    const result = await replayOfflineSyncQueue(context);

    expect(result.rejected).toBe(1);

    expect(mocks.updateOfflineSyncOperation).toHaveBeenCalledWith(1, {
      status: "REJECTED",
      lastError: "Permission denied",
    });
  });

  it("marks HTTP 404 as REJECTED", async () => {
    const entry = makeEntry();

    mocks.listOfflineSyncOperations.mockResolvedValue([entry]);
    mocks.apiFetch.mockRejectedValue(
      new mocks.ApiError("Sync operation not found", 404),
    );

    const result = await replayOfflineSyncQueue(context);

    expect(result.rejected).toBe(1);

    expect(mocks.updateOfflineSyncOperation).toHaveBeenCalledWith(1, {
      status: "REJECTED",
      lastError: "Sync operation not found",
    });
  });

  it("returns HTTP 409 to PENDING for retry", async () => {
    const entry = makeEntry();

    mocks.listOfflineSyncOperations.mockResolvedValue([entry]);
    mocks.apiFetch.mockRejectedValue(
      new mocks.ApiError("Operation is still processing", 409),
    );

    const result = await replayOfflineSyncQueue(context);

    expect(result.failed).toBe(1);

    expect(mocks.updateOfflineSyncOperation).toHaveBeenCalledWith(1, {
      status: "PENDING",
      lastError: "Operation is still processing",
    });
  });

  it("prevents concurrent replay workers", async () => {
    const entry = makeEntry();

    mocks.listOfflineSyncOperations.mockResolvedValue([entry]);

    let release!: () => void;

    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });

    mocks.apiFetch.mockImplementationOnce(async () => {
      await blocked;

      return {
        status: "APPLIED",
        operation: {
          id: "server-1",
          status: "APPLIED",
          lastError: null,
          conflictReason: null,
        },
      };
    });

    const firstRun = replayOfflineSyncQueue(context);

    await Promise.resolve();

    const secondResult = await replayOfflineSyncQueue(context);

    expect(secondResult).toEqual({
      processed: 0,
      applied: 0,
      conflicts: 0,
      rejected: 0,
      failed: 0,
      skipped: 0,
    });

    release();

    const firstResult = await firstRun;

    expect(firstResult.applied).toBe(1);
  });

  it("skips unsupported operation types", async () => {
    const entry = makeEntry({
      operationType: "ORDER_CREATE",
    });

    mocks.listOfflineSyncOperations.mockResolvedValue([entry]);

    mocks.apiFetch.mockResolvedValue({
      status: "APPLIED",
      operation: {
        id: "server-1",
        status: "APPLIED",
        lastError: null,
        conflictReason: null,
      },
    });

    const result = await replayOfflineSyncQueue(context);

    expect(result.processed).toBe(1);
    expect(result.applied).toBe(1);
  });
});
