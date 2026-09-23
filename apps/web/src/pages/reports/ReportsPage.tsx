import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import { getAnnualReport, getDashboardReport } from "../../lib/reports-api.js";
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

  const [annualYear, setAnnualYear] = useState(String(new Date().getFullYear()));
  const [from, setFrom] = useState(getFirstDayOfMonth);
  const [to, setTo] = useState(getToday);
  const [appliedRange, setAppliedRange] = useState<{
    from?: string;
    to?: string;
  }>({
    from: getFirstDayOfMonth(),
    to: getToday(),
  });

  const annualReportQuery = useQuery({
    queryKey: ["reports", "annual", annualYear],
    queryFn: () => getAnnualReport(Number(annualYear), { accessToken }),
    enabled: Boolean(
      accessToken &&
        canViewReports &&
        /^\d{4}$/.test(annualYear),
    ),
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

      <section aria-labelledby="annual-report-heading">
        <h2 id="annual-report-heading">Annual Financial Report</h2>

        <label>
          Year
          <input
            type="number"
            min="2000"
            max="2100"
            value={annualYear}
            onChange={(event) => setAnnualYear(event.target.value)}
          />
        </label>

        {annualReportQuery.isLoading && <p>Loading annual report...</p>}

        {annualReportQuery.isError && (
          <p role="alert">
            {annualReportQuery.error instanceof ApiError
              ? annualReportQuery.error.message
              : "Unable to load the annual report."}
          </p>
        )}

        {annualReportQuery.data && (
          <>
            <p>
              {annualReportQuery.data.period.year} business-wide financial
              report across all branches.
            </p>

            <h3>Annual financial summary</h3>
            <p>
              Gross revenue:{" "}
              {formatMoney(annualReportQuery.data.revenue.grossInvoiced)}
            </p>
            <p>
              Refunds: {formatMoney(annualReportQuery.data.revenue.refunds)}
            </p>
            <p>
              Net revenue:{" "}
              {formatMoney(annualReportQuery.data.revenue.netRevenue)}
            </p>
            <p>
              Total expenses:{" "}
              {formatMoney(annualReportQuery.data.expenses.total)}
            </p>
            <p>
              Profit/Loss:{" "}
              {formatMoney(annualReportQuery.data.profitOrLoss.amount)}
            </p>

            <h3>Annual collection</h3>
            <p>
              Invoices:{" "}
              {annualReportQuery.data.collection.annualInvoiceCount.toLocaleString()}
            </p>
            <p>
              Invoiced:{" "}
              {formatMoney(
                annualReportQuery.data.collection.annualInvoiceAmount,
              )}
            </p>
            <p>
              Collected:{" "}
              {formatMoney(
                annualReportQuery.data.collection.annualCollectedAmount,
              )}
            </p>
            <p>
              Collection rate:{" "}
              {annualReportQuery.data.collection.collectionRate.toFixed(1)}%
            </p>
            <p>
              Year-end outstanding:{" "}
              {formatMoney(
                annualReportQuery.data.collection.yearEndOutstandingAmount,
              )}
            </p>

            <h3>Monthly financial trend</h3>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Revenue</th>
                  <th>Expenses</th>
                  <th>Profit/Loss</th>
                </tr>
              </thead>
              <tbody>
                {annualReportQuery.data.monthlyTrend.map((month) => (
                  <tr key={month.month}>
                    <td>{month.month}</td>
                    <td>{formatMoney(month.netRevenue)}</td>
                    <td>{formatMoney(month.totalExpenses)}</td>
                    <td>{formatMoney(month.profitOrLoss)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Outstanding invoices by Year → Month</h3>
            {Object.entries(
              annualReportQuery.data.outstandingByYearMonth,
            ).map(([year, months]) => (
              <div key={year}>
                <h4>{year}</h4>
                {Object.entries(months).map(([month, bucket]) => (
                  <div key={month}>
                    <strong>{month}</strong>: {bucket.invoiceCount} invoices —{" "}
                    {formatMoney(bucket.outstandingAmount)}
                    <ul>
                      {bucket.invoices.map((invoice) => (
                        <li key={invoice.invoiceId}>
                          {invoice.invoiceNumber}:{" "}
                          {formatMoney(invoice.outstanding)} outstanding
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}

            <h3>Management insights</h3>
            <ul>
              {annualReportQuery.data.managementInsights.map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          </>
        )}
      </section>

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

          <section aria-labelledby="collection-report-heading">
            <h2 id="collection-report-heading">Collection Statement</h2>
            <p>Collected: {formatMoney(report.invoices.collectedAmount)}</p>
            <p>Outstanding: {formatMoney(report.invoices.outstandingAmount)}</p>
            <p>Collection rate: {report.invoices.collectionRate.toFixed(1)}%</p>
            <p>Picked up garments: {report.pickup.pickedUpCount.toLocaleString()}</p>
            <p>Unpicked garments: {report.pickup.unpickedCount.toLocaleString()}</p>

            <h3>Outstanding by Year → Month</h3>
            {Object.entries(report.invoices.outstandingByYearMonth).map(([year, months]) => (
              <div key={year}>
                <h4>{year}</h4>
                {Object.entries(months).map(([month, bucket]) => (
                  <div key={month}>
                    <strong>{month}</strong>: {bucket.invoiceCount} invoices — {formatMoney(bucket.outstandingAmount)}
                  </div>
                ))}
              </div>
            ))}

            <h3>Management Advice / Attention Areas</h3>
            <ul>
              {report.managementInsights.map((insight) => <li key={insight}>{insight}</li>)}
            </ul>
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
