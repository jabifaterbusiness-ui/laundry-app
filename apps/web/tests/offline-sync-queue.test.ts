import { afterEach, describe, expect, it } from "vitest";
import {
  clearOfflineSyncQueue,
  enqueueOfflineSyncOperation,
  getOfflineSyncOperation,
  listOfflineSyncOperations,
  updateOfflineSyncOperation,
} from "../src/lib/offline-sync-queue.js";

const BUSINESS_ID = "business-1";
const BRANCH_ID = "branch-1";
const USER_ID = "user-1";

afterEach(async () => {
  await clearOfflineSyncQueue(BUSINESS_ID, BRANCH_ID);
});

describe("offline-sync-queue", () => {
  it("rejects missing tenant or actor context", async () => {
    await expect(
      enqueueOfflineSyncOperation({
        businessId: "",
        branchId: BRANCH_ID,
        actorUserId: USER_ID,
        clientOperationId: "invalid-context",
        operationType: "CUSTOMER_CREATE",
        payload: { name: "Invalid", phone: "08000000000" },
      }),
    ).rejects.toThrow("require business, branch, actor");
  });

  it("persists a supported operation in IndexedDB", async () => {
    const operation = await enqueueOfflineSyncOperation({
      businessId: BUSINESS_ID,
      branchId: BRANCH_ID,
      actorUserId: USER_ID,
      clientOperationId: "client-op-1",
      operationType: "CUSTOMER_CREATE",
      payload: {
        name: "Test Customer",
        phone: "08012345678",
      },
    });

    expect(operation.id).toBeTypeOf("number");
    expect(operation.status).toBe("PENDING");
    expect(operation.attemptCount).toBe(0);

    const stored = await getOfflineSyncOperation(
      BUSINESS_ID,
      "client-op-1",
    );

    expect(stored?.payload).toEqual({
      name: "Test Customer",
      phone: "08012345678",
    });
  });

  it("does not duplicate the same client operation", async () => {
    const first = await enqueueOfflineSyncOperation({
      businessId: BUSINESS_ID,
      branchId: BRANCH_ID,
      actorUserId: USER_ID,
      clientOperationId: "client-op-2",
      operationType: "ORDER_CREATE",
      payload: {
        customerId: "customer-1",
        items: [],
      },
    });

    const second = await enqueueOfflineSyncOperation({
      businessId: BUSINESS_ID,
      branchId: BRANCH_ID,
      actorUserId: USER_ID,
      clientOperationId: "client-op-2",
      operationType: "ORDER_CREATE",
      payload: {
        customerId: "customer-1",
        items: [],
      },
    });

    expect(second.id).toBe(first.id);

    const pending = await listOfflineSyncOperations(
      BUSINESS_ID,
      BRANCH_ID,
    );

    expect(pending).toHaveLength(1);
  });

  it("keeps different businesses isolated", async () => {
    await enqueueOfflineSyncOperation({
      businessId: BUSINESS_ID,
      branchId: BRANCH_ID,
      actorUserId: USER_ID,
      clientOperationId: "business-1-op",
      operationType: "CUSTOMER_CREATE",
      payload: { name: "Business One", phone: "08000000001" },
    });

    await enqueueOfflineSyncOperation({
      businessId: "business-2",
      branchId: BRANCH_ID,
      actorUserId: USER_ID,
      clientOperationId: "business-2-op",
      operationType: "CUSTOMER_CREATE",
      payload: { name: "Business Two", phone: "08000000002" },
    });

    const businessOne = await listOfflineSyncOperations(
      BUSINESS_ID,
      BRANCH_ID,
    );

    expect(businessOne).toHaveLength(1);
    expect(businessOne[0]?.clientOperationId).toBe("business-1-op");
  });

  it("keeps different branches isolated", async () => {
    await enqueueOfflineSyncOperation({
      businessId: BUSINESS_ID,
      branchId: BRANCH_ID,
      actorUserId: USER_ID,
      clientOperationId: "branch-1-op",
      operationType: "CUSTOMER_CREATE",
      payload: { name: "Branch One", phone: "08000000001" },
    });

    await enqueueOfflineSyncOperation({
      businessId: BUSINESS_ID,
      branchId: "branch-2",
      actorUserId: USER_ID,
      clientOperationId: "branch-2-op",
      operationType: "CUSTOMER_CREATE",
      payload: { name: "Branch Two", phone: "08000000002" },
    });

    const branchOne = await listOfflineSyncOperations(
      BUSINESS_ID,
      BRANCH_ID,
    );

    expect(branchOne).toHaveLength(1);
    expect(branchOne[0]?.clientOperationId).toBe("branch-1-op");
  });

  it("filters operations by each supported queue status", async () => {
    const statuses = [
      "PENDING",
      "PROCESSING",
      "APPLIED",
      "CONFLICT",
      "REJECTED",
      "FAILED",
    ] as const;

    for (const [index, status] of statuses.entries()) {
      const operation = await enqueueOfflineSyncOperation({
        businessId: BUSINESS_ID,
        branchId: BRANCH_ID,
        actorUserId: USER_ID,
        clientOperationId: `status-op-${index}`,
        operationType: "CUSTOMER_CREATE",
        payload: { name: `Status ${status}`, phone: `080000000${index}` },
      });

      await updateOfflineSyncOperation(operation.id!, {
        status,
      });
    }

    for (const status of statuses) {
      const operations = await listOfflineSyncOperations(
        BUSINESS_ID,
        BRANCH_ID,
        status,
      );

      expect(operations).toHaveLength(1);
      expect(operations[0]?.status).toBe(status);
    }
  });

  it("updates retry state without changing the queued payload", async () => {
    const operation = await enqueueOfflineSyncOperation({
      businessId: BUSINESS_ID,
      branchId: BRANCH_ID,
      actorUserId: USER_ID,
      clientOperationId: "retry-op",
      operationType: "CUSTOMER_UPDATE",
      payload: {
        customerId: "customer-1",
        data: { name: "Updated" },
      },
    });

    await updateOfflineSyncOperation(operation.id!, {
      status: "FAILED",
      attemptCount: 1,
      lastAttemptAt: Date.now(),
      lastError: "Network unavailable",
    });

    const updated = await getOfflineSyncOperation(
      BUSINESS_ID,
      "retry-op",
    );

    expect(updated?.status).toBe("FAILED");
    expect(updated?.attemptCount).toBe(1);
    expect(updated?.lastError).toBe("Network unavailable");
    expect(updated?.payload).toEqual({
      customerId: "customer-1",
      data: { name: "Updated" },
    });
  });
});
