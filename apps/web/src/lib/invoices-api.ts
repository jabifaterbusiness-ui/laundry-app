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
  totalAmount: number;
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
  totalAmount: number;
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
