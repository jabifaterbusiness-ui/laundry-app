import type { getBusinessFinancialStatement } from "../business-financial-statement.service.js";

function money(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderFinancialStatementEmail(input: {
  businessName: string;
  periodLabel: string;
  currencyCode: string;
  report: Awaited<ReturnType<typeof getBusinessFinancialStatement>>;
}) {
  const { report } = input;

    const categoryRows = Object.entries(report.expenses.byCategory)
      .map(
        ([category, amount]) => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(category)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(amount, input.currencyCode)}</td>
          </tr>
        `,
      )
      .join("");

  const resultLabel =
    report.profitOrLoss.amount >= 0 ? "Profit" : "Loss";

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f7fa;font-family:Arial,sans-serif;color:#17202a">
    <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
      <h1 style="margin:0 0 6px">${escapeHtml(input.businessName)}</h1>
      <p style="margin:0 0 24px;color:#667085">
        Monthly Financial Statement — ${escapeHtml(input.periodLabel)}
      </p>

      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:10px 0">Gross revenue</td>
          <td style="padding:10px 0;text-align:right">${money(report.revenue.grossInvoiced, input.currencyCode)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0">Refunds</td>
          <td style="padding:10px 0;text-align:right">${money(report.revenue.refunds, input.currencyCode)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-weight:bold">Net revenue</td>
          <td style="padding:10px 0;text-align:right;font-weight:bold">${money(report.revenue.netRevenue, input.currencyCode)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0">Explicit recognized expenses</td>
          <td style="padding:10px 0;text-align:right">${money(report.expenses.explicit, input.currencyCode)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0">Salary expense</td>
          <td style="padding:10px 0;text-align:right">${money(report.expenses.salary, input.currencyCode)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-weight:bold">Total expenses</td>
          <td style="padding:10px 0;text-align:right;font-weight:bold">${money(report.expenses.total, input.currencyCode)}</td>
        </tr>
        <tr>
          <td style="padding:14px 0;font-size:18px;font-weight:bold;border-top:2px solid #17202a">${resultLabel}</td>
          <td style="padding:14px 0;text-align:right;font-size:18px;font-weight:bold;border-top:2px solid #17202a">${money(Math.abs(report.profitOrLoss.amount), input.currencyCode)}</td>
        </tr>
      </table>

      ${
        categoryRows
          ? `
      <h2 style="margin-top:30px">Expense breakdown</h2>
      <table style="width:100%;border-collapse:collapse">
        ${categoryRows}
      </table>
      `
          : ""
      }

      <p style="margin-top:28px;color:#667085;font-size:12px">
        This statement is generated from recognized accounting records for the business-wide reporting period.
      </p>
    </div>
  </body>
</html>
`;
}
