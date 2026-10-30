import { useEffect, useMemo, useRef, useState } from "react";
import { exportBackup } from "../lib/data-management-api.js";
import { useAuthStore } from "../state/auth-store.js";

type Frequency = "DAILY" | "WEEKLY" | "MONTHLY";
type LocalBackupHistory = {
  id: string;
  fileName: string;
  savedAt: string;
  trigger: "MANUAL" | "SCHEDULED";
  scheduleName?: string;
};
type LocalBackupSchedule = {
  id: string;
  name: string;
  frequency: Frequency;
  hour: number;
  minute: number;
  dayOfWeek: number;
  dayOfMonth: number;
  enabled: boolean;
  lastRunKey?: string;
};
type LocalDirectoryHandle = {
  name: string;
  getFileHandle: (name: string, options: { create: boolean }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
  queryPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
};
type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<LocalDirectoryHandle>;
};

function backupFilename() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `LaundryAngel_Backup_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${Date.now()}.laundry-backup`;
}

function scheduleStorageKey(businessId: string) {
  return `laundryangel.localBackupSchedules.${businessId}`;
}

function folderStorageKey(businessId: string) {
  return `laundryangel.localBackupFolder.${businessId}`;
}

function historyStorageKey(businessId: string) {
  return `laundryangel.localBackupHistory.${businessId}`;
}

function openFolderDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser cannot remember a selected backup folder."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("LaundryAngelLocalBackups", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("folders")) {
        request.result.createObjectStore("folders");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local folder storage."));
  });
}

async function storeFolderHandle(key: string, handle: LocalDirectoryHandle) {
  const database = await openFolderDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("folders", "readwrite");
    transaction.objectStore("folders").put(handle, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not remember the selected folder."));
  });
  database.close();
}

