import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import { getDashboardReport } from "../../lib/reports-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";

function formatMoney(value: number) {
  return `₦${value.toLocaleString()}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "All available data";
  }

  return new Date(value).toLocaleDateString();
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getFirstDayOfMonth() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

export function ReportsPage() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);
  const canViewReports = hasPermission(user, "reports.view");

  const [from, setFrom] = useState(getFirstDayOfMonth);
  const [to, setTo] = useState(getToday);
  const [appliedRange, setAppliedRange] = useState<{
    from?: string;
    to?: string;
  }>({
    from: getFirstDayOfMonth(),
    to: getToday(),
  });

  const reportQuery = useQuery({
    queryKey: ["reports", "dashboard", activeBranchId, appliedRange],
    queryFn: () =>
      getDashboardReport(
        {
          from: appliedRange.from,
          to: appliedRange.to,
        },
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(accessToken && activeBranchId && canViewReports),
  });

  function applyDateRange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (from > to) {
      return;
    }

    setAppliedRange({ from, to });
  }

  function clearDateRange() {
    setFrom("");
    setTo("");
    setAppliedRange({});
  }

  const report = reportQuery.data;

  return (
    <main>
      <h1>Reports</h1>
      <p>
        Business performance and operational summary for the selected branch.
      </p>

      <section aria-labelledby="reports-period-heading">
        <h2 id="reports-period-heading">Report period</h2>

        <form onSubmit={applyDateRange}>
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>

          <label>
            To
            <input
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
          <p role="alert">The From date must be before or equal to the To date.</p>
        )}
      </section>

      {reportQuery.isLoading && <p>Loading reports...</p>}

      {reportQuery.isError && (
        <section role="alert">
          <h2>Unable to load reports</h2>
          <p>
            {reportQuery.error instanceof ApiError
              ? reportQuery.error.message
              : "Something went wrong while loading the report."}
          </p>
          <button type="button" onClick={() => reportQuery.refetch()}>
            Try again
          </button>
        </section>
      )}

      {report && (
        <>
          <p>
            Showing {formatDate(report.period.from)} to{" "}
            {formatDate(report.period.to)}
          </p>

          <section aria-labelledby="orders-report-heading">
            <h2 id="orders-report-heading">Orders</h2>
            <p>Total orders: {report.orders.total.toLocaleString()}</p>
          </section>

          <section aria-labelledby="invoices-report-heading">
            <h2 id="invoices-report-heading">Invoices</h2>
            <p>Total invoices: {report.invoices.total.toLocaleString()}</p>
            <p>
              Invoiced: {formatMoney(report.invoices.totalAmount)}
            </p>
            <p>
              Outstanding:{" "}
              {formatMoney(report.invoices.outstandingAmount)}
            </p>
          </section>

          <section aria-labelledby="payments-report-heading">
            <h2 id="payments-report-heading">Payments</h2>
            <p>Received: {formatMoney(report.payments.received)}</p>
            <p>Refunded: {formatMoney(report.payments.refunded)}</p>
            <p>Net received: {formatMoney(report.payments.netReceived)}</p>
          </section>

          <section aria-labelledby="customers-report-heading">
            <h2 id="customers-report-heading">Customers</h2>
            <p>
              Active customers: {report.customers.active.toLocaleString()}
            </p>
          </section>

          <section aria-labelledby="inventory-report-heading">
            <h2 id="inventory-report-heading">Inventory</h2>
            <p>
              Stock items: {report.inventory.stockItems.toLocaleString()}
            </p>
            <p>
              Movements: {report.inventory.movements.toLocaleString()}
            </p>
          </section>
        </>
      )}
    </main>
  );
}
