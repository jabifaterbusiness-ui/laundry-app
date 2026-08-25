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
}

export interface CreateOrderInput {
  customerId: string;
  items: CreateOrderItemInput[];
  expectedReadyAt?: string;
  garmentNote?: string;
  internalNote?: string;
}

export interface ListOrdersParams {
  page?: number;
  pageSize?: number;
  status?: OrderStatus;
  customerId?: string;
}
