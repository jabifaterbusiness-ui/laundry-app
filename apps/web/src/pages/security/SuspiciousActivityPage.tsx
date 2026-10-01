import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { hasPermission } from "../../lib/permissions.js";
import { listSuspiciousActivity } from "../../lib/audit-api.js";
import {
  loadSuspiciousActivityReadState,
  markSuspiciousActivityEventSeen,
} from "../../lib/suspicious-activity-persistence.js";
import { useAuthStore } from "../../state/auth-store.js";

type ActivityRisk = "High" | "Critical";

type ActivityDefinition = {
  id: string;
  label: string;
  actions: readonly string[];
  operationNames?: readonly string[];
  risk: ActivityRisk;
  description: string;
};

const ACTIVITY_DEFINITIONS: readonly ActivityDefinition[] = [
  {
    id: "authentication-password-reset-requested",
    label: "Password Reset Requested",
    actions: ["user.password_reset_requested"],
    risk: "High",
    description: "Password reset requests.",
  },
  {
    id: "authentication-password-reset-completed",
    label: "Password Reset Completed",
    actions: ["user.password_reset_completed"],
    risk: "High",
    description: "Completed password reset events.",
  },
  {
    id: "login-history",
    label: "Login History",
    actions: ["user.login", "user.logout"],
    risk: "High",
    description: "User login and logout activity.",
  },
  {
    id: "user-created",
    label: "User Created",
    actions: ["user.created"],
    risk: "High",
    description: "New user accounts created.",
  },
  {
    id: "user-updated",
    label: "User Updated",
    actions: ["user.updated"],
    risk: "High",
    description: "User account information changed.",
  },
  {
    id: "user-disabled",
    label: "User Disabled",
    actions: ["user.deleted"],
    risk: "Critical",
    description: "User accounts disabled through the protected user lifecycle.",
  },
  {
    id: "user-deactivated",
    label: "User Deactivated",
    actions: ["user.deactivated"],
    risk: "Critical",
    description: "User accounts deactivated.",
  },
  {
    id: "permission-role-updated",
    label: "Permission Role Updated",
    actions: ["permission.role.updated"],
    risk: "Critical",
    description: "A role's permissions were updated.",
  },
  {
    id: "permission-role-removed",
    label: "Permission Role Removed",
    actions: ["permission.role.removed"],
    risk: "Critical",
    description: "A role's permissions were removed.",
  },
  {
    id: "permission-user-allow-all",
    label: "Allow All Permissions",
    actions: ["permission.user.allow_all"],
    risk: "Critical",
    description: "All permissions were granted to an individual user.",
  },
  {
    id: "permission-user-disallow-all",
    label: "Disallow All Permissions",
    actions: ["permission.user.disallow_all"],
    risk: "Critical",
    description: "All permissions were removed from an individual user.",
  },
  {
    id: "permission-user-updated",
    label: "Permission User Updated",
    actions: ["permission.user.updated"],
    risk: "Critical",
    description: "Individual user permissions were updated.",
  },
  {
    id: "permission-user-removed",
    label: "Permission User Removed",
    actions: ["permission.user.removed"],
    risk: "Critical",
    description: "Individual user permissions were removed.",
  },
  {
    id: "payment-voided",
    label: "Payment Voided",
    actions: ["payment.voided"],
    risk: "Critical",
    description: "Payments that have been voided.",
  },
  {
    id: "invoice-updated",
    label: "Invoice Updated",
    actions: ["invoice.updated"],
    risk: "High",
    description: "Controlled invoice corrections.",
  },
  {
    id: "invoice-deleted",
    label: "Invoice Deleted",
    actions: ["invoice.deleted"],
    risk: "Critical",
    description: "Controlled invoice deletion actions.",
  },
  {
    id: "invoice-transferred",
    label: "Invoice Transferred",
    actions: ["invoice.transferred"],
    risk: "Critical",
    description: "Invoices transferred to another customer.",
  },
  {
    id: "invoice-voided",
    label: "Invoice Voided",
    actions: ["invoice.voided"],
    risk: "Critical",
    description: "Invoices voided through the controlled correction workflow.",
  },
  {
    id: "customer-transferred",
    label: "Customer Transferred",
    actions: ["order.customer_transferred"],
    risk: "Critical",
    description: "Orders or customer ownership transferred.",
  },
  {
    id: "stock-adjusted",
    label: "Stock Adjusted",
    actions: ["inventory.stock_adjusted"],
    risk: "High",
    description: "Manual inventory stock adjustments.",
  },
  {
    id: "backup-exported",
    label: "Backup Exported",
    actions: ["backup.exported"],
    risk: "High",
    description: "Business data exported as a backup.",
  },
  {
    id: "backup-restored",
    label: "Backup Restored",
    actions: ["backup.restored"],
    risk: "Critical",
    description: "Business data restored from a backup.",
  },
  {
    id: "quick-manual-update",
    label: "Manual Update",
    actions: ["quick_operation.executed"],
    operationNames: ["Manual Update"],
    risk: "Critical",
    description: "Protected manual update executed by an authorized user.",
  },
  {
    id: "quick-transfer-invoice",
    label: "Transfer Invoice",
    actions: ["quick_operation.executed"],
    operationNames: ["Transfer Invoice"],
    risk: "Critical",
    description: "Invoice transfer executed through a protected quick operation.",
  },
  {
    id: "quick-transfer-customer",
    label: "Transfer Customer",
    actions: ["quick_operation.executed"],
    operationNames: ["Transfer Customer"],
    risk: "Critical",
    description: "Customer transfer executed through a protected quick operation.",
  },
  {
    id: "quick-merge-account",
    label: "Merge Account",
    actions: ["quick_operation.executed"],
    operationNames: ["Merge Account"],
    risk: "Critical",
    description: "Customer account merge executed through a protected quick operation.",
  },
  {
    id: "quick-void-operation",
    label: "Void Operation",
    actions: ["quick_operation.executed"],
    operationNames: ["Void Operation"],
    risk: "Critical",
    description: "Void operation executed through a protected quick operation.",
  },
  {
    id: "quick-refund",
    label: "Refund",
    actions: ["quick_operation.executed"],
    operationNames: ["Refund"],
    risk: "Critical",
    description: "Refund executed through a protected quick operation.",
  },
  {
    id: "quick-reprint",
    label: "Reprint Invoice / Receipt",
    actions: ["quick_operation.executed"],
    operationNames: ["Reprint Invoice / Receipt"],
    risk: "High",
    description: "Invoice or receipt reprint activity.",
  },
  {
    id: "quick-resend-receipt",
    label: "Resend Receipt",
    actions: ["quick_operation.executed"],
    operationNames: ["Resend Receipt"],
    risk: "High",
    description: "Receipt resend activity.",
  },
  {
    id: "quick-reconcile",
    label: "Reconcile",
    actions: ["quick_operation.executed"],
    operationNames: ["Reconcile"],
    risk: "Critical",
    description: "Protected reconciliation activity.",
  },
  {
    id: "quick-stock-issue",
    label: "Stock Issue",
    actions: ["quick_operation.executed"],
    operationNames: ["Stock Issue"],
    risk: "High",
    description: "Inventory stock issue activity.",
  },
  {
    id: "quick-stock-receipt",
    label: "Stock Receipt",
    actions: ["quick_operation.executed"],
    operationNames: ["Stock Receipt"],
    risk: "High",
    description: "Inventory stock receipt activity.",
  },
  {
    id: "quick-switch-order",
    label: "Switch Order",
    actions: ["quick_operation.executed"],
    operationNames: ["Switch Order"],
    risk: "High",
    description: "Order workspace switch activity.",
  },
  {
    id: "quick-switch-customer",
    label: "Switch Customer",
    actions: ["quick_operation.executed"],
    operationNames: ["Switch Customer"],
    risk: "High",
    description: "Customer workspace switch activity.",
  },
  {
    id: "quick-safe-stop",
    label: "Safe Stop / Safe Exit",
    actions: ["quick_operation.executed"],
    operationNames: ["Safe Stop / Safe Exit"],
    risk: "Critical",
    description: "Protected safe-stop or safe-exit activity.",
  },
  {
    id: "subscription-payment-verified",
    label: "Subscription Payment Verified",
    actions: ["subscription.payment.verified"],
    risk: "High",
    description: "Subscription payments verified.",
  },
  {
    id: "subscription-reconciled",
    label: "Subscription Reconciled",
    actions: ["subscription.payment_intent.reconciled"],
    risk: "High",
    description: "Subscription payment intents reconciled.",
  },
  {
    id: "migration-analyzed",
    label: "Migration Analyzed",
    actions: ["migration.analyzed"],
    risk: "High",
    description: "Database migration analysis events.",
  },
];

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatMetadata(metadata: unknown) {
  if (metadata === null || metadata === undefined) {
    return "—";
  }

  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}

