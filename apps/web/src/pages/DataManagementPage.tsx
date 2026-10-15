import { useEffect, useRef, useState } from "react";
import { publishCloudBackupNotification } from "../lib/cloud-backup-notifications.js";
import { ApiError } from "../lib/api-client.js";
import {
  analyzeMigration, exportBackup, getMigrationJob, importMigrationJob, restoreBackup,
  listCloudBackupConnections, createCloudBackupConnection, startCloudBackupOAuth,
  verifyCloudBackupConnection, createCloudBackupRun, listCloudBackupRuns,
  getCloudBackupSettings, saveCloudBackupSettings,
  listCloudBackupSchedules, createCloudBackupSchedule,
  updateCloudBackupSchedule, deleteCloudBackupSchedule,
  type CloudBackupConnection, type CloudBackupRun, type CloudBackupSettings,
  type CloudBackupSchedule, type CloudBackupScheduleInput,
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
  const [searchParams, setSearchParams] = useSearchParams();
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
  const cloudSettingsDirty = useRef(false);
  const [cloudSchedules, setCloudSchedules] = useState<CloudBackupSchedule[]>([]);
  const [cloudScheduleDraft, setCloudScheduleDraft] = useState<CloudBackupScheduleInput | null>(null);
  const [editingCloudScheduleId, setEditingCloudScheduleId] = useState<string | null>(null);
  const cloudSchedulesDirty = useRef(false);
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
    const [connections, runs, settings, schedules] = await Promise.all([
      listCloudBackupConnections(auth),
      listCloudBackupRuns(auth),
      getCloudBackupSettings(auth),
      listCloudBackupSchedules(auth),
    ]);
    setCloudConnections(connections);
    setCloudRuns(runs);
    setCloudSchedules((current) => {
      if (cloudSchedulesDirty.current) return current;
      return schedules;
    });
    if (!cloudSettingsDirty.current) {
      setCloudSettings(settings);
    }
  }

  function updateCloudSettings(
    update: (current: CloudBackupSettings) => CloudBackupSettings,
  ) {
    cloudSettingsDirty.current = true;
    setCloudSettings((current) => current ? update(current) : current);
  }

  const knownCloudRuns = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    if (!canManageCloud || !accessToken) {
      knownCloudRuns.current = null;
      return;
    }

    let cancelled = false;
    let polling = false;

    async function loadCloudData(initial: boolean) {
      if (polling) return;
      polling = true;
      try {
        const [connections, runs, settings, schedules] = await Promise.all([
          listCloudBackupConnections({ accessToken }),
          listCloudBackupRuns({ accessToken }),
          getCloudBackupSettings({ accessToken }),
          listCloudBackupSchedules({ accessToken }),
        ]);
        if (cancelled) return;

        const previous = knownCloudRuns.current;
        const next = new Map<string, string>();

        for (const run of runs) {
          next.set(run.id, run.status);
          if (initial || !previous) continue;

          const priorStatus = previous.get(run.id);
          const isNewScheduled = !previous.has(run.id) && run.trigger === "SCHEDULED";
          const statusChanged = priorStatus !== undefined && priorStatus !== run.status;
          if (!isNewScheduled && !statusChanged) continue;

          publishCloudBackupNotification({
            status: run.status === "SUCCEEDED" ? "success" : run.status === "FAILED" ? "error" : "progress",
            title: run.trigger === "SCHEDULED" ? "Scheduled cloud backup" : "Cloud backup",
            message: run.status === "SUCCEEDED"
              ? "Backup completed successfully."
              : run.status === "FAILED"
                ? (run.errorMessage || "Backup failed. Check the backup run details.")
                : `Backup ${run.status.toLowerCase()}. LaundryAngel is checking its status.`,
            source: run.trigger === "SCHEDULED" ? "scheduled" : "manual",
            runId: run.id,
          });
        }

        knownCloudRuns.current = next;
        setCloudConnections(connections);
        setCloudRuns(runs);
        if (!cloudSchedulesDirty.current) {
          setCloudSchedules(schedules);
        }
        if (!cloudSettingsDirty.current) {
          setCloudSettings(settings);
        }
      } catch (error) {
        if (!cancelled && initial) {
          setCloudError(error instanceof Error ? error.message : "Could not load cloud backups.");
        }
      } finally {
        polling = false;
      }
    }

    void loadCloudData(true);
    const interval = window.setInterval(() => {
      void loadCloudData(false);
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accessToken, canManageCloud]);

  useEffect(() => {
    const outcome = searchParams.get("cloudBackupOAuth");
    if (!outcome || !canManageCloud) return;

    const cleanedParams = new URLSearchParams(searchParams);
    cleanedParams.delete("cloudBackupOAuth");
    setSearchParams(cleanedParams, { replace: true });

    if (outcome === "connected") {
      setCloudError(null);
      setCloudMessage("Cloud account connected. Verify the destination before running a backup.");
      void refreshCloudData().catch((error: unknown) => {
        setCloudError(error instanceof Error ? error.message : "Connected account, but could not refresh cloud backup data.");
      });
    } else {
      setCloudError("Cloud account authorization failed or was cancelled. Check provider configuration and try again.");
    }
  }, [searchParams, setSearchParams, canManageCloud, accessToken]);

  async function handleCloudOAuth(provider: "GOOGLE_DRIVE" | "DROPBOX" | "ONEDRIVE") {
    if (!accessToken) return;

    const authorization = await requestSensitiveAuthorization();
    if (!authorization) {
      setCloudError("Sensitive authorization was cancelled.");
      return;
    }

    setCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);
    try {
      const result = await startCloudBackupOAuth(
        { accessToken, sensitiveAuthorization: authorization },
        {
          provider,
          displayName: cloudName.trim() || (
            provider === "GOOGLE_DRIVE" ? "Google Drive backups" :
            provider === "DROPBOX" ? "Dropbox backups" : "OneDrive backups"
          ),
        },
      );
      const authorizationUrl = new URL(result.authorizationUrl);
      const allowedHosts = new Set([
        "accounts.google.com",
        "www.dropbox.com",
        "login.microsoftonline.com",
      ]);
      if (authorizationUrl.protocol !== "https:" || !allowedHosts.has(authorizationUrl.hostname)) {
        throw new Error("The server returned an unexpected OAuth authorization URL.");
      }
      window.location.assign(authorizationUrl.toString());
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Could not start cloud account authorization.");
      setCloudBusy(false);
    }
  }

  async function cloudAction(
    action: (authorization: string) => Promise<unknown>,
    success: string,
    notificationSource?: "manual",
  ) {
    let authorization: string | null;
    try {
      authorization = await requestSensitiveAuthorization();
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Sensitive authorization failed.");
      return;
    }
    if (!authorization) {
      setCloudError("Sensitive authorization was cancelled.");
      return;
    }
    setCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);
    try {
      const result = await action(authorization);
      if (notificationSource === "manual") {
        const run = result as Partial<CloudBackupRun> | null;
        if (run && typeof run.id === "string" && typeof run.status === "string") {
          knownCloudRuns.current?.set(run.id, run.status);
          publishCloudBackupNotification({
            status: run.status === "SUCCEEDED" ? "success" : run.status === "FAILED" ? "error" : "progress",
            title: "Manual cloud backup",
            message: run.status === "SUCCEEDED"
              ? "Backup completed successfully."
              : run.status === "FAILED"
                ? (run.errorMessage || "Backup failed. Check the backup run details.")
                : `Backup ${run.status.toLowerCase()}. LaundryAngel is checking its status.`,
            source: "manual",
            runId: run.id,
          });
        } else {
          publishCloudBackupNotification({
            status: "progress",
            title: "Manual cloud backup",
            message: "The backup request was accepted. LaundryAngel is checking its status.",
            source: "manual",
          });
        }
      }

      setCloudMessage(success);
      try {
        await refreshCloudData();
      } catch {
        setCloudMessage(`${success} The latest backup list could not be refreshed.`);
      }
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Cloud backup action failed.");
      if (notificationSource === "manual") {
        publishCloudBackupNotification({
          status: "error",
          title: "Manual cloud backup",
          message: error instanceof Error ? error.message : "Cloud backup action failed.",
          source: "manual",
        });
      }
      try {
        await refreshCloudData();
      } catch {
        // Preserve the original cloud-action error if refreshing also fails.
      }
    } finally {
      setCloudBusy(false);
    }
  }

  function newCloudScheduleDraft(): CloudBackupScheduleInput {
    return {
      name: "",
      enabled: false,
      frequency: "DAILY",
      dayOfWeek: 1,
      dayOfMonth: 1,
      hour: 2,
      minute: 0,
      clockFormat: "12H",
      timezone: "Africa/Lagos",
      retentionCount: 30,
      destinationConnectionId: null,
    };
  }

  function startCloudScheduleEdit(schedule?: CloudBackupSchedule) {
    cloudSchedulesDirty.current = false;
    setEditingCloudScheduleId(schedule?.id ?? null);
    setCloudScheduleDraft(schedule ? {
      name: schedule.name,
      enabled: schedule.enabled,
      frequency: schedule.frequency,
      dayOfWeek: schedule.dayOfWeek,
      dayOfMonth: schedule.dayOfMonth,
      hour: schedule.hour,
      minute: schedule.minute,
      clockFormat: schedule.clockFormat,
      timezone: schedule.timezone,
      retentionCount: schedule.retentionCount,
      destinationConnectionId: schedule.destinationConnectionId,
    } : newCloudScheduleDraft());
    setCloudError(null);
    setCloudMessage(null);
  }

  function updateCloudScheduleDraft(
    update: (current: CloudBackupScheduleInput) => CloudBackupScheduleInput,
  ) {
    cloudSchedulesDirty.current = true;
    setCloudScheduleDraft((current) => current ? update(current) : current);
  }

  async function handleCloudScheduleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !cloudScheduleDraft) return;

    const destination = cloudConnections.find(
      (connection) => connection.id === cloudScheduleDraft.destinationConnectionId,
    );
    if (cloudScheduleDraft.enabled &&
      (!destination || destination.status !== "CONNECTED" || !destination.verifiedAt)) {
      setCloudError("To enable this schedule, select a connected and verified destination.");
      return;
    }

    let authorization: string | null;
    try {
      authorization = await requestSensitiveAuthorization();
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Sensitive authorization failed.");
      return;
    }
    if (!authorization) {
      setCloudError("Sensitive authorization was cancelled.");
      return;
    }

    setCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);
    try {
      const auth = { accessToken, sensitiveAuthorization: authorization };
      const saved = editingCloudScheduleId
        ? await updateCloudBackupSchedule(editingCloudScheduleId, auth, cloudScheduleDraft)
        : await createCloudBackupSchedule(auth, cloudScheduleDraft);

      setCloudSchedules((current) => editingCloudScheduleId
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved]);
      cloudSchedulesDirty.current = false;
      setCloudScheduleDraft(null);
      setEditingCloudScheduleId(null);
      setCloudMessage(`Schedule "${saved.name}" ${editingCloudScheduleId ? "updated" : "created"}.`);
      await refreshCloudData();
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Could not save the backup schedule.");
    } finally {
      setCloudBusy(false);
    }
  }

  async function handleCloudScheduleToggle(schedule: CloudBackupSchedule) {
    await cloudAction(
      async (authorization) => {
        const updated = await updateCloudBackupSchedule(
          schedule.id,
          { accessToken, sensitiveAuthorization: authorization },
          { enabled: !schedule.enabled },
        );
        setCloudSchedules((current) => current.map((item) => item.id === updated.id ? updated : item));
        return updated;
      },
      `Schedule "${schedule.name}" ${schedule.enabled ? "paused" : "resumed"}.`,
    );
  }

  async function handleCloudScheduleDelete(schedule: CloudBackupSchedule) {
    if (!window.confirm(`Delete the schedule "${schedule.name}"? Existing backup history will be preserved.`)) {
      return;
    }
    await cloudAction(
      async (authorization) => {
        await deleteCloudBackupSchedule(schedule.id, {
          accessToken,
          sensitiveAuthorization: authorization,
        });
        setCloudSchedules((current) => current.filter((item) => item.id !== schedule.id));
      },
      `Schedule "${schedule.name}" deleted. Existing backup history is preserved.`,
    );
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

    let authorization: string | null;
    try {
      authorization = await requestSensitiveAuthorization();
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Sensitive authorization failed.");
      return;
    }
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
      cloudSettingsDirty.current = false;
      setCloudSettings(saved);
      const savedMessage = saved.enabled
        ? "Backup preferences saved. Automatic backups are enabled for the selected verified destination."
        : "Backup preferences saved. Automatic backups are disabled.";
      setCloudMessage(savedMessage);
      publishCloudBackupNotification({
        status: "success",
        title: "Cloud backup preferences saved",
        message: savedMessage,
        source: "settings",
      });
      try {
        await refreshCloudData();
      } catch {
        setCloudMessage(`${savedMessage} The latest backup list could not be refreshed.`);
      }
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
          <h2 id="cloud-backup-heading">Cloud backups</h2>
          <p>Backup artifacts are encrypted on the server before upload. Provider credentials are not displayed again after submission.</p>
          <p role="note">Scheduled backups use the configured timezone and run only while the API scheduler is running. Connect a provider, verify the destination, and then select it in the schedule preferences.</p>
          {cloudMessage && <p role="status">{cloudMessage}</p>}
          {cloudError && <p role="alert">{cloudError}</p>}

          <section aria-labelledby="cloud-oauth-heading">
            <h3 id="cloud-oauth-heading">Connect a cloud account</h3>
            <p>Choose a provider to authorize LaundryAngel. You will be redirected to the provider to approve access.</p>
            <button type="button" disabled={cloudBusy || !accessToken} onClick={() => void handleCloudOAuth("GOOGLE_DRIVE")}>Connect Google Drive</button>{" "}
            <button type="button" disabled={cloudBusy || !accessToken} onClick={() => void handleCloudOAuth("DROPBOX")}>Connect Dropbox</button>{" "}
            <button type="button" disabled={cloudBusy || !accessToken} onClick={() => void handleCloudOAuth("ONEDRIVE")}>Connect OneDrive</button>
          </section>

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
                  "Manual backup request submitted.",
                  "manual",
                );
              }}>Run backup now</button>
            </article>
          ))}

          <h3>Backup schedules ({cloudSchedules.length}/10)</h3>
          <p>Create independent daily, weekly, or monthly schedules. Each schedule has its own destination, timezone, clock display, and retention policy. Monthly dates that do not exist in a month run on that month's final day.</p>

          {cloudSchedules.length === 0 && <p>No backup schedules configured yet.</p>}
          {cloudSchedules.map((schedule) => {
            const latestRun = cloudRuns.find((run) => run.scheduleId === schedule.id);
            return (
            <article key={schedule.id} className="data-management-destination">
              <h4>{schedule.name}</h4>
              <p>
                {schedule.frequency.toLowerCase()} · {String(schedule.clockFormat === "24H" ? schedule.hour : (schedule.hour % 12 || 12)).padStart(2, "0")}:{String(schedule.minute).padStart(2, "0")}
                {schedule.clockFormat === "12H" ? (schedule.hour >= 12 ? " PM" : " AM") : ""}
                {" · "}{schedule.timezone} · Keep {schedule.retentionCount} successful backups
              </p>
              {schedule.frequency === "WEEKLY" && (
                <p>Day: {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][schedule.dayOfWeek]}</p>
              )}
              {schedule.frequency === "MONTHLY" && <p>Day of month: {schedule.dayOfMonth} (or the final day if that date does not exist)</p>}
              <p>Destination: {cloudConnections.find((connection) => connection.id === schedule.destinationConnectionId)?.displayName ?? "Not selected"}</p>
              <p>Status: {schedule.enabled ? "Enabled" : "Paused"}</p>
              <p>
                Latest run: {latestRun ? `${latestRun.status}${latestRun.completedAt ? ` · ${new Date(latestRun.completedAt).toLocaleString()}` : ""}${latestRun.errorMessage ? ` · ${latestRun.errorMessage}` : ""}` : "No runs yet"}
              </p>
              <button type="button" disabled={cloudBusy} onClick={() => startCloudScheduleEdit(schedule)}>Edit</button>{" "}
              <button type="button" disabled={cloudBusy} onClick={() => void handleCloudScheduleToggle(schedule)}>{schedule.enabled ? "Pause" : "Resume"}</button>{" "}
              <button type="button" disabled={cloudBusy} onClick={() => void handleCloudScheduleDelete(schedule)}>Delete</button>
            </article>
            );
          })}

          {!cloudScheduleDraft && (
            <button
              type="button"
              disabled={cloudBusy || cloudSchedules.length >= 10}
              onClick={() => startCloudScheduleEdit()}
            >
              Add schedule
            </button>
          )}
          {cloudSchedules.length >= 10 && !cloudScheduleDraft && (
            <p>You have reached the limit of 10 schedules for this business.</p>
          )}

          {cloudScheduleDraft && (
            <form onSubmit={handleCloudScheduleSave}>
              <h3>{editingCloudScheduleId ? "Edit backup schedule" : "New backup schedule"}</h3>
              <label>Schedule name
                <input value={cloudScheduleDraft.name} maxLength={100} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, name: e.target.value }))} required />
              </label>
              <label className="data-management-schedule-toggle">
                <input
                  type="checkbox"
                  checked={cloudScheduleDraft.enabled}
                  disabled={!cloudConnections.some((connection) => connection.id === cloudScheduleDraft.destinationConnectionId && connection.status === "CONNECTED" && Boolean(connection.verifiedAt))}
                  onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, enabled: e.target.checked }))}
                />
                <span><strong>Enable this schedule</strong><small>Only connected and verified destinations can be enabled.</small></span>
              </label>
              <label>Frequency
                <select value={cloudScheduleDraft.frequency} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, frequency: e.target.value as CloudBackupScheduleInput["frequency"] }))}>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </label>
              {cloudScheduleDraft.frequency === "WEEKLY" && (
                <label>Day of week
                  <select value={cloudScheduleDraft.dayOfWeek} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, dayOfWeek: Number(e.target.value) }))}>
                    <option value={0}>Sunday</option><option value={1}>Monday</option><option value={2}>Tuesday</option><option value={3}>Wednesday</option><option value={4}>Thursday</option><option value={5}>Friday</option><option value={6}>Saturday</option>
                  </select>
                </label>
              )}
              {cloudScheduleDraft.frequency === "MONTHLY" && (
                <label>Day of month (1–31)
                  <input type="number" min={1} max={31} value={cloudScheduleDraft.dayOfMonth} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, dayOfMonth: Number(e.target.value) }))} required />
                </label>
              )}
              <label>Time zone (IANA)
                <input value={cloudScheduleDraft.timezone} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, timezone: e.target.value }))} placeholder="Africa/Lagos" required />
              </label>
              <label>Clock display
                <select value={cloudScheduleDraft.clockFormat} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, clockFormat: e.target.value as CloudBackupScheduleInput["clockFormat"] }))}>
                  <option value="12H">12-hour (AM/PM)</option>
                  <option value="24H">24-hour</option>
                </select>
              </label>
              <div className="data-management-settings-grid">
                <label>Hour (24-hour value)
                  <input type="number" min={0} max={23} value={cloudScheduleDraft.hour} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, hour: Number(e.target.value) }))} required />
                </label>
                <label>Minute
                  <input type="number" min={0} max={59} value={cloudScheduleDraft.minute} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, minute: Number(e.target.value) }))} required />
                </label>
              </div>
              <label>Successful backups to keep (1–365)
                <input type="number" min={1} max={365} value={cloudScheduleDraft.retentionCount} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, retentionCount: Number(e.target.value) }))} required />
              </label>
              <label>Destination
                <select value={cloudScheduleDraft.destinationConnectionId ?? ""} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, destinationConnectionId: e.target.value || null }))}>
                  <option value="">Select a destination</option>
                  {cloudConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.displayName} ({connection.status}{connection.verifiedAt ? ", verified" : ""})</option>)}
                </select>
              </label>
              <button type="submit" disabled={cloudBusy || !accessToken}>{editingCloudScheduleId ? "Save schedule" : "Create schedule"}</button>{" "}
              <button type="button" disabled={cloudBusy} onClick={() => { cloudSchedulesDirty.current = false; setCloudScheduleDraft(null); setEditingCloudScheduleId(null); }}>Cancel</button>
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
