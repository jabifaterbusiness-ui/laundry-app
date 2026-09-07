import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCustomerWithOfflineQueue,
  updateCustomerWithOfflineQueue,
} from "../../src/lib/customers-api.js";
import { NetworkError } from "../../src/lib/api-client.js";
import {
  clearOfflineSyncQueue,
  listOfflineSyncOperations,
} from "../../src/lib/offline-sync-queue.js";

vi.mock("../../src/lib/customers-api.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/customers-api.js")>(
    "../../src/lib/customers-api.js",
  );
  return actual;
});

const auth = { accessToken: "token" };

const syncContext = {
  businessId: "business-1",
  branchId: "branch-1",
  actorUserId: "user-1",
};

describe("customers-api offline queue", () => {
  beforeEach(async () => {
    await clearOfflineSyncQueue();
    vi.restoreAllMocks();
  });

  it("queues CUSTOMER_CREATE when the network is unavailable", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new NetworkError("Unable to reach the server"));

    const result = await createCustomerWithOfflineQueue(
      {
        name: "Offline Customer",
        phone: "08012345678",
      },
      auth,
      syncContext,
    );

    expect(result.queued).toBe(true);
    if (!result.queued) throw new Error("Expected operation to be queued");

    expect(result.operation.operationType).toBe("CUSTOMER_CREATE");
    expect(result.operation.businessId).toBe("business-1");
    expect(result.operation.branchId).toBe("branch-1");
    expect(result.operation.actorUserId).toBe("user-1");
    expect(result.operation.payload).toEqual({
      name: "Offline Customer",
      phone: "08012345678",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const queued = await listOfflineSyncOperations(
      "business-1",
      "branch-1",
    );

    expect(queued).toHaveLength(1);
    expect(queued[0].operationType).toBe("CUSTOMER_CREATE");
  });

  it("queues CUSTOMER_UPDATE when the network is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new NetworkError("Unable to reach the server"),
    );

    const result = await updateCustomerWithOfflineQueue(
      "customer-1",
      {
        name: "Updated Customer",
        phone: "08099999999",
      },
      auth,
      syncContext,
    );

    expect(result.queued).toBe(true);
    if (!result.queued) throw new Error("Expected operation to be queued");

    expect(result.operation.operationType).toBe("CUSTOMER_UPDATE");
    expect(result.operation.payload).toEqual({
      customerId: "customer-1",
      data: {
        name: "Updated Customer",
        phone: "08099999999",
      },
    });
  });

  it("does not queue a duplicate-confirmed create", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new NetworkError("Unable to reach the server"),
    );

    await expect(
      createCustomerWithOfflineQueue(
        {
          name: "Confirmed Customer",
          phone: "08011111111",
          confirmDuplicate: true,
        },
        auth,
        syncContext,
      ),
    ).rejects.toThrow(NetworkError);

    const queued = await listOfflineSyncOperations(
      "business-1",
      "branch-1",
    );

    expect(queued).toHaveLength(0);
  });

  it("does not queue a duplicate-confirmed update", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new NetworkError("Unable to reach the server"),
    );

    await expect(
      updateCustomerWithOfflineQueue(
        "customer-1",
        {
          phone: "08022222222",
          confirmDuplicate: true,
        },
        auth,
        syncContext,
      ),
    ).rejects.toThrow(NetworkError);

    const queued = await listOfflineSyncOperations(
      "business-1",
      "branch-1",
    );

    expect(queued).toHaveLength(0);
  });
});
