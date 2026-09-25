import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { hasPermission } from "../../lib/permissions.js";
import { listSuspiciousActivity } from "../../lib/audit-api.js";
import { useAuthStore } from "../../state/auth-store.js";

type ActivityCategory =
  | "Security & Authentication"
  | "Users & Accounts"
  | "Permissions & Access"
  | "Financial & Payments"
  | "Backup & Recovery"
  | "Subscriptions & Platform"
  | "System & Migration";

type ActivityRisk = "High" | "Critical";

type ActivityClassification = {
  category: ActivityCategory;
  risk: ActivityRisk;
  label: string;
};

const ACTIVITY_CLASSIFICATIONS: Record<string, ActivityClassification> = {
  "user.login": {
    category: "Security & Authentication",
    risk: "High",
    label: "User login",
  },
  "user.password_reset_requested": {
    category: "Security & Authentication",
    risk: "High",
    label: "Password reset requested",
  },
  "user.password_reset_completed": {
    category: "Security & Authentication",
    risk: "High",
    label: "Password reset completed",
  },

  "permission.role.updated": {
    category: "Permissions & Access",
    risk: "High",
    label: "Role permission updated",
  },
  "permission.role.removed": {
    category: "Permissions & Access",
    risk: "High",
    label: "Role permission removed",
  },
  "permission.user.allow_all": {
    category: "Permissions & Access",
    risk: "Critical",
    label: "All user permissions granted",
  },
  "permission.user.disallow_all": {
    category: "Permissions & Access",
    risk: "Critical",
    label: "All user permissions removed",
  },
  "permission.user.updated": {
    category: "Permissions & Access",
    risk: "High",
    label: "User permission updated",
  },
  "permission.user.removed": {
    category: "Permissions & Access",
    risk: "High",
    label: "User permission removed",
  },

  "user.created": {
    category: "Users & Accounts",
    risk: "High",
    label: "User account created",
  },
  "user.updated": {
    category: "Users & Accounts",
    risk: "High",
    label: "User account updated",
  },
  "user.deleted": {
    category: "Users & Accounts",
    risk: "Critical",
    label: "User account disabled",
  },

  "payment.voided": {
    category: "Financial & Payments",
    risk: "Critical",
    label: "Payment voided",
  },

  "backup.exported": {
    category: "Backup & Recovery",
    risk: "High",
    label: "Business backup exported",
  },
  "backup.restored": {
    category: "Backup & Recovery",
    risk: "Critical",
    label: "Business backup restored",
  },

  "migration.analyzed": {
    category: "System & Migration",
    risk: "High",
    label: "Migration analyzed",
  },

  "subscription.payment.verified": {
    category: "Subscriptions & Platform",
    risk: "High",
    label: "Subscription payment verified",
  },
  "subscription.payment_intent.reconciled": {
    category: "Subscriptions & Platform",
    risk: "High",
    label: "Subscription payment reconciled",
  },
};

function classifyActivity(action: string): ActivityClassification {
  return (
    ACTIVITY_CLASSIFICATIONS[action] ?? {
      category: "System & Migration",
      risk: "High",
      label: action,
    }
  );
}

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

function getReason(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;

  const record = metadata as Record<string, unknown>;
  const reason = record.reason;

  return typeof reason === "string" && reason.trim()
    ? reason.trim()
    : null;
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

  const classifiedActivities = useMemo(
    () =>
      (activityQuery.data ?? []).map((activity) => ({
        ...activity,
        classification: classifyActivity(activity.action),
        reason: getReason(activity.metadata),
      })),
    [activityQuery.data],
  );

  const categoryGroups = useMemo(() => {
    const groups = new Map<
      ActivityCategory,
      typeof classifiedActivities
    >();

    for (const activity of classifiedActivities) {
      const existing = groups.get(activity.classification.category);

      if (existing) {
        existing.push(activity);
      } else {
        groups.set(activity.classification.category, [activity]);
      }
    }

    return [...groups.entries()];
  }, [classifiedActivities]);

  const criticalCount = classifiedActivities.filter(
    (activity) => activity.classification.risk === "Critical",
  ).length;

  if (!canView) {
    return (
      <main>
        <h1>Suspicious / Unusual Activity</h1>
        <p>
          You do not have permission to view suspicious or high-risk
          activity.
        </p>
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
      ) : classifiedActivities.length ? (
        <>
          <section aria-label="Activity summary">
            <div>
              <strong>Total events</strong>
              <span>{classifiedActivities.length}</span>
            </div>
            <div>
              <strong>Critical events</strong>
              <span>{criticalCount}</span>
            </div>
            <div>
              <strong>Categories</strong>
              <span>{categoryGroups.length}</span>
            </div>
          </section>

          <section aria-label="Suspicious activity records">
            {categoryGroups.map(([category, activities]) => (
              <section key={category} aria-labelledby={`category-${category}`}>
                <header>
                  <h2 id={`category-${category}`}>{category}</h2>
                  <span>{activities.length} event(s)</span>
                </header>

                <div role="region" aria-label={`${category} activity`}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Activity</th>
                        <th scope="col">Risk</th>
                        <th scope="col">Date & time</th>
                        <th scope="col">Actor</th>
                        <th scope="col">Record</th>
                        <th scope="col">Reason</th>
                        <th scope="col">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activities.map((activity) => (
                        <tr key={activity.id}>
                          <td>
                            <strong>{activity.classification.label}</strong>
                            <div>{activity.action}</div>
                          </td>
                          <td>{activity.classification.risk}</td>
                          <td>{formatTimestamp(activity.timestamp)}</td>
                          <td>{activity.actorUserId ?? "System"}</td>
                          <td>
                            {activity.entityType}
                            {activity.entityId
                              ? ` · ${activity.entityId}`
                              : ""}
                          </td>
                          <td>{activity.reason ?? "—"}</td>
                          <td>
                            <details>
                              <summary>View</summary>
                              {activity.correlationId ? (
                                <p>
                                  <strong>Correlation:</strong>{" "}
                                  {activity.correlationId}
                                </p>
                              ) : null}
                              <pre>
                                {formatMetadata(activity.metadata)}
                              </pre>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </section>
        </>
      ) : (
        <p>No suspicious or high-risk activity has been recorded.</p>
      )}
    </main>
  );
}
