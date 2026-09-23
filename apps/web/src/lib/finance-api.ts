import { apiFetch } from "./api-client.js";

export type ExpenseStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "VOID";

export type ExpenseCategory =
  | "SALARY"
  | "RENT"
  | "UTILITIES"
  | "INVENTORY"
  | "TRANSPORT"
  | "MAINTENANCE"
  | "FINANCE_CHARGE"
  | "TAX"
  | "EMPLOYEE_REIMBURSEMENT"
  | "MISCELLANEOUS"
  | "OTHER";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "SALARY",
  "RENT",
  "UTILITIES",
  "INVENTORY",
  "TRANSPORT",
  "MAINTENANCE",
  "FINANCE_CHARGE",
  "TAX",
  "EMPLOYEE_REIMBURSEMENT",
  "MISCELLANEOUS",
  "OTHER",
];

export interface FinancialStatement {
  period: {
    from: string;
    to: string;
  };
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
  detail: {
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      amount: number;
      createdAt: string;
    }>;
    refunds: Array<{
      id: string;
      invoiceId: string;
      amount: number;
      createdAt: string;
    }>;
    recognizedExpenses: Array<{
      id: string;
      category: ExpenseCategory;
      description: string;
      amount: number;
      incurredAt: string;
      recognizedAt: string | null;
    }>;
    finalizedPayroll: Array<{
      id: string;
      employeeId: string;
      grossPay: number;
      periodStart: string;
      periodEnd: string;
    }>;
  };
  counts: {
    invoices: number;
    refunds: number;
    recognizedExpenses: number;
    finalizedPayrollRecords: number;
  };
}

