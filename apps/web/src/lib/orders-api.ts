import type {
  CreateOrderInput,
  Order,
  OrderStatus,
  PaginatedResult,
} from "@laundry-app/shared";
import { apiFetch, NetworkError } from "./api-client.js";
import {
  enqueueOfflineSyncOperation,
  type OfflineSyncQueueEntry,
} from "./offline-sync-queue.js";

export interface ListOrdersParams {
  page?: number;
  pageSize?: number;
  status?: OrderStatus;
  customerId?: string;
}

export interface OfflineOrderSyncContext {
  businessId: string;
  branchId: string;
  actorUserId: string;
}

export type OrderMutationResult =
  | {
      queued: false;
      order: Order;
    }
  | {
      queued: true;
      operation: OfflineSyncQueueEntry;
    };

function canQueueOrderMutation(
  context: OfflineOrderSyncContext,
): boolean {
  return Boolean(
    context.businessId &&
      context.branchId &&
      context.actorUserId,
  );
}

function buildQuery(params: ListOrdersParams): string {
  const query = new URLSearchParams();

  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.status) query.set("status", params.status);
  if (params.customerId) query.set("customerId", params.customerId);

  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function listOrders(
  params: ListOrdersParams,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<PaginatedResult<Order>> {
  return apiFetch<PaginatedResult<Order>>(`/orders${buildQuery(params)}`, {
    accessToken: auth.accessToken,
    branchId,
  });
}

export async function getOrder(
  id: string,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<Order> {
  return apiFetch<Order>(`/orders/${id}`, {
    accessToken: auth.accessToken,
    branchId,
  });
}

export async function createOrder(
  input: CreateOrderInput,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<Order> {
  return apiFetch<Order>("/orders", {
    method: "POST",
    accessToken: auth.accessToken,
    branchId,
    body: JSON.stringify(input),
  });
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<Order> {
  return apiFetch<Order>(`/orders/${id}/status`, {
    method: "PATCH",
    accessToken: auth.accessToken,
    branchId,
    body: JSON.stringify({ status }),
  });
}

export async function createOrderWithOfflineQueue(
  input: CreateOrderInput,
  auth: { accessToken: string | null },
  syncContext: OfflineOrderSyncContext,
): Promise<OrderMutationResult> {
  try {
    const order = await createOrder(
      input,
      auth,
      syncContext.branchId,
    );

    return {
      queued: false,
      order,
    };
  } catch (error) {
    if (!(error instanceof NetworkError)) {
      throw error;
    }

    if (!canQueueOrderMutation(syncContext)) {
      throw new NetworkError(
        "The server is unavailable and offline order storage is not ready for the current account or branch.",
      );
    }

    const operation = await enqueueOfflineSyncOperation({
      businessId: syncContext.businessId,
      branchId: syncContext.branchId,
      actorUserId: syncContext.actorUserId,
      clientOperationId: crypto.randomUUID(),
      operationType: "ORDER_CREATE",
      payload: input,
    });

    return {
      queued: true,
      operation,
    };
  }
}

export async function updateOrderStatusWithOfflineQueue(
  id: string,
  status: OrderStatus,
  auth: { accessToken: string | null },
  syncContext: OfflineOrderSyncContext,
): Promise<OrderMutationResult> {
  try {
    const order = await updateOrderStatus(
      id,
      status,
      auth,
      syncContext.branchId,
    );

    return {
      queued: false,
      order,
    };
  } catch (error) {
    if (!(error instanceof NetworkError)) {
      throw error;
    }

    if (!canQueueOrderMutation(syncContext)) {
      throw new NetworkError(
        "The server is unavailable and offline order storage is not ready for the current account or branch.",
      );
    }

    const operation = await enqueueOfflineSyncOperation({
      businessId: syncContext.businessId,
      branchId: syncContext.branchId,
      actorUserId: syncContext.actorUserId,
      clientOperationId: crypto.randomUUID(),
      operationType: "ORDER_UPDATE",
      payload: {
        orderId: id,
        operation: "UPDATE_STATUS",
        status,
      },
    });

    return {
      queued: true,
      operation,
    };
  }
}
