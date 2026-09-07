import { apiFetch } from "./api-client.js";

export interface ReportsDateRange {
  from?: string;
  to?: string;
}

export interface DashboardReport {
  period: {
    from: string | null;
    to: string | null;
  };
  orders: {
    total: number;
  };
  invoices: {
    total: number;
    totalAmount: number;
    outstandingAmount: number;
  };
  payments: {
    received: number;
    refunded: number;
    netReceived: number;
  };
  customers: {
    active: number;
  };
  inventory: {
    stockItems: number;
    movements: number;
  };
}

interface AuthOptions {
  accessToken: string | null;
}

function buildQuery(params: ReportsDateRange): string {
  const query = new URLSearchParams();

  if (params.from) {
    query.set("from", params.from);
  }

  if (params.to) {
    query.set("to", params.to);
  }

  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function getDashboardReport(
  range: ReportsDateRange = {},
  auth: AuthOptions,
  branchId: string | null,
): Promise<DashboardReport> {
  return apiFetch<DashboardReport>(
    `/reports/dashboard${buildQuery(range)}`,
    {
      accessToken: auth.accessToken,
      branchId,
    },
  );
}
