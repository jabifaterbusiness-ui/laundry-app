import { apiFetch } from "./api-client.js";

export type FinancialStatus =
  | "PENDING"
  | "APPROVED"
  | "PARTIALLY_DEDUCTED"
  | "FULLY_DEDUCTED"
  | "ACTIVE"
  | "PARTIALLY_REPAID"
  | "FULLY_REPAID"
  | "REJECTED"
  | "CANCELLED";

export type RepaymentType = "IOU" | "LOAN";
export type RepaymentMethod = "CASH" | "TRANSFER" | "POS";
export type RepaymentStatus = "POSTED" | "VOID";

export interface FinancialEmployee {
  id: string;
  fullName: string;
  email?: string | null;
  role?: string | null;
}

export interface IOURecord {
  id: string;
  employeeId: string;
  employee?: FinancialEmployee;
  amount: number;
  outstandingAmount: number;
  reason?: string | null;
  status: FinancialStatus;
  approvedAt?: string | null;
  approvedBy?: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoanRecord {
  id: string;
  employeeId: string;
  employee?: FinancialEmployee;
  principalAmount: number;
  outstandingAmount: number;
  reason?: string | null;
  status: FinancialStatus;
  approvedAt?: string | null;
  approvedBy?: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepaymentSource {
  id: string;
  employeeId: string;
  outstandingAmount: number;
  status: FinancialStatus;
  type: RepaymentType;
}

export interface RepaymentRecord {
  id: string;
  employeeId: string;
  employee?: FinancialEmployee;
  type: RepaymentType;
  iouId?: string | null;
  loanId?: string | null;
  amount: number;
  method: RepaymentMethod;
  reference?: string | null;
  note?: string | null;
  status: RepaymentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialAuth {
  accessToken: string | null;
  sensitiveAuthorization?: string | null;
}

interface ListFilters {
  employeeId?: string;
  status?: string;
}

function query(filters?: ListFilters) {
  const params = new URLSearchParams();
  if (filters?.employeeId) params.set("employeeId", filters.employeeId);
  if (filters?.status) params.set("status", filters.status);
  const value = params.toString();
  return value ? `?${value}` : "";
}

function options(
  branchId: string | null,
  auth: FinancialAuth,
  method?: string,
  body?: unknown,
) {
  return {
    branchId,
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
    ...(method ? { method } : {}),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

export function listIOUs(
  branchId: string,
  auth: FinancialAuth,
  filters?: ListFilters,
) {
  return apiFetch<IOURecord[]>(
    `/payroll/ious${query(filters)}`,
    options(branchId, auth),
  );
}

export function createIOU(
  branchId: string,
  auth: FinancialAuth,
  input: { employeeId: string; amount: number; reason?: string },
) {
  return apiFetch<IOURecord>(
    "/payroll/ious",
    options(branchId, auth, "POST", input),
  );
}

export function approveIOU(
  id: string,
  branchId: string,
  auth: FinancialAuth,
) {
  return apiFetch<IOURecord>(
    `/payroll/ious/${id}/approve`,
    options(branchId, auth, "POST", {}),
  );
}

export function rejectIOU(
  id: string,
  branchId: string,
  auth: FinancialAuth,
  reason: string,
) {
  return apiFetch<IOURecord>(
    `/payroll/ious/${id}/reject`,
    options(branchId, auth, "POST", { reason }),
  );
}

export function cancelIOU(
  id: string,
  branchId: string,
  auth: FinancialAuth,
) {
  return apiFetch<IOURecord>(
    `/payroll/ious/${id}/cancel`,
    options(branchId, auth, "POST", {}),
  );
}

export function listLoans(
  branchId: string,
  auth: FinancialAuth,
  filters?: ListFilters,
) {
  return apiFetch<LoanRecord[]>(
    `/payroll/loans${query(filters)}`,
    options(branchId, auth),
  );
}

export function createLoan(
  branchId: string,
  auth: FinancialAuth,
  input: { employeeId: string; principalAmount: number; reason?: string },
) {
  return apiFetch<LoanRecord>(
    "/payroll/loans",
    options(branchId, auth, "POST", input),
  );
}

export function approveLoan(
  id: string,
  branchId: string,
  auth: FinancialAuth,
) {
  return apiFetch<LoanRecord>(
    `/payroll/loans/${id}/approve`,
    options(branchId, auth, "POST", {}),
  );
}

export function rejectLoan(
  id: string,
  branchId: string,
  auth: FinancialAuth,
  reason: string,
) {
  return apiFetch<LoanRecord>(
    `/payroll/loans/${id}/reject`,
    options(branchId, auth, "POST", { reason }),
  );
}

export function cancelLoan(
  id: string,
  branchId: string,
  auth: FinancialAuth,
) {
  return apiFetch<LoanRecord>(
    `/payroll/loans/${id}/cancel`,
    options(branchId, auth, "POST", {}),
  );
}

export function listRepayments(
  branchId: string,
  auth: FinancialAuth,
  filters?: ListFilters & {
    type?: RepaymentType;
    iouId?: string;
    loanId?: string;
  },
) {
  const params = new URLSearchParams();
  if (filters?.employeeId) params.set("employeeId", filters.employeeId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.iouId) params.set("iouId", filters.iouId);
  if (filters?.loanId) params.set("loanId", filters.loanId);
  const suffix = params.toString() ? `?${params.toString()}` : "";

  return apiFetch<RepaymentRecord[]>(
    `/payroll/repayments${suffix}`,
    options(branchId, auth),
  );
}

export function listRepaymentSources(
  branchId: string,
  auth: FinancialAuth,
  employeeId: string,
  type: RepaymentType,
) {
  const params = new URLSearchParams({ employeeId, type });
  return apiFetch<RepaymentSource[]>(
    `/payroll/repayments/sources?${params.toString()}`,
    options(branchId, auth),
  );
}

export function createRepayment(
  branchId: string,
  auth: FinancialAuth,
  input: {
    employeeId: string;
    type: RepaymentType;
    iouId?: string;
    loanId?: string;
    amount: number;
    method: RepaymentMethod;
    reference?: string;
    note?: string;
  },
) {
  return apiFetch<RepaymentRecord>(
    "/payroll/repayments",
    options(branchId, auth, "POST", input),
  );
}

export function voidRepayment(
  id: string,
  branchId: string,
  auth: FinancialAuth,
  reason: string,
) {
  return apiFetch<RepaymentRecord>(
    `/payroll/repayments/${id}/void`,
    options(branchId, auth, "POST", { reason }),
  );
}
