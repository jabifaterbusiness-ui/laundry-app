import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceStatus,
  ListInvoicesParams,
  PaginatedResult,
} from "@laundry-app/shared";
import { apiFetch } from "./api-client.js";

function buildQuery(params: ListInvoicesParams): string {
  const query = new URLSearchParams();

  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.status) query.set("status", params.status);
  if (params.customerId) query.set("customerId", params.customerId);
  if (params.search?.trim()) query.set("search", params.search.trim());

  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function createInvoice(
  input: CreateInvoiceInput,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<Invoice> {
  return apiFetch<Invoice>("/invoices", {
    method: "POST",
    accessToken: auth.accessToken,
    branchId,
    body: JSON.stringify(input),
  });
}

export async function listInvoices(
  params: ListInvoicesParams,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<PaginatedResult<Invoice>> {
  return apiFetch<PaginatedResult<Invoice>>(
    `/invoices${buildQuery(params)}`,
    {
      accessToken: auth.accessToken,
      branchId,
    },
  );
}

export async function getInvoice(
  id: string,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<Invoice> {
  return apiFetch<Invoice>(`/invoices/${id}`, {
    accessToken: auth.accessToken,
    branchId,
  });
}

export async function getInvoiceByOrder(
  orderId: string,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<Invoice> {
  return apiFetch<Invoice>(`/invoices/order/${orderId}`, {
    accessToken: auth.accessToken,
    branchId,
  });
}

export type ReceiptItem = {
  id: string;
  quantity: number;
  itemName: string;
  colors: string[];
  totalPieces: number;
  unitPrice: number;
  totalPrice: number;
};

export type CustomerReceipt = {
  receiptType: "CUSTOMER";
  invoiceNumber: string;
  orderNumber: string;
  companyName: string;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  customerName: string;
  branchName: string;
  createdAt: string;
  items: ReceiptItem[];
  subtotal: number;
  adjustedSubtotal: number;
  adjustmentTotal: number;
  additiveTaxTotal: number;
  withholdingTaxTotal: number;
  appliedAdjustments: Array<{ id: string; name: string; percentage: number; amount: number; scope: "INVOICE" | "ITEMS"; itemIds?: string[]; itemIndexes?: number[] }>;
  appliedTaxes: Array<{ id: string; name: string; kind: "PERCENTAGE" | "FIXED"; value: number; treatment: "ADDITIVE" | "WITHHOLDING"; amount: number }>;
  totalAmount: number;
  totalPaid: number;
  balanceDue: number;
  payments: Array<{
    id: string;
    amount: number;
    method: "CASH" | "TRANSFER" | "POS" | "PAY_FROM_ACCOUNT";
    type: "PAYMENT" | "REFUND";
    reference: string | null;
    createdAt: string;
  }>;
  garmentNote: string | null;
  customerAgreement: string;
};

export type CompanyReceipt = {
  receiptType: "COMPANY";
  invoiceNumber: string;
  orderNumber: string;
  companyName: string;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  customerName: string;
  branchName: string;
  createdAt: string;
  items: ReceiptItem[];
  subtotal: number;
  adjustedSubtotal: number;
  adjustmentTotal: number;
  additiveTaxTotal: number;
  withholdingTaxTotal: number;
  appliedAdjustments: Array<{ id: string; name: string; percentage: number; amount: number; scope: "INVOICE" | "ITEMS"; itemIds?: string[]; itemIndexes?: number[] }>;
  appliedTaxes: Array<{ id: string; name: string; kind: "PERCENTAGE" | "FIXED"; value: number; treatment: "ADDITIVE" | "WITHHOLDING"; amount: number }>;
  totalAmount: number;
  totalPaid: number;
  balanceDue: number;
  payments: Array<{
    id: string;
    amount: number;
    method: "CASH" | "TRANSFER" | "POS" | "PAY_FROM_ACCOUNT";
    type: "PAYMENT" | "REFUND";
    reference: string | null;
    createdAt: string;
  }>;
  garmentNote: string | null;
  internalNote: string | null;
};

export async function getCustomerReceipt(
  id: string,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<CustomerReceipt> {
  return apiFetch<CustomerReceipt>(
    `/invoices/${id}/receipt/customer`,
    {
      accessToken: auth.accessToken,
      branchId,
    },
  );
}

export async function getCompanyReceipt(
  id: string,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<CompanyReceipt> {
  return apiFetch<CompanyReceipt>(
    `/invoices/${id}/receipt/company`,
    {
      accessToken: auth.accessToken,
      branchId,
    },
  );
}

export type { InvoiceStatus };

export type InvoiceCorrectionItemInput = {
  itemName: string;
  colors: string[];
  piecesPerUnit: number;
  quantity: number;
  unitPrice: number;
};

export type UpdateInvoiceCorrectionInput = {
  reason: string;
  confirmed: true;
  garmentNote?: string | null;
  internalNote?: string | null;
  customerAgreement?: string;
  items?: InvoiceCorrectionItemInput[];
};

export type InvoiceHistoryEntry = {
  id: string;
  invoiceId: string;
  businessId: string;
  branchId: string;
  action: string;
  version: number;
  reason: string;
  actorUserId: string;
  actorName?: string | null;
  snapshot: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
};

export async function updateInvoiceFinancialRules(
  id: string,
  input: {
    reason: string;
    confirmed: true;
    adjustments: Array<{ adjustmentId: string; scope: "INVOICE" | "ITEMS"; itemIndexes?: number[] }>;
    taxRuleIds: string[];
  },
  auth: { accessToken: string | null; sensitiveAuthorization?: string | null },
  branchId?: string | null,
): Promise<Invoice> {
  return apiFetch<Invoice>(`/invoices/${id}/financial-rules`, {
    method: "PATCH",
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
    branchId,
    body: JSON.stringify(input),
  });
}

export async function updateInvoice(
  id: string,
  input: UpdateInvoiceCorrectionInput,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<Invoice> {
  return apiFetch<Invoice>(`/invoices/${id}`, {
    method: "PATCH",
    accessToken: auth.accessToken,
    branchId,
    body: JSON.stringify(input),
  });
}

export async function voidInvoice(
  id: string,
  input: {
    reason: string;
    confirmed: true;
  },
  auth: {
    accessToken: string | null;
    sensitiveAuthorization?: string | null;
  },
  branchId?: string | null,
): Promise<Invoice> {
  return apiFetch<Invoice>(`/invoices/${id}/void`, {
    method: "POST",
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
    branchId,
    body: JSON.stringify(input),
  });
}

export async function deleteInvoice(
  id: string,
  input: {
    reason: string;
    confirmed: true;
  },
  auth: {
    accessToken: string | null;
    sensitiveAuthorization?: string | null;
  },
  branchId?: string | null,
): Promise<Invoice> {
  return apiFetch<Invoice>(`/invoices/${id}`, {
    method: "DELETE",
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
    branchId,
    body: JSON.stringify(input),
  });
}

export async function transferInvoice(
  id: string,
  input: {
    customerId: string;
    reason: string;
    confirmed: true;
  },
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<Invoice> {
  return apiFetch<Invoice>(`/invoices/${id}/transfer`, {
    method: "POST",
    accessToken: auth.accessToken,
    branchId,
    body: JSON.stringify(input),
  });
}

export async function getInvoiceHistory(
  id: string,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<InvoiceHistoryEntry[]> {
  return apiFetch<InvoiceHistoryEntry[]>(
    `/invoices/${id}/history`,
    {
      accessToken: auth.accessToken,
      branchId,
    },
  );
}
