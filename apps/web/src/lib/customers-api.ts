import type { Customer, PaginatedResult } from "@laundry-app/shared";
import { apiFetch, ApiError, NetworkError } from "./api-client.js";
import { enqueueOfflineSyncOperation, type OfflineSyncQueueEntry } from "./offline-sync-queue.js";

export interface ListCustomersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "active" | "inactive" | "all";
}

export interface CreateCustomerInput {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  confirmDuplicate?: boolean;
}

export type UpdateCustomerInput = Partial<Omit<CreateCustomerInput, "confirmDuplicate">> & {
  confirmDuplicate?: boolean;
};

// Thrown specifically for the 409 "possible duplicate" response so the UI
// can distinguish it from an ordinary validation/API error and offer the
// confirmDuplicate resubmit flow (see docs/CUSTOMERS.md section E).
export class DuplicateCustomerError extends ApiError {
  constructor(
    message: string,
    public duplicates: Pick<Customer, "id" | "name" | "phone">[],
  ) {
    super(message, 409);
  }
}

export interface OfflineCustomerSyncContext {
  businessId: string | null;
  branchId: string | null;
  actorUserId: string | null;
}

export interface OfflineQueuedResult {
  queued: true;
  operation: OfflineSyncQueueEntry;
}

export interface OnlineCustomerResult {
  queued: false;
  customer: Customer;
}

export type CustomerMutationResult =
  | OnlineCustomerResult
  | OfflineQueuedResult;

function canQueueCustomerMutation(
  context: OfflineCustomerSyncContext,
): context is {
  businessId: string;
  branchId: string;
  actorUserId: string;
} {
  return Boolean(
    context.businessId &&
      context.branchId &&
      context.actorUserId,
  );
}

function buildQuery(params: ListCustomersParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.search) search.set("search", params.search);
  if (params.status) search.set("status", params.status);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function listCustomers(
  params: ListCustomersParams,
  auth: { accessToken: string | null },
): Promise<PaginatedResult<Customer>> {
  return apiFetch<PaginatedResult<Customer>>(`/customers${buildQuery(params)}`, {
    accessToken: auth.accessToken,
  });
}

export async function getCustomer(id: string, auth: { accessToken: string | null }): Promise<Customer> {
  return apiFetch<Customer>(`/customers/${id}`, { accessToken: auth.accessToken });
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1";

// Does the POST directly (rather than via apiFetch) because apiFetch's
// generic ApiError doesn't carry the response body, which would lose the
// `duplicates` list on a 409 - see docs/CUSTOMERS.md section E.
export async function createCustomer(
  input: CreateCustomerInput,
  auth: { accessToken: string | null },
): Promise<Customer> {
  let res: Response;

  try {
    res = await fetch(`${API_BASE_URL}/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      },
      body: JSON.stringify(input),
    });
  } catch (error) {
    throw new NetworkError(
      error instanceof Error && error.message
        ? error.message
        : "Unable to reach the server",
    );
  }

  const body = await res.json().catch(() => ({}));

  if (res.status === 409) {
    throw new DuplicateCustomerError(
      body?.error?.message ?? "Possible duplicate customer",
      body?.error?.duplicates ?? [],
    );
  }

  if (!res.ok) {
    throw new ApiError(
      body?.error?.message ?? `Request failed with status ${res.status}`,
      res.status,
    );
  }

  return body as Customer;
}

export async function createCustomerWithOfflineQueue(
  input: CreateCustomerInput,
  auth: { accessToken: string | null },
  syncContext: OfflineCustomerSyncContext,
): Promise<CustomerMutationResult> {
  if (input.confirmDuplicate) {
    return {
      queued: false,
      customer: await createCustomer(input, auth),
    };
  }

  try {
    const customer = await createCustomer(input, auth);

    return {
      queued: false,
      customer,
    };
  } catch (error) {
    if (!(error instanceof NetworkError)) {
      throw error;
    }

    if (!canQueueCustomerMutation(syncContext)) {
      throw new NetworkError(
        "The server is unavailable and offline customer storage is not ready for the current account or branch.",
      );
    }

    const operation = await enqueueOfflineSyncOperation({
      businessId: syncContext.businessId,
      branchId: syncContext.branchId,
      actorUserId: syncContext.actorUserId,
      clientOperationId: crypto.randomUUID(),
      operationType: "CUSTOMER_CREATE",
      payload: {
        name: input.name,
        phone: input.phone,
        email: input.email,
        address: input.address,
        notes: input.notes,
      },
    });

    return {
      queued: true,
      operation,
    };
  }
}

// Does the PATCH directly (rather than via apiFetch), same reason as
// createCustomer above: a 409 here means "possible duplicate phone" and
// the response body's `duplicates` list would otherwise be lost.
export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
  auth: { accessToken: string | null },
): Promise<Customer> {
  let res: Response;

  try {
    res = await fetch(`${API_BASE_URL}/customers/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      },
      body: JSON.stringify(input),
    });
  } catch (error) {
    throw new NetworkError(
      error instanceof Error && error.message
        ? error.message
        : "Unable to reach the server",
    );
  }

  const body = await res.json().catch(() => ({}));

  if (res.status === 409) {
    throw new DuplicateCustomerError(
      body?.error?.message ?? "Possible duplicate customer",
      body?.error?.duplicates ?? [],
    );
  }

  if (!res.ok) {
    throw new ApiError(
      body?.error?.message ?? `Request failed with status ${res.status}`,
      res.status,
    );
  }

  return body as Customer;
}

export async function updateCustomerWithOfflineQueue(
  id: string,
  input: UpdateCustomerInput,
  auth: { accessToken: string | null },
  syncContext: OfflineCustomerSyncContext,
): Promise<CustomerMutationResult> {
  if (input.confirmDuplicate) {
    return {
      queued: false,
      customer: await updateCustomer(id, input, auth),
    };
  }

  try {
    const customer = await updateCustomer(id, input, auth);

    return {
      queued: false,
      customer,
    };
  } catch (error) {
    if (!(error instanceof NetworkError)) {
      throw error;
    }

    if (!canQueueCustomerMutation(syncContext)) {
      throw new NetworkError(
        "The server is unavailable and offline customer storage is not ready for the current account or branch.",
      );
    }

    const data = { ...input };
    delete data.confirmDuplicate;

    const operation = await enqueueOfflineSyncOperation({
      businessId: syncContext.businessId,
      branchId: syncContext.branchId,
      actorUserId: syncContext.actorUserId,
      clientOperationId: crypto.randomUUID(),
      operationType: "CUSTOMER_UPDATE",
      payload: {
        customerId: id,
        data,
      },
    });

    return {
      queued: true,
      operation,
    };
  }
}

export async function setCustomerActive(
  id: string,
  isActive: boolean,
  auth: { accessToken: string | null },
): Promise<Customer> {
  return apiFetch<Customer>(`/customers/${id}/${isActive ? "activate" : "deactivate"}`, {
    method: "POST",
    accessToken: auth.accessToken,
  });
}
