import type { Customer, PaginatedResult } from "@laundry-app/shared";
import { apiFetch, ApiError, NetworkError } from "./api-client.js";
import { enqueueOfflineSyncOperation, type OfflineSyncQueueEntry } from "./offline-sync-queue.js";
import { useAuthStore } from "../state/auth-store.js";

export interface ListCustomersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "active" | "dormant" | "blocked" | "blacklisted" | "merged" | "inactive" | "all";
}

export interface CreateCustomerInput {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  whatsappOptIn?: boolean;
  whatsappOptInSource?: "CUSTOMER_VERBAL" | "CUSTOMER_WRITTEN" | "CUSTOMER_WEBSITE" | "CUSTOMER_OTHER";
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

export interface LegacyUnassignedCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  lifecycleStatus: Customer["lifecycleStatus"];
  createdAt: string;
  updatedAt: string;
  _count: { orders: number };
}

export async function listLegacyUnassignedCustomers(
  params: { page?: number; pageSize?: number; search?: string },
  auth: { accessToken: string | null },
): Promise<PaginatedResult<LegacyUnassignedCustomer>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.search) query.set("search", params.search);
  const suffix = query.size ? `?${query.toString()}` : "";
  return apiFetch<PaginatedResult<LegacyUnassignedCustomer>>(`/customers/legacy-unassigned${suffix}`, {
    accessToken: auth.accessToken,
  });
}

export async function assignLegacyCustomerOwnerBranch(
  customerId: string,
  branchId: string,
  auth: { accessToken: string | null; sensitiveAuthorization: string },
): Promise<Customer> {
  const branchIdForRequest = getEffectiveBranchId();
  return apiFetch<Customer>(`/customers/${customerId}/assign-owner-branch`, {
    method: "POST",
    accessToken: auth.accessToken,
    branchId: branchIdForRequest,
    sensitiveAuthorization: auth.sensitiveAuthorization,
    body: JSON.stringify({ branchId }),
  });
}

export async function assignLegacyCustomersOwnerBranch(
  input: { branchId: string; customerIds?: string[]; all?: boolean },
  auth: { accessToken: string | null; sensitiveAuthorization: string },
): Promise<{ assignedCount: number; branchId: string; branchName: string; assignmentScope: "ALL_UNASSIGNED" | "SELECTED" }> {
  const branchIdForRequest = getEffectiveBranchId();
  return apiFetch<{ assignedCount: number; branchId: string; branchName: string; assignmentScope: "ALL_UNASSIGNED" | "SELECTED" }>("/customers/legacy-unassigned/assign", {
    method: "POST",
    accessToken: auth.accessToken,
    branchId: branchIdForRequest,
    sensitiveAuthorization: auth.sensitiveAuthorization,
    body: JSON.stringify(input),
  });
}

export async function getCustomer(id: string, auth: { accessToken: string | null }): Promise<Customer> {
  return apiFetch<Customer>(`/customers/${id}`, { accessToken: auth.accessToken });
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

// Keep direct customer mutations aligned with apiFetch: explicit request context
// wins, otherwise use the currently selected branch from the auth store.
function getEffectiveBranchId(branchId?: string | null): string | null {
  return branchId ?? useAuthStore.getState().activeBranchId;
}

// Does the POST directly (rather than via apiFetch) because apiFetch's
// generic ApiError doesn't carry the response body, which would lose the
// `duplicates` list on a 409 - see docs/CUSTOMERS.md section E.
export async function createCustomer(
  input: CreateCustomerInput,
  auth: { accessToken: string | null; branchId?: string | null },
): Promise<Customer> {
  let res: Response;
  const branchId = getEffectiveBranchId(auth.branchId);

  try {
    res = await fetch(`${API_BASE_URL}/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
        ...(branchId ? { "X-Branch-Id": branchId } : {}),
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
  auth: { accessToken: string | null; branchId?: string | null },
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
        whatsappOptIn: input.whatsappOptIn,
        whatsappOptInSource: input.whatsappOptInSource,
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
  auth: {
    accessToken: string | null;
    branchId?: string | null;
    sensitiveAuthorization?: string | null;
  },
): Promise<Customer> {
  let res: Response;
  const branchId = getEffectiveBranchId(auth.branchId);

  try {
    res = await fetch(`${API_BASE_URL}/customers/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
        ...(branchId ? { "X-Branch-Id": branchId } : {}),
        ...(auth.sensitiveAuthorization
          ? { "X-Sensitive-Authorization": auth.sensitiveAuthorization }
          : {}),
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
  auth: {
    accessToken: string | null;
    branchId?: string | null;
    sensitiveAuthorization?: string | null;
  },
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

export async function setCustomerLifecycleStatus(
  id: string,
  status: Customer["lifecycleStatus"],
  reason: string,
  auth: { accessToken: string | null },
): Promise<Customer> {
  return apiFetch<Customer>(`/customers/${id}/status`, {
    method: "POST",
    accessToken: auth.accessToken,
    body: JSON.stringify({ status, reason }),
  });
}
