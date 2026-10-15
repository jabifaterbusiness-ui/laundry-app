export const CLOUD_BACKUP_NOTIFICATION_EVENT = "cloud-backup:notification";

export type CloudBackupNotification = {
  status: "progress" | "success" | "error";
  title: string;
  message: string;
  source: "manual" | "scheduled" | "settings";
  runId?: string;
};

export function publishCloudBackupNotification(
  notification: CloudBackupNotification,
): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<CloudBackupNotification>(
      CLOUD_BACKUP_NOTIFICATION_EVENT,
      { detail: notification },
    ),
  );
}
