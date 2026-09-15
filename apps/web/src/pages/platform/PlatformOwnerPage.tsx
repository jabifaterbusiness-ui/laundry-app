import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPlatformAuditLogs,
  getPlatformBusinesses,
  getPlatformOverview,
} from "../../lib/platform-api.js";
import { useAuthStore } from "../../state/auth-store.js";

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function PlatformOwnerPage() {
  const { user, accessToken } = useAuthStore();
  const isPlatformAdmin = user?.role === "PLATFORM_ADMIN";

  const overviewQuery = useQuery({
    queryKey: ["platform", "overview"],
    queryFn: () => getPlatformOverview(accessToken),
    enabled: isPlatformAdmin && Boolean(accessToken),
  });

  const businessesQuery = useQuery({
    queryKey: ["platform", "businesses"],
    queryFn: () => getPlatformBusinesses(accessToken),
    enabled: isPlatformAdmin && Boolean(accessToken),
  });

  const auditQuery = useQuery({
    queryKey: ["platform", "audit-logs"],
    queryFn: () => getPlatformAuditLogs(accessToken),
    enabled: isPlatformAdmin && Boolean(accessToken),
  });

  const businesses = useMemo(
    () => businessesQuery.data ?? overviewQuery.data?.recentBusinesses ?? [],
    [businessesQuery.data, overviewQuery.data?.recentBusinesses],
  );

  if (!isPlatformAdmin) {
    return (
      <section className="platform-page">
        <div className="platform-panel">
          <div className="platform-eyebrow">Restricted area</div>
          <h1>Platform access restricted</h1>
          <p>
            The Platform Owner Control Center is available only to authorized
            platform administrators.
          </p>
        </div>
      </section>
    );
  }

  if (overviewQuery.isLoading) {
    return (
      <section className="platform-page">
        <div className="platform-hero">
          <div>
            <div className="platform-eyebrow">LAUNDY ANGEL PLATFORM</div>
            <h1>Platform Owner Control Center</h1>
            <p>Loading platform-wide visibility and administration data...</p>
          </div>
        </div>

        <div className="platform-kpi-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="platform-kpi-card platform-skeleton" key={index}>
              <span />
              <span />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (overviewQuery.isError) {
    return (
      <section className="platform-page">
        <div className="platform-panel platform-error">
          <div>
            <div className="platform-eyebrow">PLATFORM CONTROL CENTER</div>
            <h1>Unable to load platform data</h1>
            <p>
              The platform overview could not be loaded. Verify your platform
              administrator session and try again.
            </p>
          </div>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              void overviewQuery.refetch();
              void businessesQuery.refetch();
              void auditQuery.refetch();
            }}
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  const overview = overviewQuery.data;

  return (
    <section className="platform-page">
      <header className="platform-hero">
        <div>
          <div className="platform-eyebrow">LAUNDY ANGEL PLATFORM</div>
          <h1>Platform Owner Control Center</h1>
          <p>
            Centralized platform-wide visibility for registered laundry
            companies, subscriptions, users, activity, and revenue.
          </p>
        </div>

        <div className="platform-security-badge">
          <span aria-hidden="true">◆</span>
          PLATFORM ADMIN
        </div>
      </header>

      <div className="platform-kpi-grid">
        <article className="platform-kpi-card">
          <span className="platform-kpi-label">Registered companies</span>
          <strong>{formatNumber(overview?.totals.businesses ?? 0)}</strong>
          <small>
            {formatNumber(overview?.totals.activeBusinesses ?? 0)} active
          </small>
        </article>

        <article className="platform-kpi-card">
          <span className="platform-kpi-label">Platform users</span>
          <strong>{formatNumber(overview?.totals.users ?? 0)}</strong>
          <small>Across registered companies</small>
        </article>

        <article className="platform-kpi-card">
          <span className="platform-kpi-label">Customers</span>
          <strong>{formatNumber(overview?.totals.customers ?? 0)}</strong>
          <small>Platform-wide customer records</small>
        </article>

        <article className="platform-kpi-card">
          <span className="platform-kpi-label">Orders</span>
          <strong>{formatNumber(overview?.totals.orders ?? 0)}</strong>
          <small>All tenant orders</small>
        </article>

        <article className="platform-kpi-card">
          <span className="platform-kpi-label">Active subscriptions</span>
          <strong>{formatNumber(overview?.subscriptions.active ?? 0)}</strong>
          <small>
            {formatNumber(overview?.subscriptions.expired ?? 0)} expired
          </small>
        </article>

        <article className="platform-kpi-card">
          <span className="platform-kpi-label">Total collected</span>
          <strong>
            {formatCurrency(overview?.revenue.totalCollected ?? 0)}
          </strong>
          <small>
            {formatNumber(overview?.revenue.paymentCount ?? 0)} payments
          </small>
        </article>
      </div>

      <div className="platform-content-grid">
        <section className="platform-panel">
          <div className="platform-panel-header">
            <div>
              <div className="platform-eyebrow">COMPANY DIRECTORY</div>
              <h2>Registered laundry companies</h2>
            </div>
            <span>{formatNumber(businesses.length)} shown</span>
          </div>

          {businesses.length === 0 ? (
            <p className="platform-feedback">
              No registered companies are currently available.
            </p>
          ) : (
            <div className="platform-business-list">
              {businesses.map((business) => (
                <article className="platform-business-row" key={business.id}>
                  <div className="platform-business-mark" aria-hidden="true">
                    {business.name.slice(0, 1).toUpperCase()}
                  </div>

                  <div className="platform-business-main">
                    <strong>{business.name}</strong>
                    <span>{business.slug}</span>
                  </div>

                  <div className="platform-business-stats">
                    <span>
                      {formatNumber(business._count.users)} users
                    </span>
                    <span>
                      {formatNumber(business._count.orders)} orders
                    </span>
                    <span>
                      {formatNumber(business._count.customers)} customers
                    </span>
                  </div>

                  <div>
                    <span
                      className={`platform-status ${
                        business.isActive ? "active" : "inactive"
                      }`}
                    >
                      {business.isActive ? "Active" : "Inactive"}
                    </span>
                    {business.subscription ? (
                      <span className="platform-subscription">
                        {business.subscription.plan} ·{" "}
                        {business.subscription.status}
                      </span>
                    ) : (
                      <span className="platform-subscription">
                        No subscription
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="platform-panel">
          <div className="platform-panel-header">
            <div>
              <div className="platform-eyebrow">AUDIT ACTIVITY</div>
              <h2>Recent platform activity</h2>
            </div>
          </div>

          {auditQuery.isLoading ? (
            <p className="platform-feedback">Loading audit activity...</p>
          ) : auditQuery.isError ? (
            <p className="platform-feedback">
              Audit activity could not be loaded.
            </p>
          ) : auditQuery.data?.length ? (
            <div className="platform-audit-list">
              {auditQuery.data.slice(0, 10).map((entry) => (
                <article className="platform-audit-row" key={entry.id}>
                  <div className="platform-audit-mark" aria-hidden="true">
                    ✓
                  </div>
                  <div>
                    <strong>{entry.action}</strong>
                    <span>
                      {entry.entityType}
                      {entry.entityId ? ` · ${entry.entityId}` : ""}
                    </span>
                  </div>
                  <time dateTime={entry.timestamp}>
                    {formatDate(entry.timestamp)}
                  </time>
                </article>
              ))}
            </div>
          ) : (
            <p className="platform-feedback">No recent platform activity.</p>
          )}
        </section>
      </div>

      <div className="platform-footer-grid">
        <section className="platform-panel platform-control-panel">
          <div className="platform-eyebrow">CONTROL CENTER</div>
          <h2>Platform administration</h2>
          <p>
            Company controls, subscription administration, controlled support
            access, system health, global analytics, and protected platform
            configuration will be added through audited platform-owner
            controls.
          </p>
          <span className="platform-status active">Secure foundation active</span>
        </section>

        <section className="platform-panel platform-control-panel">
          <div className="platform-eyebrow">SECURITY BOUNDARY</div>
          <h2>Tenant isolation</h2>
          <p>
            Company CEOs, managers, and staff remain restricted to their own
            organization. Platform administration is available only to
            authenticated PLATFORM_ADMIN accounts.
          </p>
          <span className="platform-status active">Tenant boundary enforced</span>
        </section>
      </div>
    </section>
  );
}
