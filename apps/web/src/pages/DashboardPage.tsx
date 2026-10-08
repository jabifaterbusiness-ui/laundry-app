import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../lib/api-client.js";
import { getDashboardReport } from "../lib/reports-api.js";
import { hasPermission } from "../lib/permissions.js";
import { useAuthStore } from "../state/auth-store.js";

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getFirstDayOfMonth() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return `₦${value.toLocaleString()}`;
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function formatDate(value: string | null) {
  if (!value) return "All available data";
  return new Date(value).toLocaleDateString();
}

function collectionPercentage(
  invoiced: number,
  received: number,
) {
  if (invoiced <= 0) return 0;
  return Math.min(100, Math.max(0, (received / invoiced) * 100));
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);
  const canViewReports = hasPermission(user, "reports.view");
  const canViewFinance =
    hasPermission(user, "reports.view") ||
    hasPermission(user, "expenses.view");
  const canCreateOrder = hasPermission(user, "orders.create");
  const canViewOrders = hasPermission(user, "orders.view");
  const canViewCustomers = hasPermission(user, "customers.view");
  const canViewInvoices = hasPermission(user, "invoices.view");
  const canViewPayments = hasPermission(user, "payments.view");
  const canViewInventory = hasPermission(user, "inventory.view");
  const canManageSubscription = user?.role === "BUSINESS_OWNER";

  const [from, setFrom] = useState(getFirstDayOfMonth);
  const [to, setTo] = useState(getToday);
  const [appliedRange, setAppliedRange] = useState({
    from: getFirstDayOfMonth(),
    to: getToday(),
  });

  const reportQuery = useQuery({
    queryKey: ["reports", "dashboard", activeBranchId, appliedRange],
    queryFn: () =>
      getDashboardReport(
        appliedRange,
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(accessToken && activeBranchId && canViewReports),
  });

  function applyDateRange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (from > to) return;

    setAppliedRange({ from, to });
  }

  function clearDateRange() {
    setFrom("");
    setTo("");
    setAppliedRange({ from: "", to: "" });
  }

  const report = reportQuery.data;

  const paymentPercentage = report
    ? collectionPercentage(
        report.invoices.totalAmount,
        report.payments.received,
      )
    : 0;

  const hasActivity =
    report &&
    (report.orders.total > 0 ||
      report.invoices.total > 0 ||
      report.invoices.totalAmount > 0 ||
      report.payments.received > 0 ||
      report.customers.active > 0 ||
      report.inventory.stockItems > 0 ||
      report.inventory.movements > 0);

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">Laundry Angel</p>
          <h1>Good to see you, {user?.fullName ?? "there"}</h1>
          <p className="dashboard-subtitle">
            Here is your business performance overview for the selected period.
          </p>
        </div>

        {canCreateOrder ? (
          <Link className="dashboard-primary-action" to="/orders">
            + New order
          </Link>
        ) : null}
      </header>

      <section className="dashboard-toolbar" aria-labelledby="dashboard-period-heading">
        <div>
          <h2 id="dashboard-period-heading">Performance period</h2>
          <p>
            {report
              ? `${formatDate(report.period.from)} – ${formatDate(report.period.to)}`
              : "Choose a reporting period"}
          </p>
        </div>

        <form className="dashboard-date-form" onSubmit={applyDateRange}>
          <label>
            From
            <input
              aria-label="Dashboard from date"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>

          <label>
            To
            <input
              aria-label="Dashboard to date"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>

          <button type="submit" disabled={from > to}>
            Apply
          </button>

          <button type="button" onClick={clearDateRange}>
            All time
          </button>
        </form>

        {from > to && (
          <p className="dashboard-validation" role="alert">
            The From date must be before or equal to the To date.
          </p>
        )}
      </section>

      {reportQuery.isLoading && (
        <section
          className="dashboard-kpi-grid"
          aria-label="Loading dashboard metrics"
          aria-busy="true"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <article className="dashboard-kpi-card dashboard-skeleton-card" key={index}>
              <span className="dashboard-skeleton dashboard-skeleton-label" />
              <span className="dashboard-skeleton dashboard-skeleton-value" />
              <span className="dashboard-skeleton dashboard-skeleton-small" />
            </article>
          ))}
        </section>
      )}

      {reportQuery.isError && (
        <section className="dashboard-feedback dashboard-error" role="alert">
          <div>
            <h2>Unable to load your dashboard</h2>
            <p>
              {reportQuery.error instanceof ApiError
                ? reportQuery.error.message
                : "Something went wrong while loading the dashboard."}
            </p>
          </div>

          <button type="button" onClick={() => reportQuery.refetch()}>
            Try again
          </button>
        </section>
      )}

      {report && (
        <>
          <section className="dashboard-kpi-grid" aria-label="Business performance">
            <Link className="dashboard-kpi-card" to="/orders" aria-label="View orders">
              <div className="dashboard-kpi-icon">↗</div>
              <p>Orders</p>
              <strong>{formatNumber(report.orders.total)}</strong>
              <span>Orders in period</span>
            </Link>

            <Link className="dashboard-kpi-card" to="/invoices" aria-label="View invoices">
              <div className="dashboard-kpi-icon">₦</div>
              <p>Total invoiced</p>
              <strong>{formatMoney(report.invoices.totalAmount)}</strong>
              <span>{formatNumber(report.invoices.total)} invoices</span>
            </Link>

            <Link className="dashboard-kpi-card dashboard-kpi-card-warning" to="/invoices" aria-label="View outstanding invoices">
              <div className="dashboard-kpi-icon">!</div>
              <p>Outstanding</p>
              <strong>{formatMoney(report.invoices.outstandingAmount)}</strong>
              <span>Amount still outstanding</span>
            </Link>

            <Link className="dashboard-kpi-card" to="/payments" aria-label="View payments">
              <div className="dashboard-kpi-icon">✓</div>
              <p>Net received</p>
              <strong>{formatMoney(report.payments.netReceived)}</strong>
              <span>
                {formatMoney(report.payments.received)} received
              </span>
            </Link>

            <Link className="dashboard-kpi-card" to="/customers" aria-label="View customers">
              <div className="dashboard-kpi-icon">♙</div>
              <p>Active customers</p>
              <strong>{formatNumber(report.customers.active)}</strong>
              <span>Active customer accounts</span>
            </Link>

            <Link className="dashboard-kpi-card" to="/inventory" aria-label="View inventory">
              <div className="dashboard-kpi-icon">▦</div>
              <p>Stock items</p>
              <strong>{formatNumber(report.inventory.stockItems)}</strong>
              <span>
                {formatNumber(report.inventory.movements)} movements
              </span>
            </Link>
          </section>

          {!hasActivity && (
            <section className="dashboard-empty">
              <div className="dashboard-empty-mark">✦</div>
              <h2>No activity for this period</h2>
              <p>
                There is no business activity in the selected period yet.
                Try another date range or create your first order.
              </p>
              <Link className="dashboard-primary-action" to="/orders">
                Create an order
              </Link>
            </section>
          )}

          {hasActivity && (
            <section className="dashboard-overview-grid" aria-label="Business overview">
              <article className="dashboard-overview-card dashboard-overview-card-primary">
                <div>
                  <p className="dashboard-panel-eyebrow">Collections</p>
                  <h2>Payment collection</h2>
                  <strong>{paymentPercentage.toFixed(0)}%</strong>
                </div>

                <div
                  className="dashboard-progress"
                  role="progressbar"
                  aria-label="Payment collection percentage"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(paymentPercentage)}
                >
                  <span style={{ width: `${paymentPercentage}%` }} />
                </div>

                <div className="dashboard-panel-stats">
                  <span>
                    Received <strong>{formatMoney(report.payments.received)}</strong>
                  </span>
                  <span>
                    Outstanding{" "}
                    <strong>{formatMoney(report.invoices.outstandingAmount)}</strong>
                  </span>
                </div>
              </article>

              <article className="dashboard-overview-card">
                <div className="dashboard-panel-heading">
                  <div>
                    <p className="dashboard-panel-eyebrow">Payments</p>
                    <h2>Payment activity</h2>
                  </div>
                </div>

                <div className="dashboard-payment-list">
                  <div>
                    <span>Payments received</span>
                    <strong>{formatMoney(report.payments.received)}</strong>
                  </div>
                  <div>
                    <span>Refunds</span>
                    <strong>{formatMoney(report.payments.refunded)}</strong>
                  </div>
                  <div>
                    <span>Net received</span>
                    <strong>{formatMoney(report.payments.netReceived)}</strong>
                  </div>
                </div>
              </article>
            </section>
          )}

          <section className="dashboard-workspaces" aria-labelledby="dashboard-workspaces-heading">
            <div className="dashboard-section-heading">
              <div>
                <p className="dashboard-panel-eyebrow">Workspaces</p>
                <h2 id="dashboard-workspaces-heading">Business areas</h2>
                <p>Open a dedicated workspace to manage each part of your business.</p>
              </div>
            </div>

            <div className="dashboard-workspace-grid">
              {canManageSubscription ? (
                <Link className="dashboard-workspace-card" to="/subscription">
                  <span className="dashboard-workspace-icon">◉</span>
                  <div>
                    <strong>Subscription</strong>
                    <span>
                      Manage your Laundry Angel subscription and payment.
                    </span>
                    <b>Open subscription →</b>
                  </div>
                </Link>
              ) : null}
              {canViewOrders ? (
                <Link className="dashboard-workspace-card" to="/orders">
                  <span className="dashboard-workspace-icon">▣</span>
                  <div>
                    <strong>Orders</strong>
                    <span>Create, update and track laundry orders.</span>
                  </div>
                  <b>Open workspace →</b>
                </Link>
              ) : null}

              {canViewCustomers ? (
                <Link className="dashboard-workspace-card" to="/customers">
                  <span className="dashboard-workspace-icon">♙</span>
                  <div>
                    <strong>Customers</strong>
                    <span>Manage customer accounts and information.</span>
                  </div>
                  <b>Open workspace →</b>
                </Link>
              ) : null}

              {canViewInvoices ? (
                <Link className="dashboard-workspace-card" to="/invoices">
                  <span className="dashboard-workspace-icon">▤</span>
                  <div>
                    <strong>Invoices & Receipts</strong>
                    <span>Review invoices, billing and receipts.</span>
                  </div>
                  <b>Open workspace →</b>
                </Link>
              ) : null}

              {canViewPayments ? (
                <Link className="dashboard-workspace-card" to="/payments">
                  <span className="dashboard-workspace-icon">₦</span>
                  <div>
                    <strong>Payments</strong>
                    <span>Record and review customer payments.</span>
                  </div>
                  <b>Open workspace →</b>
                </Link>
              ) : null}

              {canViewInventory ? (
                <Link className="dashboard-workspace-card" to="/inventory">
                  <span className="dashboard-workspace-icon">□</span>
                  <div>
                    <strong>Inventory</strong>
                    <span>Manage stock, movements and adjustments.</span>
                  </div>
                  <b>Open workspace →</b>
                </Link>
              ) : null}

              {canViewFinance ? (
                <Link className="dashboard-workspace-card dashboard-workspace-card-finance" to="/finance">
                  <span className="dashboard-workspace-icon">₦</span>
                  <div>
                    <strong>Finance</strong>
                    <span>Manage expenses, financial statements and business finances.</span>
                  </div>
                  <b>Open workspace →</b>
                </Link>
              ) : null}

              {canViewReports ? (
                <Link className="dashboard-workspace-card" to="/reports">
                  <span className="dashboard-workspace-icon">▥</span>
                  <div>
                    <strong>Reports</strong>
                    <span>View financial, collection, outstanding and annual reports.</span>
                  </div>
                  <b>Open workspace →</b>
                </Link>
              ) : null}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
