import { apiFetch } from "./api-client.js";

export type InventoryUnit =
  | "PIECE"
  | "PACK"
  | "BOTTLE"
  | "LITRE"
  | "KILOGRAM"
  | "BOX"
  | "ROLL"
  | "OTHER";

export type InventoryMovementType =
  | "RECEIPT"
  | "ISSUE"
  | "ADJUSTMENT";

export interface InventoryItem {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  unit: InventoryUnit;
  lowStockThreshold: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryStock {
  id: string;
  businessId: string;
  branchId: string;
  inventoryItemId: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  inventoryItem: InventoryItem;
}

export interface InventoryMovement {
  id: string;
  businessId: string;
  branchId: string;
  inventoryItemId: string;
  quantity: number;
  type: InventoryMovementType;
  resultingQuantity: number;
  reason: string | null;
  reference: string | null;
  createdById: string;
  createdAt: string;
  inventoryItem?: InventoryItem;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListInventoryItemsParams {
  isActive?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ListInventoryStockParams {
  inventoryItemId?: string;
  lowStockOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListInventoryMovementsParams {
  inventoryItemId?: string;
  type?: InventoryMovementType;
  page?: number;
  pageSize?: number;
}

export interface CreateInventoryItemInput {
  name: string;
  description?: string;
  unit: InventoryUnit;
  lowStockThreshold?: number;
}

export interface UpdateInventoryItemInput {
  name?: string;
  description?: string;
  unit?: InventoryUnit;
  lowStockThreshold?: number;
  isActive?: boolean;
}

export interface CreateInventoryMovementInput {
  inventoryItemId: string;
  quantity: number;
  type: "RECEIPT" | "ISSUE";
  reason?: string;
  reference?: string;
}

export interface AdjustInventoryStockInput {
  inventoryItemId: string;
  quantity: number;
  reason: string;
  reference?: string;
}

interface AuthOptions {
  accessToken: string | null;
}

function buildQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function listInventoryItems(
  params: ListInventoryItemsParams = {},
  auth: AuthOptions,
): Promise<{
  items: InventoryItem[];
  pagination: Pagination;
}> {
  return apiFetch(
    `/inventory${buildQuery({
      isActive: params.isActive,
      search: params.search,
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    {
      accessToken: auth.accessToken,
    },
  );
}

export async function createInventoryItem(
  input: CreateInventoryItemInput,
  auth: AuthOptions,
): Promise<InventoryItem> {
  return apiFetch<InventoryItem>("/inventory", {
    method: "POST",
    accessToken: auth.accessToken,
    body: JSON.stringify(input),
  });
}

export async function updateInventoryItem(
  id: string,
  input: UpdateInventoryItemInput,
  auth: AuthOptions,
): Promise<InventoryItem> {
  return apiFetch<InventoryItem>(`/inventory/${id}`, {
    method: "PATCH",
    accessToken: auth.accessToken,
    body: JSON.stringify(input),
  });
}

export async function listInventoryStock(
  params: ListInventoryStockParams = {},
  auth: AuthOptions,
  branchId: string | null,
): Promise<{
  stocks: InventoryStock[];
  pagination: Pagination;
}> {
  return apiFetch(
    `/inventory/stock${buildQuery({
      inventoryItemId: params.inventoryItemId,
      lowStockOnly: params.lowStockOnly,
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    {
      accessToken: auth.accessToken,
      branchId,
    },
  );
}

export async function createInventoryMovement(
  input: CreateInventoryMovementInput,
  auth: AuthOptions,
  branchId: string | null,
): Promise<{
  movement: InventoryMovement;
  stock: InventoryStock;
  inventoryItem: InventoryItem;
}> {
  return apiFetch("/inventory/movements", {
    method: "POST",
    accessToken: auth.accessToken,
    branchId,
    body: JSON.stringify(input),
  });
}

export async function adjustInventoryStock(
  input: AdjustInventoryStockInput,
  auth: AuthOptions,
  branchId: string | null,
): Promise<{
  movement: InventoryMovement;
  stock: InventoryStock;
  inventoryItem: InventoryItem;
}> {
  return apiFetch("/inventory/stock/adjust", {
    method: "POST",
    accessToken: auth.accessToken,
    branchId,
    body: JSON.stringify(input),
  });
}
