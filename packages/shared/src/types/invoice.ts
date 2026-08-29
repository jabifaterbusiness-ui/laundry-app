export const INVOICE_STATUSES = ["ISSUED", "VOID"] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  itemName: string;
  piecesPerUnit: number;
  quantity: number;
  totalPieces: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: string;
}

export interface InvoiceOrderCustomer {
  id: string;
  name: string;
}

export interface InvoiceOrderBranch {
  id: string;
  name: string;
}

export interface InvoiceOrder {
  id: string;
  orderNumber: string;
  customer: InvoiceOrderCustomer;
  branch: InvoiceOrderBranch;
}

export interface Invoice {
  id: string;
  businessId: string;
  branchId: string;
  orderId: string;
  invoiceNumber: string;
  status: InvoiceStatus;

  customerName: string;

  companyName: string;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;

  totalAmount: number;

  garmentNote: string | null;
  internalNote: string | null;
  customerAgreement: string;

  items: InvoiceItem[];

  order: InvoiceOrder;

  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceInput {
  orderId: string;
  customerAgreement: string;
}

export interface ListInvoicesParams {
  page?: number;
  pageSize?: number;
  status?: InvoiceStatus;
  customerId?: string;
}
