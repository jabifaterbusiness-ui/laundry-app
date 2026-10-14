import { useEffect, useState } from "react";
import { ApiError } from "../lib/api-client.js";
import {
  analyzeMigration, exportBackup, getMigrationJob, importMigrationJob, restoreBackup,
  listCloudBackupConnections, createCloudBackupConnection, verifyCloudBackupConnection,
  createCloudBackupRun, listCloudBackupRuns,
  getCloudBackupSettings, saveCloudBackupSettings,
  type CloudBackupConnection, type CloudBackupRun, type CloudBackupSettings,
  type MigrationAnalysisResponse,
} from "../lib/data-management-api.js";
import { useSensitiveAuthorization } from "../components/auth/SensitiveAuthorizationProvider.js";
import { hasPermission } from "../lib/permissions.js";
import { useAuthStore } from "../state/auth-store.js";
import { useSearchParams } from "react-router-dom";
import "./DataManagementPage.css";

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
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();
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
  const [cloudConnections, setCloudConnections] = useState<CloudBackupConnection[]>([]);
  const [cloudRuns, setCloudRuns] = useState<CloudBackupRun[]>([]);
  const [cloudSettings, setCloudSettings] = useState<CloudBackupSettings | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [cloudName, setCloudName] = useState("LaundryAngel backups");
  const [cloudEndpoint, setCloudEndpoint] = useState("");
  const [cloudRegion, setCloudRegion] = useState("us-east-1");
  const [cloudBucket, setCloudBucket] = useState("");
  const [cloudKey, setCloudKey] = useState("");
  const [cloudSecret, setCloudSecret] = useState("");


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

  const canManageCloud =
    securityRole === "BUSINESS_OWNER" &&
    hasPermission(user, "migrations.view") &&
    hasPermission(user, "migrations.manage");

  async function refreshCloudData() {
    if (!accessToken) return;
    const auth = { accessToken };
    const [connections, runs, settings] = await Promise.all([
      listCloudBackupConnections(auth),
      listCloudBackupRuns(auth),
      getCloudBackupSettings(auth),
    ]);
    setCloudConnections(connections);
    setCloudRuns(runs);
    setCloudSettings(settings);
  }

  useEffect(() => {
    if (!canManageCloud || !accessToken) return;
    let cancelled = false;
    void Promise.all([
      listCloudBackupConnections({ accessToken }),
      listCloudBackupRuns({ accessToken }),
      getCloudBackupSettings({ accessToken }),
    ]).then(([connections, runs, settings]) => {
      if (cancelled) return;
      setCloudConnections(connections);
      setCloudRuns(runs);
      setCloudSettings(settings);
    }).catch((error: unknown) => {
      if (!cancelled) setCloudError(error instanceof Error ? error.message : "Could not load cloud backups.");
    });
    return () => { cancelled = true; };
  }, [accessToken, canManageCloud]);

  async function cloudAction(action: (authorization: string) => Promise<unknown>, success: string) {
    const authorization = await requestSensitiveAuthorization();
    if (!authorization) {
      setCloudError("Sensitive authorization was cancelled.");
      return;
    }
    setCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);
    try {
      await action(authorization);
      await refreshCloudData();
      setCloudMessage(success);
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Cloud backup action failed.");
    } finally {
      setCloudBusy(false);
    }
  }

  async function handleCloudSettingsSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !cloudSettings) return;
    const selectedDestination = cloudConnections.find(
      (connection) => connection.id === cloudSettings.destinationConnectionId,
    );
    if (
      cloudSettings.enabled &&
      (!selectedDestination ||
        selectedDestination.status !== "CONNECTED" ||
        !selectedDestination.verifiedAt)
    ) {
      setCloudError("To enable automatic backups, select a connected and verified destination.");
      return;
    }

    const authorization = await requestSensitiveAuthorization();
    if (!authorization) {
      setCloudError("Sensitive authorization was cancelled.");
      return;
    }
    setCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);
    try {
      const saved = await saveCloudBackupSettings(
        { accessToken, sensitiveAuthorization: authorization },
        { ...cloudSettings, enabled: cloudSettings.enabled },
      );
      setCloudSettings(saved);
      await refreshCloudData();
      setCloudMessage(
        saved.enabled
          ? "Backup preferences saved. Automatic backups are enabled for the selected verified destination."
          : "Backup preferences saved. Automatic backups are disabled.",
      );
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Could not save backup preferences.");
    } finally {
      setCloudBusy(false);
    }
  }

  async function handleCloudCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !cloudEndpoint.trim() || !cloudBucket.trim() || !cloudKey.trim() || !cloudSecret) {
      setCloudError("Complete the endpoint, bucket, access key, and secret key.");
      return;
    }
    await cloudAction(async (authorization) => {
      await createCloudBackupConnection(
        { accessToken, sensitiveAuthorization: authorization },
        {
          provider: "S3_COMPATIBLE",
          displayName: cloudName.trim() || "S3 backup destination",
          config: { endpoint: cloudEndpoint.trim(), region: cloudRegion.trim(), bucket: cloudBucket.trim() },
          credentials: { accessKeyId: cloudKey.trim(), secretAccessKey: cloudSecret },
        },
      );
      setCloudKey("");
      setCloudSecret("");
    }, "Destination saved. Verify it before running a backup.");
  }

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
    <main className="data-management">
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

      {canManageCloud && (
        <section aria-labelledby="cloud-backup-heading">
          <h2 id="cloud-backup-heading">Cloud backup — S3-compatible storage</h2>
          <p>Cloud artifacts are encrypted on the server before upload. Credentials are not displayed again after submission.</p>
          <p role="note">Scheduled backups use the configured timezone and run only when the API scheduler is running. Cloud destinations currently support verified S3-compatible storage.</p>
          {cloudMessage && <p role="status">{cloudMessage}</p>}
          {cloudError && <p role="alert">{cloudError}</p>}

          <form onSubmit={handleCloudCreate}>
            <h3>Add destination</h3>
            <label>Destination name
              <input value={cloudName} onChange={(e) => setCloudName(e.target.value)} required />
            </label>
            <label>Endpoint URL
              <input type="url" value={cloudEndpoint} onChange={(e) => setCloudEndpoint(e.target.value)} placeholder="https://storage.example.com" required />
            </label>
            <label>Region
              <input value={cloudRegion} onChange={(e) => setCloudRegion(e.target.value)} required />
            </label>
            <label>Bucket
              <input value={cloudBucket} onChange={(e) => setCloudBucket(e.target.value)} required />
            </label>
            <label>Access key ID
              <input autoComplete="off" value={cloudKey} onChange={(e) => setCloudKey(e.target.value)} required />
            </label>
            <label>Secret access key
              <input type="password" autoComplete="new-password" value={cloudSecret} onChange={(e) => setCloudSecret(e.target.value)} required />
            </label>
            <button type="submit" disabled={cloudBusy || !accessToken}>Save destination</button>
          </form>

          <h3>Destinations</h3>
          {cloudConnections.length === 0 && <p>No cloud destinations configured.</p>}
          {cloudConnections.map((connection) => (
            <article key={connection.id} className="data-management-destination">
              <h4>{connection.displayName}</h4>
              <p>{connection.provider} · {connection.status}</p>
              {connection.verifiedAt && <p>Verified: {new Date(connection.verifiedAt).toLocaleString()}</p>}
              {connection.lastError && <p role="alert">{connection.lastError}</p>}
              <button type="button" disabled={cloudBusy || !accessToken} onClick={() => {
                void cloudAction(
                  (authorization) => verifyCloudBackupConnection(connection.id, { accessToken, sensitiveAuthorization: authorization }),
                  "Destination verification completed.",
                );
              }}>Verify destination</button>{" "}
              <button type="button" disabled={cloudBusy || !accessToken || connection.status !== "CONNECTED"} onClick={() => {
                void cloudAction(
                  (authorization) => createCloudBackupRun(connection.id, { accessToken, sensitiveAuthorization: authorization }),
                  "Manual backup run completed.",
                );
              }}>Run backup now</button>
            </article>
          ))}

          <h3>Schedule and retention preferences</h3>
          {!cloudSettings ? (
            <p>Loading backup preferences…</p>
          ) : (
            <form onSubmit={handleCloudSettingsSave}>
              <label className="data-management-schedule-toggle">
                <input
                  type="checkbox"
                  checked={cloudSettings.enabled}
                  disabled={!cloudConnections.some(
                    (connection) =>
                      connection.id === cloudSettings.destinationConnectionId &&
                      connection.status === "CONNECTED" &&
                      Boolean(connection.verifiedAt),
                  )}
                  onChange={(e) => setCloudSettings((current) => current ? { ...current, enabled: e.target.checked } : current)}
                />
                <span>
                  <strong>Enable automatic backups</strong>
                  <small>
                    {cloudSettings.enabled
                      ? "Automatic backups are enabled. The scheduler checks the configured schedule while the API is running."
                      : "Choose a connected, verified destination below before enabling automatic backups."}
                  </small>
                </span>
              </label>
              <label>Frequency
                <select value={cloudSettings.frequency} onChange={(e) => setCloudSettings((current) => current ? { ...current, frequency: e.target.value as CloudBackupSettings["frequency"] } : current)}>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </label>
              {cloudSettings.frequency === "WEEKLY" && (
                <label>Day of week
                  <select value={cloudSettings.dayOfWeek} onChange={(e) => setCloudSettings((current) => current ? { ...current, dayOfWeek: Number(e.target.value) } : current)}>
                    <option value={0}>Sunday</option><option value={1}>Monday</option>
                    <option value={2}>Tuesday</option><option value={3}>Wednesday</option>
                    <option value={4}>Thursday</option><option value={5}>Friday</option>
                    <option value={6}>Saturday</option>
                  </select>
                </label>
              )}
              {cloudSettings.frequency === "MONTHLY" && (
                <label>Day of month
                  <input type="number" min={1} max={31} value={cloudSettings.dayOfMonth} onChange={(e) => setCloudSettings((current) => current ? { ...current, dayOfMonth: Number(e.target.value) } : current)} required />
                </label>
              )}
              <label>Time zone
                <input value={cloudSettings.timezone} onChange={(e) => setCloudSettings((current) => current ? { ...current, timezone: e.target.value } : current)} placeholder="Africa/Lagos" required />
              </label>
              <div className="data-management-settings-grid">
                <label>Hour (24-hour time)
                  <input type="number" min={0} max={23} value={cloudSettings.hour} onChange={(e) => setCloudSettings((current) => current ? { ...current, hour: Number(e.target.value) } : current)} required />
                </label>
                <label>Minute
                  <input type="number" min={0} max={59} value={cloudSettings.minute} onChange={(e) => setCloudSettings((current) => current ? { ...current, minute: Number(e.target.value) } : current)} required />
                </label>
              </div>
              <label>Retention count (successful backups to keep)
                <input type="number" min={1} max={365} value={cloudSettings.retentionCount} onChange={(e) => setCloudSettings((current) => current ? { ...current, retentionCount: Number(e.target.value) } : current)} required />
              </label>
              <label>Preferred destination
                <select value={cloudSettings.destinationConnectionId ?? ""} onChange={(e) => setCloudSettings((current) => current ? { ...current, destinationConnectionId: e.target.value || null } : current)}>
                  <option value="">No preferred destination</option>
                  {cloudConnections.map((connection) => (
                    <option key={connection.id} value={connection.id}>{connection.displayName} ({connection.status})</option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={cloudBusy || !accessToken}>Save preferences</button>
            </form>
          )}

          <h3>Recent cloud backup runs</h3>
          {cloudRuns.length === 0 ? <p>No cloud backup runs yet.</p> : (
            <div className="data-management-table-wrap">
              <table>
                <thead><tr><th>Created</th><th>Status</th><th>Size</th><th>Checksum</th><th>Details</th></tr></thead>
                <tbody>{cloudRuns.map((run) => (
                  <tr key={run.id}>
                    <td>{new Date(run.createdAt).toLocaleString()}</td>
                    <td>{run.status}</td>
                    <td>{run.sizeBytes ? `${run.sizeBytes} bytes` : "—"}</td>
                    <td>{run.checksumSha256 ?? "—"}</td>
                    <td>{run.errorMessage ?? run.storageKey ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
