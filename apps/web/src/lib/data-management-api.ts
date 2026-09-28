import { apiFetch, ApiError } from "./api-client.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export interface MigrationCandidate {
  sourceRow: number;
  sourceFile: string;
  legacyId?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface MigrationSummary {
  files: number;
  tables: number;
  records: number;
  supported: { customers: number };
  unsupported: Array<{ file: string; table: string; rows: number; reason: string }>;
  warnings: string[];
  errors: string[];
  customerPreview: MigrationCandidate[];
  customerHeaders: string[];
  customerMapping: { name?: string; firstName?: string; lastName?: string; phone?: string; email?: string; address?: string; notes?: string };
}

export interface MigrationAnalysisResponse {
  job: { id: string; status: string; sourceType: string; sourceName: string };
  summary: MigrationSummary;
}

async function parseError(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new ApiError(body?.error?.message ?? `Request failed with status ${res.status}`, res.status);
}

export async function analyzeMigration(file: File, auth: { accessToken: string | null }): Promise<MigrationAnalysisResponse> {
  const res = await fetch(`${API_BASE_URL}/migrations/jobs/analyze`, {
    method: "POST",
    headers: {
      ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": file.name,
    },
    body: file,
  });
  if (!res.ok) return parseError(res);
  return res.json() as Promise<MigrationAnalysisResponse>;
}

export async function importMigrationJob(jobId: string, duplicatePolicy: "skip" | "merge" | "create", mapping: MigrationSummary["customerMapping"], auth: { accessToken: string | null }) {
  return apiFetch<{ imported: { customersCreated: number; customersMerged: number; customersSkipped: number; invalidRows: number } }>(`/migrations/jobs/${jobId}/import`, {
    method: "POST",
    accessToken: auth.accessToken,
    body: JSON.stringify({ duplicatePolicy, confirm: true, mapping }),
  });
}

export async function exportBackup(
  password: string,
  reason: string,
  auth: { accessToken: string | null },
): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/migrations/backup/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}) },
    body: JSON.stringify({ password, reason }),
  });
  if (!res.ok) return parseError(res);
  return res.blob();
}

export async function restoreBackup(
  file: File,
  password: string,
  reason: string,
  auth: { accessToken: string | null },
) {
  const res = await fetch(`${API_BASE_URL}/migrations/backup/restore`, {
    method: "POST",
    headers: {
      ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      "Content-Type": file.type || "application/octet-stream",
      "X-Backup-Password": password,
      "X-Backup-Reason": reason,
    },
    body: file,
  });
  if (!res.ok) return parseError(res);
  return res.json() as Promise<{
      business: number;
      branches: number;
      users: number;
      userBranches: number;
      customers: number;
      customerStatusHistory: number;
      services: number;
      colors: number;
      orderNumberSequence: number;
      orders: number;
      orderItems: number;
      garments: number;
      invoices: number;
      invoiceItems: number;
      invoiceHistory: number;
      payments: number;
      inventoryItems: number;
      inventoryStock: number;
      inventoryMovements: number;
      expenses: number;
      employeeCompensation: number;
      payrollPeriods: number;
      payrollRecords: number;
      payrollDeductions: number;
      payrollPayments: number;
      ious: number;
      loans: number;
      financialRepayments: number;
      businessRolePermissions: number;
      userPermissionOverrides: number;
      financialStatementConfig: number;
      financialStatementRecipients: number;
      financialStatements: number;
      financialStatementDeliveries: number;
      created: number;
      updated: number;
      mapped: number;
      skippedUsers: number;
    }>;
}
