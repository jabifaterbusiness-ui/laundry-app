export const ORDER_STATUSES = [
  "RECEIVED",
  "IN_PROGRESS",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItem {
  id: string;
  serviceId: string;
  colors: string[];
  serviceName: string;
  piecesPerUnit: number;
  quantity: number;
  totalPieces: number;
  unitPrice: number;
  lineTotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  businessId: string;
  branchId: string;
  customerId: string;
  // The API includes the related customer on order list/detail responses.
  // Optional to keep queued/offline order snapshots backward compatible.
  customer?: { id: string; name: string; phone: string; email?: string | null };
  notificationResults?: Array<{ status: "SENT" | "FAILED" | "DUPLICATE"; channel: "WHATSAPP" | "EMAIL"; error?: string }>;
  orderNumber: string;
  status: OrderStatus;
  orderTotal: number;
  expectedReadyAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  garmentNote: string | null;
  internalNote: string | null;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderItemInput {
  serviceId: string;
  quantity: number;
  colors: string[];
}

export interface CreateOrderInput {
  customerId: string;
  items: CreateOrderItemInput[];
  expectedReadyAt?: string;
  garmentNote?: string;
  internalNote?: string;
  adjustments?: Array<{
    adjustmentId: string;
    scope: "INVOICE" | "ITEMS";
    itemIndexes?: number[];
  }>;
  taxRuleIds?: string[];
}

export interface ListOrdersParams {
  page?: number;
  pageSize?: number;
  status?: OrderStatus;
  customerId?: string;
}
