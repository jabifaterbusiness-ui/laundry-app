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
    collectedAmount: number;
    collectionRate: number;
    collectionStatement: Array<{
      invoiceId: string;
      invoiceNumber: string;
      amount: number;
      collected: number;
      outstanding: number;
      date: string;
      status: string;
    }>;
    outstandingByYearMonth: Record<
      string,
      Record<
        string,
        {
          invoiceCount: number;
          outstandingAmount: number;
          invoices: Array<{
            invoiceId: string;
            invoiceNumber: string;
            amount: number;
            outstanding: number;
            date: string;
          }>;
        }
      >
    >;
  };
  payments: {
    received: number;
    refunded: number;
    netReceived: number;
  };
  pickup: {
    pickedUpCount: number;
    unpickedCount: number;
    totalGarments: number;
  };
  customers: {
    active: number;
  };
  inventory: {
    stockItems: number;
    movements: number;
  };
  managementInsights: string[];
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


export interface AnnualReport {
  period: {
    year: number;
    from: string;
    to: string;
  };
  currencyCode: string;
  revenue: {
    grossInvoiced: number;
    refunds: number;
    netRevenue: number;
  };
  expenses: {
    explicit: number;
    salary: number;
    total: number;
    byCategory: Record<string, number>;
  };
  profitOrLoss: {
    amount: number;
    type: "PROFIT" | "LOSS";
  };
  collection: {
    annualInvoiceCount: number;
    annualInvoiceAmount: number;
    annualCollectedAmount: number;
    annualOutstandingAmount: number;
    collectionRate: number;
    yearEndOutstandingAmount: number;
  };
  outstandingByYearMonth: DashboardReport["invoices"]["outstandingByYearMonth"];
  monthlyTrend: Array<{
    month: string;
    grossRevenue: number;
    refunds: number;
    netRevenue: number;
    explicitExpenses: number;
    salaryExpense: number;
    totalExpenses: number;
    profitOrLoss: number;
  }>;
  branchSummary: Record<string, {
    revenue: number;
    refunds: number;
    netRevenue: number;
    expenses: number;
    salary: number;
    totalExpenses: number;
    profitOrLoss: number;
  }>;
  managementInsights: string[];
}

export async function getAnnualReport(
  year: number,
  auth: AuthOptions,
): Promise<AnnualReport> {
  return apiFetch<AnnualReport>(
    `/reports/annual?year=${encodeURIComponent(year)}`,
    {
      accessToken: auth.accessToken,
    },
  );
}