export interface Expense {
  id: string;
  businessId: string;
  branchId: string;
  category: ExpenseCategory;
  status: ExpenseStatus;
  description: string;
  amount: number;
  incurredAt: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  approvedAt: string | null;
  approvedById: string | null;
  recognizedAt: string | null;
  recognizedById: string | null;
  createdBy?: {
    id: string;
    fullName: string;
    email: string;
  };
  approvedBy?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  recognizedBy?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

interface AuthOptions {
  accessToken: string | null;
}

function buildQuery(params: {
  from?: string;
  to?: string;
  category?: ExpenseCategory;
  status?: ExpenseStatus;
}): string {
  const query = new URLSearchParams();

  if (params.from) {
    query.set("from", params.from);
  }

  if (params.to) {
    query.set("to", params.to);
  }

  if (params.category) {
    query.set("category", params.category);
  }

  if (params.status) {
    query.set("status", params.status);
  }

  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function getFinancialStatement(
  range: { from: string; to: string },
  auth: AuthOptions,
  branchId: string | null,
): Promise<FinancialStatement> {
  return apiFetch<FinancialStatement>(
    `/reports/financial-statement${buildQuery(range)}`,
    {
      accessToken: auth.accessToken,
      branchId,
    },
  );
}

export async function listExpenses(
  filters: {
    category?: ExpenseCategory;
    status?: ExpenseStatus;
  },
  auth: AuthOptions,
  branchId: string | null,
): Promise<Expense[]> {
  return apiFetch<Expense[]>(
    `/expenses${buildQuery(filters)}`,
    {
      accessToken: auth.accessToken,
      branchId,
    },
  );
}

export async function createExpense(
  input: {
    category: ExpenseCategory;
    description: string;
    amount: number;
    incurredAt: string;
    reference?: string;
    note?: string;
  },
  auth: AuthOptions,
  branchId: string | null,
): Promise<Expense> {
  return apiFetch<Expense>("/expenses", {
    method: "POST",
    accessToken: auth.accessToken,
    branchId,
    body: JSON.stringify(input),
  });
}

export async function approveExpense(
  expenseId: string,
  auth: AuthOptions,
  branchId: string | null,
): Promise<Expense> {
  return apiFetch<Expense>(`/expenses/${expenseId}/approve`, {
    method: "POST",
    accessToken: auth.accessToken,
    branchId,
  });
}

export async function rejectExpense(
  expenseId: string,
  reason: string | undefined,
  auth: AuthOptions,
  branchId: string | null,
): Promise<Expense> {
  return apiFetch<Expense>(`/expenses/${expenseId}/reject`, {
    method: "POST",
    accessToken: auth.accessToken,
    branchId,
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export async function recognizeExpense(
  expenseId: string,
  auth: AuthOptions,
  branchId: string | null,
): Promise<Expense> {
  return apiFetch<Expense>(`/expenses/${expenseId}/recognize`, {
    method: "POST",
    accessToken: auth.accessToken,
    branchId,
  });
}

export async function voidExpense(
  expenseId: string,
  auth: AuthOptions,
  branchId: string | null,
): Promise<Expense> {
  return apiFetch<Expense>(`/expenses/${expenseId}/void`, {
    method: "POST",
    accessToken: auth.accessToken,
    branchId,
  });
}

export interface FinancialStatementConfig {
  id: string | null;
  businessId: string;
  enabled: boolean;
  dayOfMonth: number;
  hour: number;
  minute: number;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  dailyEnabled: boolean;
  dailyHour: number;
  dailyMinute: number;
  dailyEmailEnabled: boolean;
  dailyWhatsappEnabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FinancialStatementRecipient {
  id: string;
  businessId: string;
  userId: string;
  whatsappNumber: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    isActive: boolean;
  };
}

const DELIVERY_BASE = "/reports/financial-statement-delivery";

export function getFinancialStatementConfig(
  auth: AuthOptions,
): Promise<FinancialStatementConfig> {
  return apiFetch<FinancialStatementConfig>(`${DELIVERY_BASE}/config`, {
    accessToken: auth.accessToken,
  });
}

export function updateFinancialStatementConfig(
  input: {
    enabled: boolean;
    dayOfMonth: number;
    hour: number;
    minute: number;
    emailEnabled: boolean;
    whatsappEnabled: boolean;
    dailyEnabled: boolean;
    dailyHour: number;
    dailyMinute: number;
    dailyEmailEnabled: boolean;
    dailyWhatsappEnabled: boolean;
  },
  auth: AuthOptions,
): Promise<FinancialStatementConfig> {
  return apiFetch<FinancialStatementConfig>(`${DELIVERY_BASE}/config`, {
    method: "PUT",
    accessToken: auth.accessToken,
    body: JSON.stringify(input),
  });
}

export function listFinancialStatementRecipients(
  auth: AuthOptions,
): Promise<FinancialStatementRecipient[]> {
  return apiFetch<FinancialStatementRecipient[]>(
    `${DELIVERY_BASE}/recipients`,
    {
      accessToken: auth.accessToken,
    },
  );
}

export function createFinancialStatementRecipient(
  input: {
    userId: string;
    whatsappNumber?: string;
  },
  auth: AuthOptions,
): Promise<FinancialStatementRecipient> {
  return apiFetch<FinancialStatementRecipient>(
    `${DELIVERY_BASE}/recipients`,
    {
      method: "POST",
      accessToken: auth.accessToken,
      body: JSON.stringify(input),
    },
  );
}

export function updateFinancialStatementRecipient(
  recipientId: string,
  input: {
    whatsappNumber?: string | null;
    enabled?: boolean;
  },
  auth: AuthOptions,
): Promise<FinancialStatementRecipient> {
  return apiFetch<FinancialStatementRecipient>(
    `${DELIVERY_BASE}/recipients/${recipientId}`,
    {
      method: "PATCH",
      accessToken: auth.accessToken,
      body: JSON.stringify(input),
    },
  );
}

export function removeFinancialStatementRecipient(
  recipientId: string,
  auth: AuthOptions,
): Promise<FinancialStatementRecipient> {
  return apiFetch<FinancialStatementRecipient>(
    `${DELIVERY_BASE}/recipients/${recipientId}`,
    {
      method: "DELETE",
      accessToken: auth.accessToken,
    },
  );
}