function getReason(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const reason = record.reason;

  return typeof reason === "string" && reason.trim()
    ? reason.trim()
    : null;
}

function getActivityCategory(definition: ActivityDefinition) {
  const action = definition.actions[0] ?? "";

  if (action.startsWith("user.password") || action.startsWith("user.login")) {
    return "security";
  }

  if (action.startsWith("user.")) {
    return "users";
  }

  if (action.startsWith("permission.")) {
    return "permissions";
  }

  if (action.startsWith("payment.") || action.startsWith("subscription.")) {
    return "financial";
  }

  if (action.startsWith("invoice.")) {
    return "invoices";
  }

  if (action.startsWith("order.customer_")) {
    return "customers";
  }

  if (action.startsWith("inventory.")) {
    return "inventory";
  }

  if (action.startsWith("backup.")) {
    return "backup";
  }

  if (action.startsWith("quick_operation.")) {
    return "operations";
  }

  if (action.startsWith("migration.")) {
    return "system";
  }

  return "security";
}

function getCategoryLabel(category: string) {
  switch (category) {
    case "security":
      return "Security & authentication";
    case "users":
      return "User activity";
    case "permissions":
      return "Permissions";
    case "financial":
      return "Financial";
    case "invoices":
      return "Invoices";
    case "customers":
      return "Customers";
    case "inventory":
      return "Inventory";
    case "backup":
      return "Backup & recovery";
    case "operations":
      return "Quick operations";
    case "system":
      return "System";
    default:
      return "Security";
  }
}

