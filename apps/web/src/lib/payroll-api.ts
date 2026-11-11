import { apiFetch } from "./api-client.js";

export type PayrollApprovalStatus =
  | "NOT_SUBMITTED"
  | "PENDING"
  | "APPROVED"
  | "DECLINED";

export type PayrollPeriodStatus =
  | "OPEN"
  | "PROCESSING"
  | "FINALIZED"
  | "PAID";

export type PayrollPaymentMethod = "CASH" | "TRANSFER" | "POS";
export type PayrollPaymentStatus = "POSTED" | "VOID";

export type PayrollEmployeePaymentStatus =
  | "PAID"
  | "PARTIALLY_PAID"
  | "UNPAID";

export interface PayrollPeriod {
  id: string;
  businessId: string;
  branchId: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollPeriodStatus;
  approvalStatus?: PayrollApprovalStatus;
  approvalSubmittedAt?: string | null;
  approvalSubmittedById?: string | null;
  approvalDecidedAt?: string | null;
  approvalDecidedById?: string | null;
  approvalReason?: string | null;
}

export interface PayrollEmployee {
  id: string;
  fullName: string;
  email?: string | null;
  role?: string | null;
}

export interface PayrollPayment {
  id: string;
  amount: number;
  method: PayrollPaymentMethod;
  reference?: string | null;
  note?: string | null;
  status: PayrollPaymentStatus;
  createdAt: string;
}

export interface PayrollDeduction {
  id: string;
  type: string;
  amount: number;
  sourceId?: string | null;
  description?: string | null;
}

export interface PayrollRecord {
  payrollRecordId: string;
  employee: PayrollEmployee;
  basicSalary: number;
  allowances: number;
  bonuses: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  amountPaid: number;
  balance: number;
  paymentStatus: PayrollEmployeePaymentStatus;
  deductions: PayrollDeduction[];
  payments: PayrollPayment[];
}

export interface PayrollStatusResponse {
  payrollPeriod: PayrollPeriod;
  summary: {
    employeeCount: number;
    paidCount: number;
    partiallyPaidCount: number;
    unpaidCount: number;
    totalGrossPay: number;
    totalDeductions: number;
    totalNetPay: number;
    totalPaid: number;
    totalBalance: number;
  };
  records: PayrollRecord[];
}

export interface CreatePayrollPeriodInput {
  periodStart: string;
  periodEnd: string;
}

export interface CreatePayrollPaymentInput {
  payrollRecordId: string;
  employeeId: string;
  amount: number;
  method: PayrollPaymentMethod;
  reference?: string;
  note?: string;
}

