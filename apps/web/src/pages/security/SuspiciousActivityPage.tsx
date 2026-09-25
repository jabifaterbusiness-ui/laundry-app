import { useQuery } from "@tanstack/react-query";
import { hasPermission } from "../../lib/permissions.js";
import { listSuspiciousActivity } from "../../lib/audit-api.js";
import { useAuthStore } from "../../state/auth-store.js";

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatMetadata(metadata: unknown) {
  if (metadata === null || metadata === undefined) return "—";

  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}

export function SuspiciousActivityPage() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const canView = hasPermission(
    user,
    "security.suspicious_activity.view",
  );

  const activityQuery = useQuery({
    queryKey: ["audit", "suspicious-activity"],
    queryFn: () => listSuspiciousActivity(accessToken ?? "", 100),
    enabled: Boolean(accessToken && canView),
  });

  if (!canView) {
    return (
      <main>
        <h1>Suspicious / Unusual Activity</h1>
        <p>You do not have permission to view suspicious or high-risk activity.</p>
      </main>
    );
  }

  return (
    <main>
      <header>
        <h1>Suspicious / Unusual Activity</h1>
        <p>
          Protected activity centre for suspicious and high-risk business
          events.
        </p>
      </header>

      {activityQuery.isLoading ? (
        <p>Loading suspicious activity...</p>
      ) : activityQuery.isError ? (
        <p role="alert">
          Unable to load suspicious activity. Please try again.
        </p>
      ) : activityQuery.data?.length ? (
        <section aria-label="Suspicious activity records">
          {activityQuery.data.map((activity) => (
            <article key={activity.id}>
              <div>
                <strong>{activity.action}</strong>
                <span> · {formatTimestamp(activity.timestamp)}</span>
              </div>

              <div>
                <strong>Record:</strong>{" "}
                {activity.entityType}
                {activity.entityId ? ` · ${activity.entityId}` : ""}
              </div>

              <div>
                <strong>Actor:</strong> {activity.actorUserId ?? "System"}
              </div>

              {activity.correlationId ? (
                <div>
                  <strong>Correlation:</strong> {activity.correlationId}
                </div>
              ) : null}

              <details>
                <summary>Activity details</summary>
                <pre>{formatMetadata(activity.metadata)}</pre>
              </details>
            </article>
          ))}
        </section>
      ) : (
        <p>No suspicious or high-risk activity has been recorded.</p>
      )}
    </main>
  );
}
