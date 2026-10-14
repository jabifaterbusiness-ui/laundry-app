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

export type MigrationJobResponse = {
  id: string;
  sourceType: string;
  sourceName: string;
  status: string;
  summary: MigrationSummary | null;
  files: unknown[];
  issues: unknown[];
};

export async function getMigrationJob(
  jobId: string,
  auth: { accessToken: string | null },
): Promise<MigrationJobResponse> {
  return apiFetch<MigrationJobResponse>(
    `/migrations/jobs/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      accessToken: auth.accessToken,
    },
  );
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
  auth: { accessToken: string | null },
): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/migrations/backup/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
    },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return parseError(res);
  return res.blob();
}

export async function restoreBackup(
  file: File,
  password: string,
  auth: { accessToken: string | null },
) {
  const res = await fetch(`${API_BASE_URL}/migrations/backup/restore`, {
    method: "POST",
    headers: {
      ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      "Content-Type": file.type || "application/octet-stream",
      "X-Backup-Password": password,
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

export type CloudBackupProvider =
  | "GOOGLE_DRIVE"
  | "DROPBOX"
  | "ONEDRIVE"
  | "S3_COMPATIBLE";

export type CloudBackupConnection = {
  id: string;
  provider: CloudBackupProvider;
  displayName: string;
  config: Record<string, unknown> | null;
  status: "PENDING" | "CONNECTED" | "ERROR";
  verifiedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CloudBackupRun = {
  id: string;
  connectionId: string;
  trigger: string;
  status: string;
  storageKey: string | null;
  checksumSha256: string | null;
  sizeBytes: string | null;
  startedAt: string | null;
  scheduledFor: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type CloudBackupSettings = {
  id: string;
  enabled: boolean;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  timezone: string;
  retentionCount: number;
  destinationConnectionId: string | null;
  createdAt: string;
  updatedAt: string;
};

type CloudAuth = {
  accessToken: string | null;
  sensitiveAuthorization?: string | null;
};

function cloudRequestOptions(auth: CloudAuth, method = "GET", body?: unknown) {
  return {
    method,
    accessToken: auth.accessToken,
    sensitiveAuthorization: auth.sensitiveAuthorization,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export async function listCloudBackupConnections(
  auth: CloudAuth,
): Promise<CloudBackupConnection[]> {
  const result = await apiFetch<{ connections: CloudBackupConnection[] }>(
    "/migrations/backup/cloud/connections",
    cloudRequestOptions(auth),
  );
  return result.connections;
}

export async function createCloudBackupConnection(
  auth: CloudAuth,
  input: {
    provider: "S3_COMPATIBLE";
    displayName: string;
    config: { endpoint: string; region: string; bucket: string };
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    };
  },
): Promise<CloudBackupConnection> {
  const result = await apiFetch<{ connection: CloudBackupConnection }>(
    "/migrations/backup/cloud/connections",
    cloudRequestOptions(auth, "POST", input),
  );
  return result.connection;
}

export async function verifyCloudBackupConnection(
  connectionId: string,
  auth: CloudAuth,
): Promise<CloudBackupConnection> {
  const result = await apiFetch<{ connection: CloudBackupConnection }>(
    `/migrations/backup/cloud/connections/${encodeURIComponent(connectionId)}/verify`,
    cloudRequestOptions(auth, "POST", {}),
  );
  return result.connection;
}

export async function deleteCloudBackupConnection(
  connectionId: string,
  auth: CloudAuth,
): Promise<void> {
  await apiFetch<{ deleted: boolean }>(
    `/migrations/backup/cloud/connections/${encodeURIComponent(connectionId)}`,
    cloudRequestOptions(auth, "DELETE"),
  );
}

export async function createCloudBackupRun(
  connectionId: string,
  auth: CloudAuth,
): Promise<CloudBackupRun> {
  const result = await apiFetch<{ run: CloudBackupRun }>(
    "/migrations/backup/cloud/runs",
    cloudRequestOptions(auth, "POST", { connectionId }),
  );
  return result.run;
}

export async function listCloudBackupRuns(
  auth: CloudAuth,
): Promise<CloudBackupRun[]> {
  const result = await apiFetch<{ runs: CloudBackupRun[] }>(
    "/migrations/backup/cloud/runs",
    cloudRequestOptions(auth),
  );
  return result.runs;
}

export async function getCloudBackupSettings(
  auth: CloudAuth,
): Promise<CloudBackupSettings> {
  const result = await apiFetch<{ settings: CloudBackupSettings }>(
    "/migrations/backup/cloud/settings",
    cloudRequestOptions(auth),
  );
  return result.settings;
}

export async function saveCloudBackupSettings(
  auth: CloudAuth,
  input: Omit<CloudBackupSettings, "id" | "createdAt" | "updatedAt">,
): Promise<CloudBackupSettings> {
  const result = await apiFetch<{ settings: CloudBackupSettings }>(
    "/migrations/backup/cloud/settings",
    cloudRequestOptions(auth, "PUT", input),
  );
  return result.settings;
}
