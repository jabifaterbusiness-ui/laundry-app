import { useEffect, useRef, useState } from "react";
import { publishCloudBackupNotification } from "../lib/cloud-backup-notifications.js";
import { ApiError } from "../lib/api-client.js";
import {
  analyzeMigration, getMigrationJob, importMigrationJob, restoreBackup,
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
import { LocalBackupManager } from "../components/data-management/LocalBackupManager.js";

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
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({});
  const [manualDestinationId, setManualDestinationId] = useState("");

  const togglePanel = (panel: string) => {
    setExpandedPanels((current) => ({ ...current, [panel]: !current[panel] }));
  };
  const panelIsOpen = (panel: string) => Boolean(expandedPanels[panel]);
  const verifiedCloudConnections = cloudConnections.filter(
    (connection) => connection.status === "CONNECTED" && Boolean(connection.verifiedAt),
  );
  const cloudProviders = [
    { provider: "GOOGLE_DRIVE" as const, label: "Google Drive", description: "Back up securely to your Google account." },
    { provider: "DROPBOX" as const, label: "Dropbox", description: "Keep encrypted backups in Dropbox." },
    { provider: "ONEDRIVE" as const, label: "OneDrive", description: "Store encrypted backups in Microsoft OneDrive." },
  ].map((item) => ({
    ...item,
    connections: cloudConnections.filter((connection) => connection.provider === item.provider),
  }));

  useEffect(() => {
    const verified = cloudConnections.filter(
      (connection) => connection.status === "CONNECTED" && Boolean(connection.verifiedAt),
    );
    const selectedIsReady = verified.some((connection) => connection.id === manualDestinationId);
    if (!selectedIsReady) {
      setManualDestinationId(verified[0]?.id ?? "");
    }
  }, [cloudConnections, manualDestinationId]);


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
      <header className="data-management-header">
        <div>
          <span className="data-management-eyebrow">LAUNDRYANGEL · DATA PROTECTION</span>
          <h1>Backup &amp; Data Migration</h1>
          <p>Import existing records, protect your business data and manage secure cloud backups.</p>
        </div>
        <div className="data-management-header-meta">
          <span className="data-management-secure-pill"><span aria-hidden="true">●</span> Encrypted backup tools</span>
        </div>
      </header>

      {message && <p className="data-management-feedback" role="status">{message}</p>}

      <section className="data-management-tools" aria-label="Backup and migration tools">
        <div className="data-management-section-heading">
          <div>
            <span className="data-management-eyebrow">LOCAL BACKUP TOOLS</span>
            <h2>Import, export &amp; restore</h2>
            <p>Choose a task below. Each tool opens only when you need it.</p>
          </div>
        </div>

        <article className="data-management-tool-card data-management-tool-import">
          <div className="data-management-tool-heading">
            <h3 className="data-management-tool-semantic-heading">
            <button
              type="button"
              className="data-management-heading-toggle"
              aria-expanded={panelIsOpen("import")}
              aria-controls="data-management-import-panel"
              title="Supported: DBF/FoxPro, CSV, JSON and Excel workbooks. ZIP backups containing these files are inspected automatically."
              data-tooltip="Supported: DBF/FoxPro, CSV, JSON and Excel workbooks. ZIP backups are inspected automatically."
              onClick={() => togglePanel("import")}
            >
              <span className="data-management-tool-icon" aria-hidden="true">⇧</span>
              <span className="data-management-tool-title">
                <strong>Import from previous software</strong>
                <small>Bring customer records across from another laundry system</small>
              </span>
              <span className="data-management-chevron" aria-hidden="true">{panelIsOpen("import") ? "−" : "+"}</span>
            </button>
            </h3>
            <button className="data-management-button data-management-button-primary" type="button" disabled={!migrationFile || busy} onClick={handleAnalyze}>Analyze backup</button>
          </div>
          <div id="data-management-import-panel" className="data-management-tool-content" hidden={!panelIsOpen("import")}>
            <p>Supported formats: DBF/FoxPro, CSV, JSON and Excel workbooks. ZIP backups containing these files are inspected automatically.</p>
            <label className="data-management-file-label">Choose a backup file
              <input type="file" accept=".zip,.dbf,.csv,.json,.xlsx,.xls" onChange={(e) => setMigrationFile(e.target.files?.[0] ?? null)} />
            </label>
            {migrationFile && <p className="data-management-selected-file">Selected: {migrationFile.name}</p>}
            {analysis?.summary && (
              <div className="data-management-preview">
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
                    <p>Review the detected fields before importing.</p>
                    {(["firstName", "lastName", "name", "phone", "email", "address", "notes"] as const).map((field) => (
                      <label key={field}>{field}
                        <select value={customerMapping[field] ?? ""} onChange={(e) => setCustomerMapping((current) => ({ ...current, [field]: e.target.value || undefined }))}>
                          <option value="">Not mapped</option>
                          {analysis.summary.customerHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
                <label>Duplicate handling
                  <select value={duplicatePolicy} onChange={(e) => setDuplicatePolicy(e.target.value as typeof duplicatePolicy)}>
                    <option value="skip">Skip existing customers</option>
                    <option value="merge">Merge missing information into existing customers</option>
                    <option value="create">Create duplicates as separate customers</option>
                  </select>
                </label>
                <button className="data-management-button data-management-button-primary" type="button" disabled={busy || analysis.summary.supported.customers === 0} onClick={handleImport}>Confirm &amp; import</button>
              </div>
            )}
          </div>
        </article>

        {canRestore && (
          <>
            <LocalBackupManager key={user?.businessId ?? user?.id ?? "default"} />

            <article className="data-management-tool-card data-management-tool-restore">
              <div className="data-management-tool-heading">
                <h3 className="data-management-tool-semantic-heading">
                <button type="button" className="data-management-heading-toggle" aria-expanded={panelIsOpen("restore")} aria-controls="data-management-restore-panel" title="Restore is merge-only. It does not delete current data or overwrite passwords and security access." data-tooltip="Merge-only restore. Existing data and staff security credentials are protected." onClick={() => togglePanel("restore")}>
                  <span className="data-management-tool-icon" aria-hidden="true">↻</span>
                  <span className="data-management-tool-title"><strong>Restore encrypted backup</strong><small>Safely merge data from a previous LaundryAngel backup</small></span>
                  <span className="data-management-chevron" aria-hidden="true">{panelIsOpen("restore") ? "−" : "+"}</span>
                </button>
                </h3>
                <button className="data-management-button data-management-button-warning" type="button" disabled={busy || !restoreFile || restorePassword.length < 12} onClick={handleRestore}>Restore backup</button>
              </div>
              <div id="data-management-restore-panel" className="data-management-tool-content" hidden={!panelIsOpen("restore")}>
                <p>Restore is merge-only: it never deletes current data, never overwrites passwords or security access, and restores the operational business dataset transactionally.</p>
                <label>Choose encrypted backup
                  <input type="file" accept=".laundry-backup" onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)} />
                </label>
                {restoreFile && <p className="data-management-selected-file">Selected: {restoreFile.name}</p>}
                <label>Backup password
                  <input type="password" autoComplete="new-password" placeholder="At least 12 characters" value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} />
                </label>
              </div>
            </article>
          </>
        )}
      </section>

      {canManageCloud && (
        <section className="data-management-cloud" aria-labelledby="cloud-backup-heading">
          <div className="data-management-cloud-header">
            <div>
              <span className="data-management-eyebrow">AUTOMATED &amp; OFF-SITE PROTECTION</span>
              <h2 id="cloud-backup-heading">Cloud backups</h2>
              <p>Backup files are encrypted on the server before upload. Provider credentials are never shown again after submission.</p>
            </div>
            <span className="data-management-cloud-lock" aria-label="Encrypted cloud backups">⌑ Encrypted</span>
          </div>

          {cloudMessage && <p className="data-management-feedback" role="status">{cloudMessage}</p>}
          {cloudError && <p className="data-management-feedback data-management-feedback-error" role="alert">{cloudError}</p>}

          <div className="data-management-cloud-provider-panel">
            <div className="data-management-section-heading">
              <div><h3>Connect a cloud provider</h3><p>Choose where LaundryAngel should store encrypted backups.</p></div>
            </div>
            <div className="data-management-provider-grid">
              {cloudProviders.map((provider) => {
                const connected = provider.connections.filter((connection) => connection.status === "CONNECTED");
                const ready = provider.connections.filter((connection) => connection.status === "CONNECTED" && Boolean(connection.verifiedAt));
                const hasErrors = provider.connections.some((connection) => connection.status === "ERROR");
                return (
                  <article className="data-management-provider-card" key={provider.provider}>
                    <div className={`data-management-provider-mark data-management-provider-${provider.provider.toLowerCase()}`} aria-hidden="true">
                      {provider.provider === "GOOGLE_DRIVE" ? "G" : provider.provider === "DROPBOX" ? "▦" : "◫"}
                    </div>
                    <div className="data-management-provider-copy">
                      <h4>{provider.label}</h4>
                      <p>{provider.description}</p>
                      <span className={`data-management-provider-status ${ready.length ? "is-ready" : hasErrors ? "has-error" : connected.length ? "is-connected" : "is-idle"}`}>
                        {ready.length ? `${ready.length} verified connection${ready.length === 1 ? "" : "s"}` : hasErrors ? "Needs attention" : connected.length ? "Connected · verification needed" : "Not connected"}
                      </span>
                    </div>
                    <button className="data-management-button data-management-button-connect" type="button" disabled={cloudBusy || !accessToken} onClick={() => void handleCloudOAuth(provider.provider)}>
                      {connected.length ? "Connect another " + provider.label + " account" : "Connect " + provider.label}
                    </button>
                    {provider.connections.length > 0 && (
                      <button className="data-management-provider-details" type="button" aria-expanded={panelIsOpen(provider.provider)} onClick={() => togglePanel(provider.provider)}>
                        {provider.connections.length} saved account{provider.connections.length === 1 ? "" : "s"} · {panelIsOpen(provider.provider) ? "Hide details" : "View details"}
                      </button>
                    )}
                    {panelIsOpen(provider.provider) && provider.connections.length > 0 && (
                      <div className="data-management-provider-accounts">
                        {provider.connections.map((connection) => (
                          <div className="data-management-account-row" key={connection.id}>
                            <div>
                              <strong>{connection.displayName}{provider.connections.filter((item) => item.displayName === connection.displayName).length > 1 ? " · Account " + (provider.connections.filter((item) => item.displayName === connection.displayName).findIndex((item) => item.id === connection.id) + 1) : ""}</strong>
                              <span>{connection.status}{connection.verifiedAt ? ` · Verified ${new Date(connection.verifiedAt).toLocaleString()}` : ""}</span>
                              {connection.lastError && <small role="alert">{connection.lastError}</small>}
                            </div>
                            <div className="data-management-inline-actions">
                              <button type="button" disabled={cloudBusy || !accessToken} onClick={() => void cloudAction(
                                (authorization) => verifyCloudBackupConnection(connection.id, { accessToken, sensitiveAuthorization: authorization }),
                                "Destination verification completed.",
                              )}>Verify</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>

          <div className="data-management-manual-backup">
            <div>
              <span className="data-management-eyebrow">ON-DEMAND PROTECTION</span>
              <h3>Instant Cloud Backup</h3>
              <p>Start an encrypted cloud backup immediately, without waiting for its separate schedule.</p>
            </div>
            <div className="data-management-manual-controls">
              <label className="data-management-destination-select">Save backup to
                <select value={manualDestinationId} onChange={(e) => setManualDestinationId(e.target.value)} disabled={!verifiedCloudConnections.length}>
                  <option value="">Choose a verified destination</option>
                  {verifiedCloudConnections.map((connection) => {
                    const matching = verifiedCloudConnections.filter((item) => item.provider === connection.provider && item.displayName === connection.displayName);
                    const accountNumber = matching.findIndex((item) => item.id === connection.id) + 1;
                    return <option key={connection.id} value={connection.id}>{connection.displayName}{matching.length > 1 ? " · Account " + accountNumber : ""} · {connection.provider.replace("_", " ")}</option>;
                  })}
                </select>
              </label>
              <button className="data-management-button data-management-button-manual" type="button" disabled={cloudBusy || !accessToken || !manualDestinationId} onClick={() => {
                const destination = verifiedCloudConnections.find((connection) => connection.id === manualDestinationId);
                if (!destination) return;
                void cloudAction(
                  (authorization) => createCloudBackupRun(destination.id, { accessToken, sensitiveAuthorization: authorization }),
                  "Manual backup request submitted.",
                  "manual",
                );
              }}>▶ Run instant backup</button>
            </div>
          </div>

          <div className="data-management-subsection">
            <div className="data-management-subsection-heading">
              <div><h3>Custom storage destination</h3><p>Optional S3-compatible storage for advanced setups.</p></div>
              <button className="data-management-button data-management-button-secondary" type="button" aria-expanded={panelIsOpen("custom-storage")} onClick={() => togglePanel("custom-storage")}>{panelIsOpen("custom-storage") ? "Close" : "Add destination"}</button>
            </div>
            <form className="data-management-custom-form" hidden={!panelIsOpen("custom-storage")} onSubmit={handleCloudCreate}>
              <div className="data-management-settings-grid">
                <label>Destination name<input value={cloudName} onChange={(e) => setCloudName(e.target.value)} required /></label>
                <label>Endpoint URL<input type="url" value={cloudEndpoint} onChange={(e) => setCloudEndpoint(e.target.value)} placeholder="https://storage.example.com" required /></label>
                <label>Region<input value={cloudRegion} onChange={(e) => setCloudRegion(e.target.value)} required /></label>
                <label>Bucket<input value={cloudBucket} onChange={(e) => setCloudBucket(e.target.value)} required /></label>
                <label>Access key ID<input autoComplete="off" value={cloudKey} onChange={(e) => setCloudKey(e.target.value)} required /></label>
                <label>Secret access key<input type="password" autoComplete="new-password" value={cloudSecret} onChange={(e) => setCloudSecret(e.target.value)} required /></label>
              </div>
              <button className="data-management-button data-management-button-primary" type="submit" disabled={cloudBusy || !accessToken}>Save custom destination</button>
            </form>
            {cloudConnections.some((connection) => connection.provider === "S3_COMPATIBLE") && (
              <div className="data-management-custom-accounts">
                <h4>Saved custom destinations</h4>
                {cloudConnections.filter((connection) => connection.provider === "S3_COMPATIBLE").map((connection) => (
                  <div className="data-management-account-row" key={connection.id}>
                    <div><strong>{connection.displayName}</strong><span>{connection.status}{connection.verifiedAt ? " · Verified " + new Date(connection.verifiedAt).toLocaleString() : ""}</span>{connection.lastError && <small role="alert">{connection.lastError}</small>}</div>
                    <div className="data-management-inline-actions">
                      <button type="button" disabled={cloudBusy || !accessToken} onClick={() => void cloudAction((authorization) => verifyCloudBackupConnection(connection.id, { accessToken, sensitiveAuthorization: authorization }), "Destination verification completed.")}>Verify</button>
                      
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="data-management-subsection">
            <div className="data-management-subsection-heading">
              <div><h3>Backup schedules <span className="data-management-count">{cloudSchedules.length}/10</span></h3><p>{cloudSchedules.filter((schedule) => schedule.enabled).length} active · {cloudSchedules.length} configured · Daily, weekly or monthly</p></div>
              <div className="data-management-inline-actions">
                <button className="data-management-button data-management-button-secondary" type="button" aria-expanded={panelIsOpen("schedules")} onClick={() => togglePanel("schedules")}>{panelIsOpen("schedules") ? "Hide schedules" : "View schedules"}</button>
                <button className="data-management-button data-management-button-primary" type="button" disabled={cloudBusy || cloudSchedules.length >= 10} onClick={() => { setExpandedPanels((current) => ({ ...current, schedules: true })); startCloudScheduleEdit(); }}>＋ Add schedule</button>
              </div>
            </div>
            {panelIsOpen("schedules") && (
              <>
                {cloudSchedules.length === 0 && <p className="data-management-empty">No schedules configured yet. Add a schedule to automate encrypted backups.</p>}
            <div className="data-management-schedule-grid">
              {cloudSchedules.map((schedule) => {
                const latestRun = cloudRuns.find((run) => run.scheduleId === schedule.id);
                const clock = String(schedule.clockFormat === "24H" ? schedule.hour : (schedule.hour % 12 || 12)).padStart(2, "0") + ":" + String(schedule.minute).padStart(2, "0") + (schedule.clockFormat === "12H" ? (schedule.hour >= 12 ? " PM" : " AM") : "");
                return (
                  <article key={schedule.id} className="data-management-schedule-card">
                    <div className="data-management-schedule-card-top">
                      <div><h4>{schedule.name}</h4><span className={schedule.enabled ? "data-management-status-enabled" : "data-management-status-paused"}>{schedule.enabled ? "● Enabled" : "Ⅱ Paused"}</span></div>
                      <span className="data-management-schedule-frequency">{schedule.frequency.toLowerCase()}</span>
                    </div>
                    <p className="data-management-schedule-time">{clock} <span>·</span> {schedule.timezone}</p>
                    <p>Keep {schedule.retentionCount} successful backups · {cloudConnections.find((connection) => connection.id === schedule.destinationConnectionId)?.displayName ?? "No destination"}</p>
                    <small>Latest run: {latestRun ? latestRun.status + (latestRun.completedAt ? " · " + new Date(latestRun.completedAt).toLocaleString() : "") : "No runs yet"}</small>
                    <div className="data-management-inline-actions">
                      <button type="button" disabled={cloudBusy} onClick={() => startCloudScheduleEdit(schedule)}>Edit</button>
                      <button type="button" disabled={cloudBusy} onClick={() => void handleCloudScheduleToggle(schedule)}>{schedule.enabled ? "Pause" : "Resume"}</button>
                      <button type="button" className="data-management-danger-action" disabled={cloudBusy} onClick={() => void handleCloudScheduleDelete(schedule)}>Delete</button>
                    </div>
                  </article>
                );
              })}
            </div>
            {cloudSchedules.length >= 10 && <p className="data-management-empty">You have reached the limit of 10 schedules for this business.</p>}
            {cloudScheduleDraft && (
              <form className="data-management-schedule-editor" onSubmit={handleCloudScheduleSave}>
                <h4>{editingCloudScheduleId ? "Edit backup schedule" : "New backup schedule"}</h4>
                <div className="data-management-settings-grid">
                  <label>Schedule name<input value={cloudScheduleDraft.name} maxLength={100} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, name: e.target.value }))} required /></label>
                  <label>Frequency<select value={cloudScheduleDraft.frequency} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, frequency: e.target.value as CloudBackupScheduleInput["frequency"] }))}><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></label>
                  {cloudScheduleDraft.frequency === "WEEKLY" && <label>Day of week<select value={cloudScheduleDraft.dayOfWeek} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, dayOfWeek: Number(e.target.value) }))}><option value={0}>Sunday</option><option value={1}>Monday</option><option value={2}>Tuesday</option><option value={3}>Wednesday</option><option value={4}>Thursday</option><option value={5}>Friday</option><option value={6}>Saturday</option></select></label>}
                  {cloudScheduleDraft.frequency === "MONTHLY" && <label>Day of month<input type="number" min={1} max={31} value={cloudScheduleDraft.dayOfMonth} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, dayOfMonth: Number(e.target.value) }))} required /></label>}
                  <label>Time zone<input value={cloudScheduleDraft.timezone} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, timezone: e.target.value }))} placeholder="Africa/Lagos" required /></label>
                  <label>Clock display<select value={cloudScheduleDraft.clockFormat} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, clockFormat: e.target.value as CloudBackupScheduleInput["clockFormat"] }))}><option value="12H">12-hour (AM/PM)</option><option value="24H">24-hour</option></select></label>
                  <label>Hour<input type="number" min={0} max={23} value={cloudScheduleDraft.hour} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, hour: Number(e.target.value) }))} required /></label>
                  <label>Minute<input type="number" min={0} max={59} value={cloudScheduleDraft.minute} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, minute: Number(e.target.value) }))} required /></label>
                  <label>Successful backups to keep<input type="number" min={1} max={365} value={cloudScheduleDraft.retentionCount} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, retentionCount: Number(e.target.value) }))} required /></label>
                  <label>Destination<select value={cloudScheduleDraft.destinationConnectionId ?? ""} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, destinationConnectionId: e.target.value || null }))}><option value="">Select a destination</option>{cloudConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.displayName} ({connection.status}{connection.verifiedAt ? ", verified" : ""})</option>)}</select></label>
                </div>
                <label className="data-management-schedule-toggle"><input type="checkbox" checked={cloudScheduleDraft.enabled} disabled={!cloudConnections.some((connection) => connection.id === cloudScheduleDraft.destinationConnectionId && connection.status === "CONNECTED" && Boolean(connection.verifiedAt))} onChange={(e) => updateCloudScheduleDraft((current) => ({ ...current, enabled: e.target.checked }))} /><span><strong>Enable this schedule</strong><small>Only connected and verified destinations can be enabled.</small></span></label>
                <div className="data-management-inline-actions"><button className="data-management-button data-management-button-primary" type="submit" disabled={cloudBusy || !accessToken}>{editingCloudScheduleId ? "Save schedule" : "Create schedule"}</button><button type="button" disabled={cloudBusy} onClick={() => { cloudSchedulesDirty.current = false; setCloudScheduleDraft(null); setEditingCloudScheduleId(null); }}>Cancel</button></div>
              </form>
            )}
              </>
            )}
          </div>

          <div className="data-management-subsection data-management-history">
            <div className="data-management-subsection-heading">
              <div><h3>Recent cloud backup runs <span className="data-management-count">{cloudRuns.length}</span></h3><p>Review completed and failed backup activity.</p></div>
              <button className="data-management-button data-management-button-secondary" type="button" aria-expanded={panelIsOpen("history")} onClick={() => togglePanel("history")}>{panelIsOpen("history") ? "Hide history" : "View history"}</button>
            </div>
            {panelIsOpen("history") && (cloudRuns.length === 0 ? <p className="data-management-empty">No cloud backup runs yet.</p> : (
              <div className="data-management-table-wrap">
                <table>
                  <thead><tr><th>Created</th><th>Status</th><th>Size</th><th>Checksum</th><th>Details</th></tr></thead>
                  <tbody>{cloudRuns.map((run) => (
                    <tr key={run.id}>
                      <td>{new Date(run.createdAt).toLocaleString()}</td>
                      <td><span className={`data-management-run-status data-management-run-${run.status.toLowerCase()}`}>{run.status}</span></td>
                      <td>{run.sizeBytes ? (Number(run.sizeBytes) / 1024).toFixed(1) + " KB" : "—"}</td>
                      <td className="data-management-checksum">{run.checksumSha256 ?? "—"}</td>
                      <td>{run.errorMessage ?? run.storageKey ?? "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ))}
          </div>
          <p className="data-management-cloud-footnote">Scheduled backups use the configured timezone and run only while the API scheduler is running.</p>
        </section>
      )}
    </main>
  );
}