export interface PayrollPaymentListResponse {
  data: PayrollPayment[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface AuthOptions {
  accessToken: string | null;
  sensitiveAuthorization?: string | null;
}

function headers(branchId: string | null): Record<string, string> {
  return branchId ? { "X-Branch-Id": branchId } : {};
}

export function createPayrollPeriod(
  input: CreatePayrollPeriodInput,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<PayrollPeriod>("/payroll/periods", {
    method: "POST",
    headers: headers(branchId),
    body: JSON.stringify(input),
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
  });
}

export function listPayrollPeriods(
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<PayrollPeriod[]>("/payroll/periods", {
    headers: headers(branchId),
    accessToken: auth.accessToken,
  });
}

export function getPayrollPeriod(
  periodId: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<PayrollPeriod>(`/payroll/periods/${periodId}`, {
    headers: headers(branchId),
    accessToken: auth.accessToken,
  });
}

export function getPayrollStatus(
  periodId: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<PayrollStatusResponse>(`/payroll/periods/${periodId}/status`, {
    headers: headers(branchId),
    accessToken: auth.accessToken,
  });
}

export function generatePayroll(
  periodId: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<PayrollStatusResponse>(`/payroll/periods/${periodId}/generate`, {
    method: "POST",
    headers: headers(branchId),
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
  });
}

export function processPayrollDeductions(
  periodId: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<PayrollStatusResponse>(
    `/payroll/periods/${periodId}/deductions/process`,
    {
      method: "POST",
      headers: headers(branchId),
      accessToken: auth.accessToken,
      sensitiveAuthorization: auth.sensitiveAuthorization,
    },
  );
}

export function submitPayrollForApproval(
  periodId: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<PayrollPeriod>(`/payroll/periods/${periodId}/submit`, {
    method: "POST",
    headers: headers(branchId),
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
  });
}

export function approvePayroll(
  periodId: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<PayrollPeriod>(`/payroll/periods/${periodId}/approve`, {
    method: "POST",
    headers: headers(branchId),
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
  });
}

export function declinePayroll(
  periodId: string,
  reason: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<PayrollPeriod>(`/payroll/periods/${periodId}/decline`, {
    method: "POST",
    headers: headers(branchId),
    body: JSON.stringify({ reason }),
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
  });
}

export function finalizePayroll(
  periodId: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<{
    payrollPeriodId: string;
    status: PayrollPeriodStatus;
    recordCount: number;
  }>(`/payroll/periods/${periodId}/finalize`, {
    method: "POST",
    headers: headers(branchId),
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
  });
}

export function createPayrollPayment(
  input: CreatePayrollPaymentInput,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<{
    payment: PayrollPayment;
    amountPaid: number;
    balance: number;
    payrollPeriodStatus: PayrollPeriodStatus;
  }>("/payroll/payments", {
    method: "POST",
    headers: headers(branchId),
    body: JSON.stringify(input),
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
  });
}

export function listPayrollPayments(
  params: {
    page?: number;
    pageSize?: number;
    payrollRecordId?: string;
    employeeId?: string;
    status?: PayrollPaymentStatus;
  },
  auth: AuthOptions,
  branchId: string | null,
) {
  const query = new URLSearchParams();

  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.pageSize !== undefined) {
    query.set("pageSize", String(params.pageSize));
  }
  if (params.payrollRecordId) {
    query.set("payrollRecordId", params.payrollRecordId);
  }
  if (params.employeeId) query.set("employeeId", params.employeeId);
  if (params.status) query.set("status", params.status);

  const suffix = query.toString() ? `?${query}` : "";

  return apiFetch<PayrollPaymentListResponse>(`/payroll/payments${suffix}`, {
    headers: headers(branchId),
    accessToken: auth.accessToken,
  });
}

export function getPayrollPayment(
  paymentId: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<PayrollPayment>(`/payroll/payments/${paymentId}`, {
    headers: headers(branchId),
    accessToken: auth.accessToken,
  });
}

export function voidPayrollPayment(
  paymentId: string,
  reason: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<{
    payment: PayrollPayment;
    payrollPeriodStatus: PayrollPeriodStatus;
  }>(`/payroll/payments/${paymentId}/void`, {
    method: "POST",
    headers: headers(branchId),
    body: JSON.stringify({ reason }),
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
  });
}

export interface UpdatePayrollEarningsInput {
  basicSalary: number;
  allowances: number;
  bonuses: number;
}

export interface CreateOtherPayrollDeductionInput {
  amount: number;
  reason: string;
}

export function updatePayrollEarnings(
  payrollRecordId: string,
  input: UpdatePayrollEarningsInput,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<PayrollRecord>(
    `/payroll/records/${payrollRecordId}/earnings`,
    {
      method: "PATCH",
      headers: headers(branchId),
      body: JSON.stringify(input),
      accessToken: auth.accessToken,
      sensitiveAuthorization: auth.sensitiveAuthorization,
    },
  );
}

export function createOtherPayrollDeduction(
  payrollRecordId: string,
  input: CreateOtherPayrollDeductionInput,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<unknown>(
    `/payroll/records/${payrollRecordId}/deductions`,
    {
      method: "POST",
      headers: headers(branchId),
      body: JSON.stringify(input),
      accessToken: auth.accessToken,
      sensitiveAuthorization: auth.sensitiveAuthorization,
    },
  );
}

export interface EmployeeCompensation {
  id: string;
  businessId: string;
  branchId: string | null;
  employeeId: string;
  basicSalary: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdAt: string;
  updatedAt: string;
  employee: PayrollEmployee;
}

export interface CreateCompensationInput {
  employeeId: string;
  basicSalary: number;
  effectiveFrom: string;
}

export function listCompensation(
  params: {
    employeeId?: string;
  },
  auth: AuthOptions,
  branchId: string | null,
) {
  const query = new URLSearchParams();

  if (params.employeeId) {
    query.set("employeeId", params.employeeId);
  }

  const suffix = query.toString() ? `?${query}` : "";

  return apiFetch<EmployeeCompensation[]>(
    `/payroll/compensation${suffix}`,
    {
      headers: headers(branchId),
      accessToken: auth.accessToken,
    },
  );
}

export interface UnassignedLegacyCompensation extends EmployeeCompensation {
  branchId: null;
  employee: PayrollEmployee & {
    isActive: boolean;
    deletedAt: string | null;
    branches: Array<{
      branch: { id: string; name: string; isActive: boolean };
    }>;
  };
}

export function listUnassignedLegacyCompensation(
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<UnassignedLegacyCompensation[]>(
    "/payroll/compensation/unassigned-legacy",
    {
      headers: headers(branchId),
      accessToken: auth.accessToken,
    },
  );
}

export function assignLegacyCompensationToCurrentBranch(
  compensationId: string,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<EmployeeCompensation>(
    `/payroll/compensation/${compensationId}/assign-legacy-to-current-branch`,
    {
      method: "PATCH",
      headers: headers(branchId),
      accessToken: auth.accessToken,
    },
  );
}

export function createCompensation(
  input: CreateCompensationInput,
  auth: AuthOptions,
  branchId: string | null,
) {
  return apiFetch<EmployeeCompensation>("/payroll/compensation", {
    method: "POST",
    headers: headers(branchId),
    body: JSON.stringify(input),
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
  });
}
