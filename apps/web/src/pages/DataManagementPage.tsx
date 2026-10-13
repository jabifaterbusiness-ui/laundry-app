import { useEffect, useState } from "react";
import { ApiError } from "../lib/api-client.js";
import { analyzeMigration, exportBackup, getMigrationJob, importMigrationJob, restoreBackup, type MigrationAnalysisResponse } from "../lib/data-management-api.js";
import { hasPermission } from "../lib/permissions.js";
import { useAuthStore } from "../state/auth-store.js";
import { useSearchParams } from "react-router-dom";

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
};

type SaveFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (
    options?: SaveFilePickerOptions,
  ) => Promise<SaveFileHandle>;
};

function backupFilename() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    "LaundryAngel_Backup",
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`,
  ].join("_") + ".laundry-backup";
}

async function saveBackupBlob(blob: Blob) {
  const filename = backupFilename();
  const picker = (window as WindowWithSaveFilePicker).showSaveFilePicker;

  if (picker) {
    const handle = await picker({
      suggestedName: filename,
      types: [
        {
          description: "LaundryAngel encrypted backup",
          accept: {
            "application/octet-stream": [".laundry-backup"],
          },
        },
      ],
    });

    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataManagementPage() {
  const [searchParams] = useSearchParams();
  const jobIdFromUrl = searchParams.get("jobId");
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const securityRole = user?.securityRole;
  const [migrationFile, setMigrationFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<MigrationAnalysisResponse | null>(null);
  const [duplicatePolicy, setDuplicatePolicy] = useState<"skip" | "merge" | "create">("skip");
  const [customerMapping, setCustomerMapping] = useState<MigrationAnalysisResponse["summary"]["customerMapping"]>({});
  const [backupPassword, setBackupPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!jobIdFromUrl || !accessToken) {
      return;
    }

    const jobId = jobIdFromUrl;
    let cancelled = false;

    async function loadMigrationJob() {
      setBusy(true);
      setMessage(null);

      try {
        const job = await getMigrationJob(jobId, { accessToken });
        if (cancelled) {
          return;
        }

        if (!job.summary) {
          setMessage("This migration job has no saved analysis summary.");
          return;
        }

        setAnalysis({
          job: {
            id: job.id,
            status: job.status,
            sourceType: job.sourceType,
            sourceName: job.sourceName,
          },
          summary: job.summary,
        });
        setCustomerMapping(job.summary.customerMapping);
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof ApiError
              ? error.message
              : "Could not load the migration job.",
          );
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    void loadMigrationJob();

    return () => {
      cancelled = true;
    };
  }, [accessToken, jobIdFromUrl]);

  const canManage =
    hasPermission(user, "migrations.view") &&
    (securityRole === "BUSINESS_OWNER" || securityRole === "BRANCH_MANAGER");
  const canRestore =
    hasPermission(user, "migrations.manage") &&
    securityRole === "BUSINESS_OWNER";

  async function handleAnalyze() {
    if (!migrationFile) return;
    setBusy(true); setMessage(null);
    try {
      const result = await analyzeMigration(migrationFile, { accessToken });
      setAnalysis(result);
      setCustomerMapping(result.summary.customerMapping);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not analyze the backup.");
    } finally { setBusy(false); }
  }

  async function handleImport() {
    if (!analysis) return;
    setBusy(true); setMessage(null);
    try {
      const result = await importMigrationJob(analysis.job.id, duplicatePolicy, customerMapping, { accessToken });
      setMessage(`Import completed: ${result.imported.customersCreated} customers created, ${result.imported.customersMerged} merged, ${result.imported.customersSkipped} skipped.`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Import failed.");
    } finally { setBusy(false); }
  }

  async function handleExport() {
    if (!backupPassword) {
      setMessage("Enter the backup password.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const blob = await exportBackup(backupPassword, { accessToken });
      await saveBackupBlob(blob);
      setMessage("Encrypted backup saved successfully.");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Backup export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (!restoreFile || !restorePassword) {
      setMessage("Choose a backup file and enter its password.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const result = await restoreBackup(restoreFile, restorePassword, { accessToken });
      setMessage(
        `Restore completed: ${result.created} records created, ${result.updated} updated, ${result.mapped} safely mapped, and ${result.skippedUsers} existing staff accounts preserved without credential/security changes.`,
      );
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return <main><h1>Data Management</h1><p>You do not have permission to manage business data migration.</p></main>;

  return (
    <main>
      <h1>Backup & Data Migration</h1>
      <p>Safely migrate data from previous laundry software or restore an encrypted Laundry App backup.</p>
      {message && <p role="status">{message}</p>}

      <section>
        <h2>Import from previous software</h2>
        <p>Supported now: DBF/FoxPro, CSV, JSON and Excel workbooks. ZIP backups containing these files are inspected automatically.</p>
        <input type="file" accept=".zip,.dbf,.csv,.json,.xlsx,.xls" onChange={(e) => setMigrationFile(e.target.files?.[0] ?? null)} />
        <button type="button" disabled={!migrationFile || busy} onClick={handleAnalyze}>Analyze backup</button>

        {analysis?.summary && (
          <div>
            <h3>Migration preview</h3>
            <p>{analysis.summary.records} records found across {analysis.summary.files} files and {analysis.summary.tables} tables.</p>
            <p>Customers ready to import: <strong>{analysis.summary.supported.customers}</strong></p>
            {analysis.summary.unsupported.length > 0 && (
              <div>
                <strong>Not yet imported</strong>
                <ul>{analysis.summary.unsupported.slice(0, 20).map((item) => <li key={`${item.file}-${item.table}`}>{item.file}: {item.rows} rows — {item.reason}</li>)}</ul>
              </div>
            )}
            {analysis.summary.warnings.length > 0 && <p>{analysis.summary.warnings.join(" ")}</p>}
            {analysis.summary.customerHeaders.length > 0 && (
              <div>
                <h4>Customer field mapping</h4>
                <p>We auto-detected these fields. Review them before importing when migrating from an unfamiliar system.</p>
                {(["firstName", "lastName", "name", "phone", "email", "address", "notes"] as const).map((field) => (
                  <label key={field} style={{ display: "block", marginBottom: 8 }}>
                    {field}
                    <select value={customerMapping[field] ?? ""} onChange={(e) => setCustomerMapping((current) => ({ ...current, [field]: e.target.value || undefined }))}>
                      <option value="">Not mapped</option>
                      {analysis.summary.customerHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <label>
              Duplicate handling
              <select value={duplicatePolicy} onChange={(e) => setDuplicatePolicy(e.target.value as typeof duplicatePolicy)}>
                <option value="skip">Skip existing customers</option>
                <option value="merge">Merge missing information into existing customers</option>
                <option value="create">Create duplicates as separate customers</option>
              </select>
            </label>
            <button type="button" disabled={busy || analysis.summary.supported.customers === 0} onClick={handleImport}>Confirm & import</button>
          </div>
        )}
      </section>

      {canRestore && (
        <>
          <section>
            <h2>Export encrypted backup</h2>
            <p>The backup is encrypted before it leaves the server. Use a strong password of at least 12 characters and keep it separately from the backup file.</p>
            <input type="password" placeholder="Backup password" value={backupPassword} onChange={(e) => setBackupPassword(e.target.value)} />
            <button type="button" disabled={busy || backupPassword.length < 12} onClick={handleExport}>Download backup</button>
          </section>

          <section>
            <h2>Restore encrypted backup</h2>
            <p>Restore is merge-only: it never deletes current data, never overwrites passwords or security access, and restores the operational business dataset transactionally.</p>
            <input type="file" accept=".laundry-backup" onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)} />
            <input type="password" placeholder="Backup password" value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} />
            <button type="button" disabled={busy || !restoreFile || restorePassword.length < 12} onClick={handleRestore}>Restore backup</button>
          </section>
        </>
      )}
    </main>
  );
}
