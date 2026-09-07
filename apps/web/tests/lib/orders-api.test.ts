import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrderWithOfflineQueue,
  updateOrderStatusWithOfflineQueue,
} from "../../src/lib/orders-api.js";
import { ApiError, NetworkError } from "../../src/lib/api-client.js";
import {
  clearOfflineSyncQueue,
  listOfflineSyncOperations,
} from "../../src/lib/offline-sync-queue.js";

const auth = { accessToken: "token" };

const syncContext = {
  businessId: "business-1",
  branchId: "branch-1",
  actorUserId: "user-1",
};

const createInput = {
  customerId: "customer-1",
  items: [
    {
      serviceId: "service-1",
      quantity: 2,
    },
  ],
  garmentNote: "Handle carefully",
  internalNote: "Keep separate",
  expectedReadyAt: "2026-09-10T10:00:00.000Z",
};

describe("orders-api offline queue", () => {
  beforeEach(async () => {
    await clearOfflineSyncQueue();
    vi.restoreAllMocks();
  });

  it("queues ORDER_CREATE when the network is unavailable", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new NetworkError("Unable to reach the server"));

    const result = await createOrderWithOfflineQueue(
      createInput,
      auth,
      syncContext,
    );

    expect(result.queued).toBe(true);
    if (!result.queued) throw new Error("Expected operation to be queued");

    expect(result.operation.operationType).toBe("ORDER_CREATE");
    expect(result.operation.businessId).toBe("business-1");
    expect(result.operation.branchId).toBe("branch-1");
    expect(result.operation.actorUserId).toBe("user-1");
    expect(result.operation.payload).toEqual(createInput);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const queued = await listOfflineSyncOperations(
      "business-1",
      "branch-1",
    );

    expect(queued).toHaveLength(1);
    expect(queued[0].operationType).toBe("ORDER_CREATE");
  });

  it("queues ORDER_UPDATE for a status update when the network is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new NetworkError("Unable to reach the server"),
    );

    const result = await updateOrderStatusWithOfflineQueue(
      "order-1",
      "READY_FOR_PICKUP",
      auth,
      syncContext,
    );

    expect(result.queued).toBe(true);
    if (!result.queued) throw new Error("Expected operation to be queued");

    expect(result.operation.operationType).toBe("ORDER_UPDATE");
    expect(result.operation.payload).toEqual({
      orderId: "order-1",
      operation: "UPDATE_STATUS",
      status: "READY_FOR_PICKUP",
    });
  });

  it("does not queue when the server returns an API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "Order not found",
          },
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      createOrderWithOfflineQueue(createInput, auth, syncContext),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
    });

    const queued = await listOfflineSyncOperations(
      "business-1",
      "branch-1",
    );

    expect(queued).toHaveLength(0);
  });

  it("does not queue when the offline business/branch context is incomplete", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new NetworkError("Unable to reach the server"),
    );

    await expect(
      createOrderWithOfflineQueue(createInput, auth, {
        businessId: "",
        branchId: "branch-1",
        actorUserId: "user-1",
      }),
    ).rejects.toThrow(NetworkError);

    const queued = await listOfflineSyncOperations(
      "business-1",
      "branch-1",
    );

    expect(queued).toHaveLength(0);
  });
});