export function SuspiciousActivityPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    null,
  );
  const [readState, setReadState] = useState(() => {
    if (typeof window === "undefined" || !user?.id || !activeBranchId) {
      return {};
    }

    return loadSuspiciousActivityReadState(
      user.id,
      activeBranchId,
    ).lastSeenEventIds;
  });

  const canView = hasPermission(
    user,
    "security.suspicious_activity.view",
  );

  const activityQuery = useQuery({
    queryKey: ["audit", "suspicious-activity"],
    queryFn: () => listSuspiciousActivity(accessToken ?? "", 100),
    enabled: Boolean(accessToken && canView),
  });

  const activities = useMemo(
    () =>
      (activityQuery.data ?? []).map((activity) => ({
        ...activity,
        reason: getReason(activity.metadata),
      })),
    [activityQuery.data],
  );

  const selectedDefinition = useMemo(
    () =>
      ACTIVITY_DEFINITIONS.find(
        (definition) => definition.id === selectedEventId,
      ) ?? null,
    [selectedEventId],
  );

  const selectedActivities = useMemo(() => {
    if (!selectedDefinition) {
      return [];
    }

    return activities.filter((activity) => {
      if (!selectedDefinition.actions.includes(activity.action)) {
        return false;
      }

      if (!selectedDefinition.operationNames) {
        return true;
      }

      if (!activity.metadata || typeof activity.metadata !== "object") {
        return false;
      }

      const operationName = (activity.metadata as Record<string, unknown>)
        .operationName;

      return (
        typeof operationName === "string" &&
        selectedDefinition.operationNames.includes(operationName)
      );
    });
  }, [activities, selectedDefinition]);

  useEffect(() => {
    if (!user?.id || !activeBranchId) {
      setReadState({});
      return;
    }

    setReadState(
      loadSuspiciousActivityReadState(
        user.id,
        activeBranchId,
      ).lastSeenEventIds,
    );
  }, [user?.id, activeBranchId]);

  const activityCounts = useMemo(() => {
    return new Map(
      ACTIVITY_DEFINITIONS.map((definition) => {
        const matching = activities.filter((activity) => {
          if (!definition.actions.includes(activity.action)) {
            return false;
          }

          if (!definition.operationNames) {
            return true;
          }

          if (!activity.metadata || typeof activity.metadata !== "object") {
            return false;
          }

          const operationName = (
            activity.metadata as Record<string, unknown>
          ).operationName;

          return (
            typeof operationName === "string" &&
            definition.operationNames.includes(operationName)
          );
        });

        const latest = matching.reduce<(typeof matching)[number] | null>(
          (current, activity) => {
            if (!current) {
              return activity;
            }

            return new Date(activity.timestamp).getTime() >
              new Date(current.timestamp).getTime()
              ? activity
              : current;
          },
          null,
        );

        return [
          definition.id,
          {
            count: matching.length,
            latestActivityId: latest?.id ?? null,
          },
        ];
      }),
    );
  }, [activities]);

  const markEventAsSeen = (definition: ActivityDefinition) => {
    if (!user?.id || !activeBranchId) {
      return;
    }

    const latestActivityId =
      activityCounts.get(definition.id)?.latestActivityId;

    if (!latestActivityId) {
      return;
    }

    markSuspiciousActivityEventSeen(
      user.id,
      activeBranchId,
      definition.id,
      latestActivityId,
    );

    setReadState((current) => ({
      ...current,
      [definition.id]: latestActivityId,
    }));
  };

  const criticalCount = activities.filter((activity) =>
    ACTIVITY_DEFINITIONS.some((definition) => {
      if (!definition.actions.includes(activity.action)) {
        return false;
      }

      if (definition.risk !== "Critical") {
        return false;
      }

      if (!definition.operationNames) {
        return true;
      }

      if (!activity.metadata || typeof activity.metadata !== "object") {
        return false;
      }

      const operationName = (
        activity.metadata as Record<string, unknown>
      ).operationName;

      return (
        typeof operationName === "string" &&
        definition.operationNames.includes(operationName)
      );
    }),
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
    <main className="suspicious-activity-page">
      <header className="suspicious-activity-page-header">
        <div>
          <p className="dashboard-panel-eyebrow">Security centre</p>
          <h1>Suspicious / Unusual Activity</h1>
        <p>
          Select an event type to view only that event&apos;s records.
          Security, authentication, login history, users, permissions,
          financial events, invoices, backups and other sensitive
          activities remain separately organized.
        </p>
        </div>
      </header>

      {activityQuery.isLoading ? (
        <p>Loading suspicious activity...</p>
      ) : activityQuery.isError ? (
        <p role="alert">
          Unable to load suspicious activity. Please try again.
        </p>
      ) : (
        <>
          <section
            className="suspicious-activity-summary-grid"
            aria-label="Activity summary"
          >
            <article className="suspicious-activity-summary-card suspicious-activity-summary-card-primary">
              <div>
                <p className="dashboard-panel-eyebrow">Activity volume</p>
                <h2>Total events</h2>
                <strong>{activities.length}</strong>
              </div>
              <span className="suspicious-activity-summary-icon">◉</span>
            </article>

            <article className="suspicious-activity-summary-card suspicious-activity-summary-card-critical">
              <div>
                <p className="dashboard-panel-eyebrow">Risk level</p>
                <h2>Critical events</h2>
                <strong>{criticalCount}</strong>
              </div>
              <span className="suspicious-activity-summary-icon">!</span>
            </article>

            <article className="suspicious-activity-summary-card suspicious-activity-summary-card-types">
              <div>
                <p className="dashboard-panel-eyebrow">Monitoring</p>
                <h2>Event types</h2>
                <strong>{ACTIVITY_DEFINITIONS.length}</strong>
              </div>
              <span className="suspicious-activity-summary-icon">⌁</span>
            </article>
          </section>

          <section
            className="suspicious-activity-events"
            aria-label="Activity event types"
          >
            <div className="suspicious-activity-section-heading">
              <div>
                <p className="dashboard-panel-eyebrow">Event centre</p>
                <h2>Unusual activity</h2>
              </div>
              <span>{ACTIVITY_DEFINITIONS.length} event types</span>
            </div>

            <div className="suspicious-activity-event-grid">
              {ACTIVITY_DEFINITIONS.map((definition) => {
                const activitySummary = activityCounts.get(definition.id);
                const count = activitySummary?.count ?? 0;
                const latestActivityId =
                  activitySummary?.latestActivityId ?? null;
                const lastSeenActivityId = readState[definition.id];
                const unread =
                  Boolean(latestActivityId) &&
                  latestActivityId !== lastSeenActivityId;
                const selected = definition.id === selectedEventId;
                const category = getActivityCategory(definition);

                return (
                  <button
                    key={definition.id}
                    type="button"
                    className={[
                      "suspicious-activity-event-card",
                      `suspicious-activity-event-card-${category}`,
                      definition.risk === "Critical"
                        ? "suspicious-activity-event-card-critical"
                        : "suspicious-activity-event-card-high",
                      selected
                        ? "suspicious-activity-event-card-selected"
                        : "",
                    ].filter(Boolean).join(" ")}
                    aria-pressed={selected}
                    onClick={() => {
                      markEventAsSeen(definition);
                      setSelectedEventId((current) =>
                        current === definition.id ? null : definition.id,
                      );
                    }}
                  >
                    <div className="suspicious-activity-event-card-top">
                      <span className="suspicious-activity-event-icon">
                        {definition.risk === "Critical" ? "!" : "•"}
                      </span>

                      <span
                        className={[
                          "suspicious-activity-event-badge",
                          unread
                            ? "suspicious-activity-event-badge-unread"
                            : "",
                        ].filter(Boolean).join(" ")}
                        aria-label={
                          unread
                            ? `${count} new ${definition.label} events`
                            : `${count} ${definition.label} events`
                        }
                      >
                        {count}
                      </span>
                    </div>

                    <div className="suspicious-activity-event-card-body">
                      <p>{getCategoryLabel(category)}</p>
                      <strong>{definition.label}</strong>
                      <span>{definition.description}</span>
                    </div>

                    <div className="suspicious-activity-event-card-footer">
                      <span>{definition.risk}</span>
                      <span>{selected ? "Viewing" : "View records"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedDefinition ? (
            <section
              aria-label={`${selectedDefinition.label} records`}
            >
              <header>
                <h2>{selectedDefinition.label}</h2>
                <p>{selectedDefinition.description}</p>
                <span>
                  {selectedActivities.length} event
                  {selectedActivities.length === 1 ? "" : "s"}
                </span>
              </header>

              {selectedActivities.length === 0 ? (
                <p>
                  No {selectedDefinition.label.toLowerCase()} activity
                  has been recorded.
                </p>
              ) : (
                <div>
                  {selectedActivities.map((activity) => (
                    <article key={activity.id}>
                      <header>
                        <h3>{selectedDefinition.label}</h3>
                        <span>{selectedDefinition.risk}</span>
                      </header>

                      <dl>
                        <div>
                          <dt>Date & time</dt>
                          <dd>{formatTimestamp(activity.timestamp)}</dd>
                        </div>

                        <div>
                          <dt>Action</dt>
                          <dd>{activity.action}</dd>
                        </div>

                        <div>
                          <dt>Actor</dt>
                          <dd>{activity.actorUserId ?? "System"}</dd>
                        </div>

                        <div>
                          <dt>Record</dt>
                          <dd>
                            {activity.entityType}
                            {activity.entityId ? (
                              <>
                                {" · "}
                                {activity.entityType.toLowerCase() === "customer" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigate(
                                        `/customer-workstation?customerId=${encodeURIComponent(activity.entityId!)}`,
                                      )
                                    }
                                  >
                                    {activity.entityId}
                                  </button>
                                ) : activity.entityType.toLowerCase() === "order" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigate(
                                        `/orders?orderId=${encodeURIComponent(activity.entityId!)}`,
                                      )
                                    }
                                  >
                                    {activity.entityId}
                                  </button>
                                ) : activity.entityType.toLowerCase() === "invoice" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigate(
                                        `/invoices?invoiceId=${encodeURIComponent(activity.entityId!)}`,
                                      )
                                    }
                                  >
                                    {activity.entityId}
                                  </button>
                                ) : activity.entityType.toLowerCase() === "payment" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigate(
                                        `/payments?paymentId=${encodeURIComponent(activity.entityId!)}`,
                                      )
                                    }
                                  >
                                    {activity.entityId}
                                  </button>
                                ) : activity.entityType.toLowerCase() === "migrationjob" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigate(
                                        `/data-management?jobId=${encodeURIComponent(activity.entityId!)}`,
                                      )
                                    }
                                  >
                                    {activity.entityId}
                                  </button>
                                ) : (
                                  activity.entityId
                                )}
                              </>
                            ) : null}
                          </dd>
                        </div>

                        <div>
                          <dt>Reason</dt>
                          <dd>{activity.reason ?? "—"}</dd>
                        </div>

                        {activity.correlationId ? (
                          <div>
                            <dt>Correlation</dt>
                            <dd>{activity.correlationId}</dd>
                          </div>
                        ) : null}
                      </dl>

                      <details>
                        <summary>View full event details</summary>
                        <pre>
                          {formatMetadata(activity.metadata)}
                        </pre>
                      </details>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <p>
              Select an event button above to view its records.
            </p>
          )}
        </>
      )}
    </main>
  );
}
