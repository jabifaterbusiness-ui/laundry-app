import { apiFetch } from "./api-client.js";

export type CustomerAccountTransactionType =
  | "CREDIT"
  | "DEBIT"
  | "ADJUSTMENT";

export interface CustomerAccountTransaction {
  id: string;
  businessId: string;
  customerAccountId: string;
  branchId: string;
  type: CustomerAccountTransactionType;
  amount: number;
  invoiceId: string | null;
  note: string | null;
  createdAt: string;
}

export interface CustomerAccount {
  id: string | null;
  customerId: string;
  businessId: string;
  balance: number;
  transactions: CustomerAccountTransaction[];
}

export interface FundCustomerAccountInput {
  amount: number;
  note?: string;
}

export async function getCustomerAccount(
  customerId: string,
  auth: { accessToken: string | null },
): Promise<CustomerAccount> {
  return apiFetch<CustomerAccount>(
    `/customers/${customerId}/account`,
    {
      accessToken: auth.accessToken,
    },
  );
}

export async function fundCustomerAccount(
  customerId: string,
  input: FundCustomerAccountInput,
  auth: {
    accessToken: string | null;
    sensitiveAuthorization?: string | null;
  },
  branchId: string | null,
): Promise<CustomerAccountTransaction> {
  return apiFetch<CustomerAccountTransaction>(
    `/customers/${customerId}/account/fund`,
    {
      method: "POST",
      headers: {
        ...(branchId ? { "X-Branch-Id": branchId } : {}),
      },
      body: JSON.stringify(input),
      accessToken: auth.accessToken,
      sensitiveAuthorization: auth.sensitiveAuthorization,
    },
  );
}
