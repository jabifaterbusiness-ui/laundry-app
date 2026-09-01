import { apiFetch } from "./api-client.js";

export type PaymentMethod = "CASH" | "TRANSFER" | "POS";
export type PaymentStatus = "POSTED" | "VOID";

export interface PaymentInvoiceSummary {
  id: string;
  invoiceNumber: string;
  orderId: string;
  totalAmount: number;
  status: string;
  customerName: string;
}

export interface Payment {
  id: string;
  businessId: string;
  branchId: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  note?: string | null;
  status: PaymentStatus;
  createdAt: string;
  invoice?: PaymentInvoiceSummary;
}

export interface PaymentsListResponse {
  data: Payment[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface InvoicePaymentSummary {
  invoiceId: string;
  invoiceNumber: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  paymentStatus: "PAID" | "PARTIALLY_PAID" | "UNPAID";
  payments: Payment[];
}

export interface CreatePaymentInput {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
}

export interface ListPaymentsParams {
  page?: number;
  pageSize?: number;
  invoiceId?: string;
  status?: PaymentStatus;
}

interface AuthOptions {
  accessToken: string | null;
}

function branchHeaders(branchId: string | null): Record<string, string> {
  return branchId
    ? {
        "X-Branch-Id": branchId,
      }
    : {};
}

export async function createPayment(
  input: CreatePaymentInput,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<Payment>("/payments", {
    method: "POST",
    headers: branchHeaders(branchId),
    body: JSON.stringify(input),
    accessToken: auth.accessToken,
  });
}

export async function listPayments(
  params: ListPaymentsParams = {},
  auth: AuthOptions,
  branchId: string | null,
) {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  if (params.pageSize !== undefined) {
    searchParams.set("pageSize", String(params.pageSize));
  }

  if (params.invoiceId) {
    searchParams.set("invoiceId", params.invoiceId);
  }

  if (params.status) {
    searchParams.set("status", params.status);
  }

  const query = searchParams.toString();

  return apiFetch<PaymentsListResponse>(
    `/payments${query ? `?${query}` : ""}`,
    {
      method: "GET",
      headers: branchHeaders(branchId),
      accessToken: auth.accessToken,
    },
  );
}

export async function voidPayment(
  id: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<Payment>(`/payments/${id}/void`, {
    method: "PATCH",
    headers: branchHeaders(branchId),
    accessToken: auth.accessToken,
  });
}

export async function getPayment(
  id: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<Payment>(`/payments/${id}`, {
    method: "GET",
    headers: branchHeaders(branchId),
    accessToken: auth.accessToken,
  });
}

export async function getInvoicePaymentSummary(
  invoiceId: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<InvoicePaymentSummary>(
    `/payments/invoice/${invoiceId}/summary`,
    {
      method: "GET",
      headers: branchHeaders(branchId),
      accessToken: auth.accessToken,
    },
  );
}
