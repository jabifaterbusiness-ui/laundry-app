import type {
  CreateOrderInput,
  Order,
  OrderStatus,
  PaginatedResult,
} from "@laundry-app/shared";
import { apiFetch } from "./api-client.js";

export interface ListOrdersParams {
  page?: number;
  pageSize?: number;
  status?: OrderStatus;
  customerId?: string;
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
