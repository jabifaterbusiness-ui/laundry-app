import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  activatePlatformBusiness,
  deactivatePlatformBusiness,
  renewPlatformBusinessSubscription,
  getPlatformAuditLogs,
  getPlatformBusinesses,
  getPlatformOverview,
  getPlatformRevenueAnalytics,
  getPlatformGrowthAnalytics,
  getPlatformGlobalStatistics,
  getPlatformHealth,
  getPlatformConfiguration,
  updatePlatformConfiguration,
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

  const revenueQuery = useQuery({
    queryKey: ["platform", "revenue"],
    queryFn: () => getPlatformRevenueAnalytics(accessToken),
    enabled: isPlatformAdmin && Boolean(accessToken),
  });

  const growthQuery = useQuery({
    queryKey: ["platform", "growth"],
    queryFn: () => getPlatformGrowthAnalytics(accessToken),
    enabled: isPlatformAdmin && Boolean(accessToken),
  });

  const globalStatisticsQuery = useQuery({
    queryKey: ["platform", "global-statistics"],
    queryFn: () => getPlatformGlobalStatistics(accessToken),
    enabled: isPlatformAdmin && Boolean(accessToken),
  });

  const healthQuery = useQuery({
    queryKey: ["platform", "health"],
    queryFn: () => getPlatformHealth(accessToken),
    enabled: isPlatformAdmin && Boolean(accessToken),
    retry: 1,
    refetchInterval: 30_000,
  });

  const configurationQuery = useQuery({
    queryKey: ["platform", "configuration"],
    queryFn: () => getPlatformConfiguration(accessToken),
    enabled: isPlatformAdmin && Boolean(accessToken),
  });

  const auditQuery = useQuery({
    queryKey: ["platform", "audit-logs"],
    queryFn: () => getPlatformAuditLogs(accessToken),
    enabled: isPlatformAdmin && Boolean(accessToken),
  });

  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [subscriptionFeedback, setSubscriptionFeedback] =
    useState<string | null>(null);

  const refreshPlatformData = async () => {
    await Promise.all([
      overviewQuery.refetch(),
      businessesQuery.refetch(),
      revenueQuery.refetch(),
      growthQuery.refetch(),
      globalStatisticsQuery.refetch(),
      healthQuery.refetch(),
      configurationQuery.refetch(),
      auditQuery.refetch(),
    ]);
  };

  const statusMutation = useMutation({
    mutationFn: async ({
      businessId,
      isActive,
    }: {
      businessId: string;
      isActive: boolean;
    }) =>
      isActive
        ? activatePlatformBusiness(businessId, accessToken)
        : deactivatePlatformBusiness(businessId, accessToken),
    onMutate: () => {
      setStatusFeedback(null);
    },
    onSuccess: async (_, variables) => {
      setStatusFeedback(
        `Company ${variables.isActive ? "activated" : "deactivated"} successfully.`,
      );
      await refreshPlatformData();
    },
    onError: (error) => {
      setStatusFeedback(
        error instanceof Error
          ? error.message
          : "Unable to update company status.",
      );
    },
  });

  const subscriptionMutation = useMutation({
    mutationFn: async (businessId: string) =>
      renewPlatformBusinessSubscription(businessId, "MONTHLY", accessToken),
    onMutate: () => {
      setSubscriptionFeedback(null);
    },
    onSuccess: async () => {
      setSubscriptionFeedback(
        "Company subscription created or renewed successfully.",
      );
      await refreshPlatformData();
    },
    onError: (error) => {
      setSubscriptionFeedback(
        error instanceof Error
          ? error.message
          : "Unable to create or renew the company subscription.",
      );
    },
  });

  const [configurationFeedback, setConfigurationFeedback] =
    useState<string | null>(null);

  const configurationMutation = useMutation({
    mutationFn: async ({
      field,
      value,
    }: {
      field:
        | "allowNewBusinessRegistration"
        | "maintenanceMode"
        | "whatsappMessagingEnabled"
        | "automatedNotificationsEnabled"
        | "offlineSyncEnabled";
      value: boolean;
    }) => {
      const configuration = configurationQuery.data;
      if (!configuration) {
        throw new Error("Platform configuration is not loaded.");
      }

      return updatePlatformConfiguration(
        {
          [field]: value,
          expectedVersion: configuration.version,
        },
        accessToken,
      );
    },
    onMutate: () => {
      setConfigurationFeedback(null);
    },
    onSuccess: async () => {
      setConfigurationFeedback("Platform configuration updated successfully.");
      await configurationQuery.refetch();
    },
    onError: (error) => {
      setConfigurationFeedback(
        error instanceof Error
          ? error.message
          : "Unable to update platform configuration.",
      );
    },
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
              void revenueQuery.refetch();
              void growthQuery.refetch();
              void globalStatisticsQuery.refetch();
              void healthQuery.refetch();
              void configurationQuery.refetch();
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

  const handleStatusChange = (businessId: string, isActive: boolean) => {
    const action = isActive ? "activate" : "deactivate";

    if (
      !window.confirm(
        `Are you sure you want to ${action} this company?`,
      )
    ) {
      return;
    }

    statusMutation.mutate({ businessId, isActive });
  };

  const handleSubscriptionRenewal = (businessId: string, businessName: string) => {
    if (
      !window.confirm(
        `Create or renew a one-month subscription for ${businessName}?`,
      )
    ) {
      return;
    }

    subscriptionMutation.mutate(businessId);
  };

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
        <a className="platform-kpi-card platform-kpi-link" href="#platform-company-directory">
          <span className="platform-kpi-label">Registered companies</span>
          <strong>{formatNumber(overview?.totals.businesses ?? 0)}</strong>
          <small>
            {formatNumber(overview?.totals.activeBusinesses ?? 0)} active
          </small>
        </a>

        <a className="platform-kpi-card platform-kpi-link" href="#platform-global-statistics">
          <span className="platform-kpi-label">Platform users</span>
          <strong>{formatNumber(overview?.totals.users ?? 0)}</strong>
          <small>Across registered companies</small>
        </a>

        <a className="platform-kpi-card platform-kpi-link" href="#platform-global-statistics">
          <span className="platform-kpi-label">Customers</span>
          <strong>{formatNumber(overview?.totals.customers ?? 0)}</strong>
          <small>Platform-wide customer records</small>
        </a>

        <a className="platform-kpi-card platform-kpi-link" href="#platform-global-statistics">
          <span className="platform-kpi-label">Orders</span>
          <strong>{formatNumber(overview?.totals.orders ?? 0)}</strong>
          <small>All tenant orders</small>
        </a>

        <a className="platform-kpi-card platform-kpi-link" href="#platform-company-directory">
          <span className="platform-kpi-label">Active subscriptions</span>
          <strong>{formatNumber(overview?.subscriptions.active ?? 0)}</strong>
          <small>
            {formatNumber(overview?.subscriptions.expired ?? 0)} expired
          </small>
        </a>

        <a className="platform-kpi-card platform-kpi-link" href="#platform-revenue-overview">
          <span className="platform-kpi-label">Total collected</span>
          <strong>
            {formatCurrency(overview?.revenue.totalCollected ?? 0)}
          </strong>
          <small>
            {formatNumber(overview?.revenue.paymentCount ?? 0)} payments
          </small>
        </a>
      </div>

      {statusFeedback ? (
        <div
          className={`platform-feedback ${
            statusMutation.isError ? "platform-error" : ""
          }`}
          role={statusMutation.isError ? "alert" : "status"}
          aria-live="polite"
        >
          {statusFeedback}
        </div>
      ) : null}

      {subscriptionFeedback ? (
        <div
          className={`platform-feedback ${
            subscriptionMutation.isError ? "platform-error" : ""
          }`}
          role={subscriptionMutation.isError ? "alert" : "status"}
          aria-live="polite"
        >
          {subscriptionFeedback}
        </div>
      ) : null}

      <section className="platform-panel" id="platform-revenue-overview">
        <div className="platform-panel-header">
          <div>
            <div className="platform-eyebrow">REVENUE OVERVIEW</div>
            <h2>Platform-wide financial activity</h2>
          </div>
          {revenueQuery.data?.generatedAt ? (
            <span>Updated {formatDate(revenueQuery.data.generatedAt)}</span>
          ) : null}
        </div>

        {revenueQuery.isLoading ? (
          <p className="platform-feedback">Loading revenue analytics...</p>
        ) : revenueQuery.isError ? (
          <p className="platform-feedback platform-error">
            Revenue analytics could not be loaded.
          </p>
        ) : revenueQuery.data ? (
          <>
            <div className="platform-revenue-summary">
              <article className="platform-kpi-card">
                <span className="platform-kpi-label">Gross payments</span>
                <strong>{formatCurrency(revenueQuery.data.grossPayments)}</strong>
                <small>
                  {formatNumber(revenueQuery.data.paymentCount)} posted payments
                </small>
              </article>

              <article className="platform-kpi-card">
                <span className="platform-kpi-label">Refunds</span>
                <strong>{formatCurrency(revenueQuery.data.refunds)}</strong>
                <small>
                  {formatNumber(revenueQuery.data.refundCount)} posted refunds
                </small>
              </article>

              <article className="platform-kpi-card">
                <span className="platform-kpi-label">Net collected</span>
                <strong>{formatCurrency(revenueQuery.data.netCollected)}</strong>
                <small>Gross payments less refunds</small>
              </article>
            </div>

            <div className="platform-revenue-methods">
              {(["CASH", "TRANSFER", "POS"] as const).map((method) => {
                const breakdown = revenueQuery.data!.methodBreakdown[method];

                return (
                  <article className="platform-revenue-method" key={method}>
                    <div>
                      <strong>{method}</strong>
                      <span>Net collected</span>
                    </div>
                    <strong>{formatCurrency(breakdown.net)}</strong>
                    <div>
                      <span>Payments {formatCurrency(breakdown.payments)}</span>
                      <span>Refunds {formatCurrency(breakdown.refunds)}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <p className="platform-feedback">No revenue analytics available.</p>
        )}
      </section>

      <section className="platform-panel" id="platform-growth-analytics">
        <div className="platform-panel-header">
          <div>
            <div className="platform-eyebrow">GROWTH ANALYTICS</div>
            <h2>Platform growth</h2>
          </div>
          {growthQuery.data?.generatedAt ? (
            <span>Updated {formatDate(growthQuery.data.generatedAt)}</span>
          ) : null}
        </div>

        {growthQuery.isLoading ? (
          <p className="platform-feedback">Loading growth analytics...</p>
        ) : growthQuery.isError ? (
          <p className="platform-feedback platform-error">
            Growth analytics could not be loaded.
          </p>
        ) : growthQuery.data ? (
          <>
            <div className="platform-growth-summary">
              {(
                [
                  ["Businesses", growthQuery.data.businesses],
                  ["Users", growthQuery.data.users],
                  ["Customers", growthQuery.data.customers],
                  ["Orders", growthQuery.data.orders],
                ] as const
              ).map(([label, series]) => (
                <article className="platform-growth-card" key={label}>
                  <span className="platform-kpi-label">{label}</span>
                  <strong>{formatNumber(series.total)}</strong>
                  <small>Platform-wide total</small>
                </article>
              ))}
            </div>

            <div className="platform-growth-chart">
              <div className="platform-growth-chart-header">
                <div>
                  <strong>Monthly activity</strong>
                  <span>New records created by month</span>
                </div>
              </div>

              {(() => {
                const months = Array.from(
                  new Set([
                    ...growthQuery.data.businesses.monthly.map(
                      (item) => item.month,
                    ),
                    ...growthQuery.data.users.monthly.map(
                      (item) => item.month,
                    ),
                    ...growthQuery.data.customers.monthly.map(
                      (item) => item.month,
                    ),
                    ...growthQuery.data.orders.monthly.map(
                      (item) => item.month,
                    ),
                  ]),
                ).sort();

                const series = [
                  {
                    key: "businesses",
                    label: "Businesses",
                    data: growthQuery.data.businesses.monthly,
                  },
                  {
                    key: "users",
                    label: "Users",
                    data: growthQuery.data.users.monthly,
                  },
                  {
                    key: "customers",
                    label: "Customers",
                    data: growthQuery.data.customers.monthly,
                  },
                  {
                    key: "orders",
                    label: "Orders",
                    data: growthQuery.data.orders.monthly,
                  },
                ] as const;

                const maxValue = Math.max(
                  1,
                  ...series.flatMap(({ data }) =>
                    data.map((item) => item.count),
                  ),
                );

                return (
                  <>
                    <div className="platform-growth-legend">
                      {series.map(({ key, label }) => (
                        <span key={key}>
                          <i
                            className={`platform-growth-dot ${key}`}
                            aria-hidden="true"
                          />
                          {label}
                        </span>
                      ))}
                    </div>

                    <div
                      className="platform-growth-grid"
                      role="img"
                      aria-label="Monthly platform growth chart"
                    >
                      {months.map((month) => (
                        <div className="platform-growth-column" key={month}>
                          <div className="platform-growth-bars">
                            {series.map(({ key, data }) => {
                              const value =
                                data.find((item) => item.month === month)
                                  ?.count ?? 0;

                              return (
                                <div
                                  className={`platform-growth-bar ${key}`}
                                  key={key}
                                  title={`${key}: ${formatNumber(value)}`}
                                  style={{
                                    height: `${Math.max(
                                      value > 0 ? 4 : 0,
                                      (value / maxValue) * 100,
                                    )}%`,
                                  }}
                                >
                                  {value > 0 ? (
                                    <span>{formatNumber(value)}</span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                          <span className="platform-growth-month">
                            {month}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </>
        ) : (
          <p className="platform-feedback">No growth analytics available.</p>
        )}
      </section>

      <section className="platform-panel" id="platform-global-statistics">
        <div className="platform-panel-header">
          <div>
            <div className="platform-eyebrow">GLOBAL STATISTICS</div>
            <h2>Worldwide platform coverage</h2>
          </div>
          {globalStatisticsQuery.data?.generatedAt ? (
            <span>
              Updated {formatDate(globalStatisticsQuery.data.generatedAt)}
            </span>
          ) : null}
        </div>

        {globalStatisticsQuery.isLoading ? (
          <p className="platform-feedback">
            Loading global statistics...
          </p>
        ) : globalStatisticsQuery.isError ? (
          <p className="platform-feedback platform-error">
            Global statistics could not be loaded.
          </p>
        ) : globalStatisticsQuery.data ? (
          <>
            <div className="platform-growth-summary">
              <article className="platform-growth-card">
                <span className="platform-kpi-label">Countries</span>
                <strong>
                  {formatNumber(
                    globalStatisticsQuery.data.totals.countries,
                  )}
                </strong>
                <small>Markets represented</small>
              </article>

              <article className="platform-growth-card">
                <span className="platform-kpi-label">Businesses</span>
                <strong>
                  {formatNumber(
                    globalStatisticsQuery.data.totals.businesses,
                  )}
                </strong>
                <small>
                  {formatNumber(
                    globalStatisticsQuery.data.totals.activeBusinesses,
                  )}{" "}
                  active
                </small>
              </article>

              <article className="platform-growth-card">
                <span className="platform-kpi-label">Branches</span>
                <strong>
                  {formatNumber(globalStatisticsQuery.data.totals.branches)}
                </strong>
                <small>Across all markets</small>
              </article>

              <article className="platform-growth-card">
                <span className="platform-kpi-label">Orders</span>
                <strong>
                  {formatNumber(globalStatisticsQuery.data.totals.orders)}
                </strong>
                <small>Worldwide order records</small>
              </article>
            </div>

            {globalStatisticsQuery.data.countries.length ? (
              <div className="platform-business-list">
                {globalStatisticsQuery.data.countries.map((country) => (
                  <article
                    className="platform-business-row"
                    key={country.countryCode}
                  >
                    <div
                      className="platform-business-mark"
                      aria-hidden="true"
                    >
                      {country.countryCode}
                    </div>

                    <div className="platform-business-main">
                      <strong>{country.countryCode}</strong>
                      <span>
                        {formatNumber(country.businesses)}{" "}
                        {country.businesses === 1
                          ? "business"
                          : "businesses"}
                      </span>
                    </div>

                    <div className="platform-business-stats">
                      <span>
                        {formatNumber(country.activeBusinesses)} active
                      </span>
                      <span>
                        {formatNumber(country.users)} users
                      </span>
                      <span>
                        {formatNumber(country.customers)} customers
                      </span>
                      <span>
                        {formatNumber(country.orders)} orders
                      </span>
                      <span>
                        {formatNumber(country.branches)} branches
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="platform-feedback">
                No country statistics are currently available.
              </p>
            )}
          </>
        ) : (
          <p className="platform-feedback">
            No global statistics available.
          </p>
        )}
      </section>

      <div className="platform-content-grid">
        <section className="platform-panel" id="platform-company-directory">
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

                  <div className="platform-business-actions">
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

                    <div className="platform-control-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={
                          statusMutation.isPending ||
                          subscriptionMutation.isPending
                        }
                        onClick={() =>
                          handleStatusChange(business.id, !business.isActive)
                        }
                      >
                        {statusMutation.isPending
                          ? "Updating..."
                          : business.isActive
                            ? "Deactivate"
                            : "Activate"}
                      </button>

                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={
                          statusMutation.isPending ||
                          subscriptionMutation.isPending
                        }
                        onClick={() =>
                          handleSubscriptionRenewal(
                            business.id,
                            business.name,
                          )
                        }
                      >
                        {subscriptionMutation.isPending
                          ? "Updating..."
                          : business.subscription
                            ? "Renew Monthly"
                            : "Create Monthly Subscription"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="platform-panel" id="platform-audit-activity">
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
        <section className="platform-panel platform-control-panel" id="platform-health">
          <div className="platform-panel-header">
            <div>
              <div className="platform-eyebrow">SYSTEM HEALTH</div>
              <h2>Platform health & error center</h2>
            </div>
            {healthQuery.data?.checkedAt ? (
              <span>Checked {formatDate(healthQuery.data.checkedAt)}</span>
            ) : null}
          </div>

          {healthQuery.isLoading ? (
            <p className="platform-feedback">Checking platform health...</p>
          ) : healthQuery.isError ? (
            <div className="platform-feedback platform-error">
              <strong>Health check unavailable.</strong>
              <span>
                The platform health service could not be reached. Retry the
                health check to verify API and database status.
              </span>
            </div>
          ) : healthQuery.data ? (
            <>
              <div className="platform-growth-summary">
                <article className="platform-growth-card">
                  <span className="platform-kpi-label">Overall status</span>
                  <strong>
                    {healthQuery.data.status === "healthy"
                      ? "Healthy"
                      : "Degraded"}
                  </strong>
                  <small>
                    {healthQuery.data.status === "healthy"
                      ? "All monitored services are responding"
                      : "One or more monitored services need attention"}
                  </small>
                </article>

                <article className="platform-growth-card">
                  <span className="platform-kpi-label">API</span>
                  <strong>Healthy</strong>
                  <small>Platform API responding</small>
                </article>

                <article className="platform-growth-card">
                  <span className="platform-kpi-label">Database</span>
                  <strong>
                    {healthQuery.data.database === "healthy"
                      ? "Healthy"
                      : "Unhealthy"}
                  </strong>
                  <small>
                    {healthQuery.data.database === "healthy"
                      ? "Database connectivity confirmed"
                      : "Database connectivity failed"}
                  </small>
                </article>

                <article className="platform-growth-card">
                  <span className="platform-kpi-label">Environment</span>
                  <strong>{healthQuery.data.env}</strong>
                  <small>Active runtime environment</small>
                </article>
              </div>

              <div className="platform-control-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void healthQuery.refetch()}
                  disabled={healthQuery.isFetching}
                >
                  {healthQuery.isFetching ? "Checking..." : "Run health check"}
                </button>

                <span
                  className={`platform-status ${
                    healthQuery.data.status === "healthy"
                      ? "active"
                      : "inactive"
                  }`}
                >
                  {healthQuery.data.status === "healthy"
                    ? "System operational"
                    : "Attention required"}
                </span>
              </div>
            </>
          ) : (
            <p className="platform-feedback">
              No platform health information is currently available.
            </p>
          )}
        </section>

        <section className="platform-panel platform-control-panel">
          <div className="platform-panel-header">
            <div>
              <div className="platform-eyebrow">PLATFORM CONTROLS</div>
              <h2>Platform configuration</h2>
            </div>
            {configurationQuery.data ? (
              <span>Version {configurationQuery.data.version}</span>
            ) : null}
          </div>

          {configurationQuery.isLoading ? (
            <p className="platform-feedback">
              Loading platform configuration...
            </p>
          ) : configurationQuery.isError ? (
            <div className="platform-feedback platform-error">
              <strong>Configuration unavailable.</strong>
              <span>
                The platform configuration could not be loaded. Refresh the
                control center and try again.
              </span>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void configurationQuery.refetch()}
                disabled={configurationQuery.isFetching}
              >
                {configurationQuery.isFetching ? "Refreshing..." : "Refresh configuration"}
              </button>
            </div>
          ) : configurationQuery.data ? (
            <>
              <div className="platform-config-list">
                {(
                  [
                    [
                      "allowNewBusinessRegistration",
                      "New business registration",
                      "Allow new companies to register on the platform.",
                    ],
                    [
                      "maintenanceMode",
                      "Maintenance mode",
                      "Place the platform into controlled maintenance mode.",
                    ],
                    [
                      "whatsappMessagingEnabled",
                      "WhatsApp messaging",
                      "Allow WhatsApp-based customer messaging and delivery.",
                    ],
                    [
                      "automatedNotificationsEnabled",
                      "Automated notifications",
                      "Allow automated platform notification workflows.",
                    ],
                    [
                      "offlineSyncEnabled",
                      "Offline sync",
                      "Allow clients to synchronize queued offline work.",
                    ],
                  ] as const
                ).map(([key, label, description]) => {
                  const enabled = configurationQuery.data?.[key] ?? false;

                  return (
                    <div className="platform-config-row" key={key}>
                      <div>
                        <strong>{label}</strong>
                        <span>{description}</span>
                      </div>

                      <div className="platform-config-action">
                        <span
                          className={`platform-status ${
                            enabled ? "active" : "inactive"
                          }`}
                        >
                          {enabled ? "Enabled" : "Disabled"}
                        </span>
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={configurationMutation.isPending}
                          onClick={() => {
                            if (
                              enabled &&
                              !window.confirm(
                                `Disable ${label.toLowerCase()} platform-wide?`,
                              )
                            ) {
                              return;
                            }

                            configurationMutation.mutate({
                              field: key,
                              value: !enabled,
                            });
                          }}
                        >
                          {configurationMutation.isPending
                            ? "Saving..."
                            : enabled
                              ? "Disable"
                              : "Enable"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {configurationFeedback ? (
                <div
                  className={`platform-feedback ${
                    configurationMutation.isError ? "platform-error" : ""
                  }`}
                  role={configurationMutation.isError ? "alert" : "status"}
                  aria-live="polite"
                >
                  {configurationFeedback}
                </div>
              ) : null}
            </>
          ) : (
            <p className="platform-feedback">
              No platform configuration is currently available.
            </p>
          )}
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
