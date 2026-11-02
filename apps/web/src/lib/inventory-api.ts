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
  | "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "RETURN" | "WASTE" | "EXPIRED"
  | "TRANSFER_IN" | "TRANSFER_OUT" | "STOCKTAKE";

export interface InventoryItem {
  id: string;
  businessId: string;
  name: string;
  sku: string | null;
  category: string | null;
  storageLocation: string | null;
  description: string | null;
  unit: InventoryUnit;
  reorderQuantity: number;
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
  reservedQuantity: number;
  averageUnitCost: number;
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
  sku?: string;
  category?: string;
  storageLocation?: string;
  description?: string;
  unit: InventoryUnit;
  reorderQuantity?: number;
  lowStockThreshold?: number;
}

export interface UpdateInventoryItemInput {
  name?: string;
  sku?: string;
  category?: string;
  storageLocation?: string;
  description?: string;
  unit?: InventoryUnit;
  reorderQuantity?: number;
  lowStockThreshold?: number;
  isActive?: boolean;
}

export interface CreateInventoryMovementInput {
  inventoryItemId: string;
  quantity: number;
  type: "RECEIPT" | "ISSUE" | "RETURN" | "WASTE" | "EXPIRED";
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

export async function listInventoryMovements(
  params: ListInventoryMovementsParams = {},
  auth: AuthOptions,
  branchId: string | null,
): Promise<{ movements: InventoryMovement[]; pagination: Pagination }> {
  return apiFetch(`/inventory/movements${buildQuery({
    inventoryItemId: params.inventoryItemId,
    type: params.type,
    page: params.page,
    pageSize: params.pageSize,
  })}`, {
    accessToken: auth.accessToken,
    branchId,
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

export interface InventorySupplier {
  id: string; businessId: string; name: string; contactName: string | null;
  email: string | null; phone: string | null; address: string | null;
  taxId: string | null; notes: string | null; isActive: boolean;
  createdAt: string; updatedAt: string;
}
export interface InventoryPurchaseOrderLine {
  id: string; purchaseOrderId: string; inventoryItemId: string;
  quantityOrdered: number; quantityReceived: number; unitCost: number;
  inventoryItem: InventoryItem;
}
export interface InventoryPurchaseOrder {
  id: string; businessId: string; branchId: string; supplierId: string;
  orderNumber: string; status: "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  orderedAt: string | null; expectedAt: string | null; notes: string | null;
  supplier: InventorySupplier; lines: InventoryPurchaseOrderLine[];
}
export interface CreateInventorySupplierInput {
  name: string; contactName?: string; email?: string; phone?: string; address?: string; taxId?: string; notes?: string;
}
export interface CreateInventoryPurchaseOrderInput {
  supplierId: string; orderNumber: string; expectedAt?: string; notes?: string;
  lines: Array<{ inventoryItemId: string; quantityOrdered: number; unitCost: number }>;
}
export interface ReceiveInventoryPurchaseOrderInput {
  receiptNumber: string; notes?: string;
  lines: Array<{ purchaseOrderLineId: string; quantity: number; unitCost?: number }>;
}
export async function listInventorySuppliers(params: { search?: string; page?: number; pageSize?: number } = {}, auth: AuthOptions) {
  return apiFetch<{ suppliers: InventorySupplier[]; pagination: Pagination }>(`/inventory/suppliers${buildQuery(params)}`, { accessToken: auth.accessToken });
}
export async function createInventorySupplier(input: CreateInventorySupplierInput, auth: AuthOptions) {
  return apiFetch<{ data: InventorySupplier }>("/inventory/suppliers", { method: "POST", accessToken: auth.accessToken, body: JSON.stringify(input) });
}
export async function listInventoryPurchaseOrders(params: { status?: InventoryPurchaseOrder["status"]; page?: number; pageSize?: number } = {}, auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ purchaseOrders: InventoryPurchaseOrder[]; pagination: Pagination }>(`/inventory/purchase-orders${buildQuery(params)}`, { accessToken: auth.accessToken, branchId });
}
export async function createInventoryPurchaseOrder(input: CreateInventoryPurchaseOrderInput, auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ data: InventoryPurchaseOrder }>("/inventory/purchase-orders", { method: "POST", accessToken: auth.accessToken, branchId, body: JSON.stringify(input) });
}
export async function receiveInventoryPurchaseOrder(id: string, input: ReceiveInventoryPurchaseOrderInput, auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ data: unknown }>(`/inventory/purchase-orders/${id}/receive`, { method: "POST", accessToken: auth.accessToken, branchId, body: JSON.stringify(input) });
}

export interface InventoryTransfer {
  id: string; transferNumber: string; status: "DISPATCHED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  sourceBranchId: string; destinationBranchId: string; sourceBranch: { id: string; name: string };
  destinationBranch: { id: string; name: string };
  lines: Array<{ id: string; inventoryItemId: string; quantityDispatched: number; quantityReceived: number; unitCost: number; inventoryItem: InventoryItem }>;
}
export interface InventoryStocktake {
  id: string; reference: string; status: "DRAFT" | "SUBMITTED" | "APPROVED" | "APPLIED" | "CANCELLED";
  submittedById?: string | null; submittedAt?: string | null; approvedById?: string | null; approvedAt?: string | null;
  lines: Array<{ id: string; inventoryItemId: string; expectedQuantity: number; countedQuantity: number; variance: number; inventoryItem: InventoryItem }>;
}
export interface InventoryReservation { id: string; inventoryItemId: string; quantity: number; status: string; reference: string | null; }
export interface InventoryReorderRecommendation {
  inventoryItem: InventoryItem; quantity: number; reservedQuantity: number; availableQuantity: number;
  suggestedOrderQuantity: number; averageUnitCost: number; stockValue: number;
}
export async function createInventoryTransfer(input: { destinationBranchId: string; transferNumber: string; notes?: string; lines: Array<{ inventoryItemId: string; quantity: number }> }, auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ data: InventoryTransfer }>("/inventory/transfers", { method: "POST", accessToken: auth.accessToken, branchId, body: JSON.stringify(input) });
}
export async function listInventoryTransfers(auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ transfers: InventoryTransfer[]; pagination: Pagination }>("/inventory/transfers", { accessToken: auth.accessToken, branchId });
}
export async function receiveInventoryTransfer(id: string, lines: Array<{ transferLineId: string; quantity: number }>, auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ data: InventoryTransfer }>(`/inventory/transfers/${id}/receive`, { method: "POST", accessToken: auth.accessToken, branchId, body: JSON.stringify({ lines }) });
}
export async function createInventoryStocktake(input: { reference: string; notes?: string; lines: Array<{ inventoryItemId: string; countedQuantity: number }> }, auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ data: InventoryStocktake }>("/inventory/stocktakes", { method: "POST", accessToken: auth.accessToken, branchId, body: JSON.stringify(input) });
}
export async function listInventoryStocktakes(auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ stocktakes: InventoryStocktake[] }>("/inventory/stocktakes", { accessToken: auth.accessToken, branchId });
}
export async function submitInventoryStocktake(id: string, auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ data: InventoryStocktake }>(`/inventory/stocktakes/${id}/submit`, { method: "POST", accessToken: auth.accessToken, branchId, body: JSON.stringify({}) });
}
export async function approveInventoryStocktake(id: string, auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ data: InventoryStocktake }>(`/inventory/stocktakes/${id}/approve`, { method: "POST", accessToken: auth.accessToken, branchId, body: JSON.stringify({}) });
}
export async function applyInventoryStocktake(id: string, auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ data: InventoryStocktake }>(`/inventory/stocktakes/${id}/apply`, { method: "POST", accessToken: auth.accessToken, branchId, body: JSON.stringify({}) });
}
export async function createInventoryReservation(input: { inventoryItemId: string; quantity: number; reference?: string }, auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ data: InventoryReservation }>("/inventory/reservations", { method: "POST", accessToken: auth.accessToken, branchId, body: JSON.stringify(input) });
}
export async function releaseInventoryReservation(id: string, consumed: boolean, auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ data: InventoryReservation }>(`/inventory/reservations/${id}/release`, { method: "POST", accessToken: auth.accessToken, branchId, body: JSON.stringify({ consumed }) });
}
export async function listInventoryReorderRecommendations(auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ data: InventoryReorderRecommendation[] }>("/inventory/reorder-recommendations", { accessToken: auth.accessToken, branchId });
}

export interface InventoryReport {
  periodDays: number; totalValuation: number; movementCount: number;
  consumptionQuantity: number; adjustmentQuantity: number;
  valuation: Array<{ inventoryItem: InventoryItem; quantity: number; reservedQuantity: number; availableQuantity: number; averageUnitCost: number; totalValue: number }>;
  movementTotals: Record<string, number>;
  supplierPerformance: Array<{ supplierId: string; supplierName: string; orderCount: number; orderedValue: number; receivedOrderCount: number }>;
}
export async function getInventoryReports(auth: AuthOptions, branchId: string | null) {
  return apiFetch<{ data: InventoryReport }>("/inventory/reports", { accessToken: auth.accessToken, branchId });
}