async function readFolderHandle(key: string): Promise<LocalDirectoryHandle | null> {
  const database = await openFolderDatabase();
  const handle = await new Promise<LocalDirectoryHandle | null>((resolve, reject) => {
    const request = database.transaction("folders", "readonly").objectStore("folders").get(key);
    request.onsuccess = () => resolve((request.result as LocalDirectoryHandle | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not restore the selected folder."));
  });
  database.close();
  return handle;
}

async function writeBackupToFolder(handle: LocalDirectoryHandle, blob: Blob) {
  const filename = backupFilename();
  const file = await handle.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
  return filename;
}

function downloadBackup(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = backupFilename();
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return anchor.download;
}

function readHistory(key: string): LocalBackupHistory[] {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readSchedules(key: string): LocalBackupSchedule[] {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isScheduleDue(schedule: LocalBackupSchedule, now: Date) {
  if (!schedule.enabled) return false;
  if (schedule.frequency === "WEEKLY" && schedule.dayOfWeek !== now.getDay()) return false;
  if (schedule.frequency === "MONTHLY" && schedule.dayOfMonth !== now.getDate()) return false;
  const scheduledMinute = schedule.hour * 60 + schedule.minute;
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  return currentMinute >= scheduledMinute && schedule.lastRunKey !== dateKey(now);
}

export function LocalBackupManager() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const businessId = user?.businessId ?? user?.id ?? "default";
  const scheduleKey = useMemo(() => scheduleStorageKey(businessId), [businessId]);
  const folderKey = useMemo(() => folderStorageKey(businessId), [businessId]);
  const historyKey = useMemo(() => historyStorageKey(businessId), [businessId]);
  const [backupPassword, setBackupPassword] = useState("");
  const [folderHandle, setFolderHandle] = useState<LocalDirectoryHandle | null>(null);
  const [schedules, setSchedules] = useState<LocalBackupSchedule[]>(() => readSchedules(scheduleStorageKey(businessId)));
  const [history, setHistory] = useState<LocalBackupHistory[]>(() => readHistory(historyStorageKey(businessId)));
  const [scheduleDraft, setScheduleDraft] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftFrequency, setDraftFrequency] = useState<Frequency>("DAILY");
  const [draftTime, setDraftTime] = useState("02:00");
  const [draftDayOfWeek, setDraftDayOfWeek] = useState(1);
  const [draftDayOfMonth, setDraftDayOfMonth] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const schedulerBusy = useRef(false);
  const folderPickerAvailable = typeof (window as WindowWithDirectoryPicker).showDirectoryPicker === "function";

  useEffect(() => {
    setSchedules(readSchedules(scheduleKey));
    setHistory(readHistory(historyKey));
    let cancelled = false;
    void readFolderHandle(folderKey).then((handle) => {
      if (!cancelled) setFolderHandle(handle);
    }).catch(() => {
      if (!cancelled) setMessage("Choose your backup folder again to restore local folder access.");
    });
    return () => { cancelled = true; };
  }, [folderKey, historyKey, scheduleKey]);

  useEffect(() => {
    window.localStorage.setItem(scheduleKey, JSON.stringify(schedules));
  }, [scheduleKey, schedules]);

  useEffect(() => {
    window.localStorage.setItem(historyKey, JSON.stringify(history));
  }, [historyKey, history]);

  async function chooseFolder() {
    const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;
    if (!picker) {
      setError("Remembered folder access requires a supported browser on a secure HTTPS connection. Use the normal download option for manual backups.");
      return;
    }
    try {
      const handle = await picker({ mode: "readwrite" });
      const permission = await handle.requestPermission?.({ mode: "readwrite" });
      if (permission === "denied") {
        setError("Folder permission was denied. Choose a folder and allow LaundryAngel to save backups.");
        return;
      }
      await storeFolderHandle(folderKey, handle);
      setFolderHandle(handle);
      setError(null);
      setMessage(`Local backups will be saved to “${handle.name}”. This folder is remembered on this device and browser.`);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Could not select the local backup folder.");
    }
  }

  async function runManualBackup() {
    if (!accessToken || backupPassword.length < 12) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const blob = await exportBackup(backupPassword, { accessToken });
      let fileName: string;
      if (folderHandle) {
        const permission = await folderHandle.requestPermission?.({ mode: "readwrite" });
        if (permission === "denied") throw new Error("Folder access was denied. Choose the folder again and grant permission.");
        fileName = await writeBackupToFolder(folderHandle, blob);
        setMessage(`Encrypted local backup saved to “${folderHandle.name}”.`);
      } else {
        fileName = downloadBackup(blob);
        setMessage("Encrypted backup download started. Choose a folder on supported browsers to remember a local destination.");
      }
      setHistory((current) => [{ id: `local-history-${Date.now()}`, fileName, savedAt: new Date().toISOString(), trigger: "MANUAL" }, ...current].slice(0, 20));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Local backup could not be created.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!accessToken || !backupPassword || !folderHandle || !schedules.some((schedule) => schedule.enabled)) return;
    let cancelled = false;
    const runDueSchedules = async () => {
      if (schedulerBusy.current || cancelled) return;
      const now = new Date();
      const due = schedules.filter((schedule) => isScheduleDue(schedule, now));
      if (!due.length) return;
      schedulerBusy.current = true;
      try {
        const permission = await folderHandle.queryPermission?.({ mode: "readwrite" });
        if (permission !== "granted") {
          setMessage("A local backup schedule is due. Reopen this page and grant folder access to continue.");
          return;
        }
        for (const schedule of due) {
          if (cancelled) break;
          const blob = await exportBackup(backupPassword, { accessToken });
          const fileName = await writeBackupToFolder(folderHandle, blob);
          setHistory((current) => [{ id: `local-history-${Date.now()}-${schedule.id}`, fileName, savedAt: now.toISOString(), trigger: "SCHEDULED", scheduleName: schedule.name }, ...current].slice(0, 20));
          const key = dateKey(now);
          setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, lastRunKey: key } : item));
          setMessage(`Local schedule “${schedule.name}” completed and saved to “${folderHandle.name}”.`);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "A scheduled local backup could not be saved.");
      } finally {
        schedulerBusy.current = false;
      }
    };
    void runDueSchedules();
    const interval = window.setInterval(() => { void runDueSchedules(); }, 30_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [accessToken, backupPassword, folderHandle, schedules]);

  function startScheduleEdit(schedule?: LocalBackupSchedule) {
    setEditingScheduleId(schedule?.id ?? null);
    setDraftName(schedule?.name ?? "");
    setDraftFrequency(schedule?.frequency ?? "DAILY");
    setDraftTime(schedule ? `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}` : "02:00");
    setDraftDayOfWeek(schedule?.dayOfWeek ?? 1);
    setDraftDayOfMonth(schedule?.dayOfMonth ?? 1);
    setScheduleDraft(true);
  }

  function addSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftName.trim() || (!editingScheduleId && schedules.length >= 10)) return;
    const [hour, minute] = draftTime.split(":").map(Number);
    if (editingScheduleId) {
      setSchedules((current) => current.map((item) => item.id === editingScheduleId
        ? { ...item, name: draftName.trim(), frequency: draftFrequency, hour, minute, dayOfWeek: draftDayOfWeek, dayOfMonth: draftDayOfMonth }
        : item));
      setMessage("Local backup schedule updated.");
    } else {
      setSchedules((current) => [...current, {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: draftName.trim(),
        frequency: draftFrequency,
        hour,
        minute,
        dayOfWeek: draftDayOfWeek,
        dayOfMonth: draftDayOfMonth,
        enabled: true,
      }]);
      setMessage("Local backup schedule saved on this device.");
    }
    setDraftName("");
    setEditingScheduleId(null);
    setScheduleDraft(false);
  }

  return (
    <section className="data-management-local-backup" aria-labelledby="local-backup-heading">
      <div className="data-management-local-header">
        <div>
          <span className="data-management-eyebrow">ON-DEVICE PROTECTION</span>
          <h2 id="local-backup-heading">Instant Local Backup</h2>
          <p>Create an encrypted backup on this device, then schedule repeat local saves.</p>
        </div>
        <span className="data-management-local-lock">⌑ Device storage</span>
      </div>

      <div className="data-management-local-destination">
        <div className="data-management-local-folder">
          <span aria-hidden="true">▣</span>
          <div><strong>{folderHandle ? folderHandle.name : "No local folder selected"}</strong><small>{folderHandle ? "Remembered on this device and browser" : folderPickerAvailable ? "Choose a folder to use it as your default destination" : "Requires a supported browser and secure HTTPS connection"}</small></div>
        </div>
        <button className="data-management-button data-management-button-secondary" type="button" onClick={() => void chooseFolder()}>{folderHandle ? "Change folder" : "Choose backup folder"}</button>
      </div>

      <div className="data-management-local-manual">
        <label>Backup encryption password
          <input type="password" autoComplete="new-password" minLength={12} placeholder="At least 12 characters" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} />
        </label>
        <button className="data-management-button data-management-button-manual" type="button" disabled={busy || !accessToken || backupPassword.length < 12} onClick={() => void runManualBackup()}>{busy ? "Creating backup…" : "↓ Create local backup"}</button>
      </div>

      {message && <p className="data-management-feedback" role="status">{message}</p>}
      {error && <p className="data-management-feedback data-management-feedback-error" role="alert">{error}</p>}

      <div className="data-management-local-schedules">
        <div className="data-management-subsection-heading">
          <div><h3>Local backup schedules <span className="data-management-count">{schedules.length}/10</span></h3><p>{schedules.filter((schedule) => schedule.enabled).length} active · runs while this page is open and the folder is accessible</p></div>
          <button className="data-management-button data-management-button-secondary" type="button" disabled={schedules.length >= 10 || !folderPickerAvailable} onClick={() => { if (scheduleDraft) { setScheduleDraft(false); setEditingScheduleId(null); } else { startScheduleEdit(); } }}>{scheduleDraft ? "Cancel" : "＋ Add local schedule"}</button>
        </div>
        {schedules.length > 0 && <div className="data-management-local-schedule-list">
          {schedules.map((schedule) => <article className="data-management-local-schedule" key={schedule.id}>
            <div><strong>{schedule.name}</strong><span>{schedule.frequency.toLowerCase()} · {String(schedule.hour).padStart(2, "0")}:{String(schedule.minute).padStart(2, "0")}{schedule.frequency === "WEEKLY" ? ` · ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][schedule.dayOfWeek]}` : ""}{schedule.frequency === "MONTHLY" ? ` · Day ${schedule.dayOfMonth}` : ""}</span></div>
            <div className="data-management-inline-actions"><span className={schedule.enabled ? "data-management-status-enabled" : "data-management-status-paused"}>{schedule.enabled ? "Enabled" : "Paused"}</span><button type="button" onClick={() => startScheduleEdit(schedule)}>Edit</button><button type="button" onClick={() => setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, enabled: !item.enabled } : item))}>{schedule.enabled ? "Pause" : "Resume"}</button><button type="button" className="data-management-danger-action" onClick={() => setSchedules((current) => current.filter((item) => item.id !== schedule.id))}>Delete</button></div>
          </article>)}
        </div>}
        {scheduleDraft && <form className="data-management-schedule-editor" onSubmit={addSchedule}>
          <h4>{editingScheduleId ? "Edit local backup schedule" : "New local backup schedule"}</h4>
          <div className="data-management-settings-grid">
            <label>Schedule name<input value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={80} placeholder="e.g. Daily office backup" required /></label>
            <label>Frequency<select value={draftFrequency} onChange={(event) => setDraftFrequency(event.target.value as Frequency)}><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></label>
            <label>Time<input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} required /></label>
            {draftFrequency === "WEEKLY" && <label>Day of week<select value={draftDayOfWeek} onChange={(event) => setDraftDayOfWeek(Number(event.target.value))}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label>}
            {draftFrequency === "MONTHLY" && <label>Day of month<input type="number" min={1} max={31} value={draftDayOfMonth} onChange={(event) => setDraftDayOfMonth(Number(event.target.value))} required /></label>}
          </div>
          <div className="data-management-inline-actions"><button className="data-management-button data-management-button-primary" type="submit">{editingScheduleId ? "Save changes" : "Save local schedule"}</button><button type="button" onClick={() => { setScheduleDraft(false); setEditingScheduleId(null); }}>Cancel</button></div>
        </form>}
        <div className="data-management-local-history">
          <div className="data-management-local-history-heading"><h4>Recent local backup activity</h4><span>{history.length} recent entries</span></div>
          {history.length ? <ul>{history.slice(0, 6).map((item) => <li key={item.id}>
            <div><strong>{item.trigger === "SCHEDULED" ? item.scheduleName ?? "Scheduled backup" : "Manual backup / download"}</strong><span>{new Date(item.savedAt).toLocaleString()}</span></div>
            <small>{item.fileName}</small>
          </li>)}</ul> : <p>No local backups have been saved on this device yet.</p>}
        </div>
        <p className="data-management-local-note">Local schedules are stored on this device. They run only while the Data Management page remains open, the backup password is entered, and the browser grants access to the selected folder. They do not run while the browser or app is closed. The password is never saved in browser storage. Folder scheduling requires HTTPS and a browser with folder access; on unsupported devices, manual backups use the normal download flow.</p>
      </div>
    </section>
  );
}
