import sharp from "sharp";
import type { getBusinessFinancialStatement } from "../business-financial-statement.service.js";

function money(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function renderFinancialStatementImage(input: {
  businessName: string;
  periodLabel: string;
  currencyCode: string;
  report: Awaited<ReturnType<typeof getBusinessFinancialStatement>>;
}) {
  const { report } = input;
  const resultLabel =
    report.profitOrLoss.amount >= 0 ? "PROFIT" : "LOSS";

  const svg = `
<svg width="1200" height="1500" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="1500" fill="#ffffff"/>
  <rect x="0" y="0" width="1200" height="170" fill="#17202a"/>

  <text x="60" y="72" font-family="Arial" font-size="42" font-weight="bold" fill="#ffffff">
    ${escapeXml(input.businessName)}
  </text>
  <text x="60" y="125" font-family="Arial" font-size="28" fill="#d9e2ec">
    Monthly Financial Statement
  </text>

  <text x="60" y="225" font-family="Arial" font-size="30" font-weight="bold" fill="#17202a">
    ${escapeXml(input.periodLabel)}
  </text>

  <text x="70" y="310" font-family="Arial" font-size="28" fill="#52606d">Gross revenue</text>
  <text x="1130" y="310" text-anchor="end" font-family="Arial" font-size="28" font-weight="bold" fill="#17202a">
    ${escapeXml(money(report.revenue.grossInvoiced, input.currencyCode))}
  </text>

  <text x="70" y="375" font-family="Arial" font-size="28" fill="#52606d">Refunds</text>
  <text x="1130" y="375" text-anchor="end" font-family="Arial" font-size="28" font-weight="bold" fill="#17202a">
    ${escapeXml(money(report.revenue.refunds, input.currencyCode))}
  </text>

  <line x1="70" y1="405" x2="1130" y2="405" stroke="#d9e2ec" stroke-width="2"/>

  <text x="70" y="460" font-family="Arial" font-size="30" font-weight="bold" fill="#17202a">Net revenue</text>
  <text x="1130" y="460" text-anchor="end" font-family="Arial" font-size="30" font-weight="bold" fill="#17202a">
    ${escapeXml(money(report.revenue.netRevenue, input.currencyCode))}
  </text>

  <text x="70" y="545" font-family="Arial" font-size="28" fill="#52606d">Recognized expenses</text>
  <text x="1130" y="545" text-anchor="end" font-family="Arial" font-size="28" font-weight="bold" fill="#17202a">
    ${escapeXml(money(report.expenses.explicit, input.currencyCode))}
  </text>

  <text x="70" y="610" font-family="Arial" font-size="28" fill="#52606d">Salary expense</text>
  <text x="1130" y="610" text-anchor="end" font-family="Arial" font-size="28" font-weight="bold" fill="#17202a">
    ${escapeXml(money(report.expenses.salary, input.currencyCode))}
  </text>

  <line x1="70" y1="645" x2="1130" y2="645" stroke="#d9e2ec" stroke-width="2"/>

  <text x="70" y="705" font-family="Arial" font-size="32" font-weight="bold" fill="#17202a">Total expenses</text>
  <text x="1130" y="705" text-anchor="end" font-family="Arial" font-size="32" font-weight="bold" fill="#17202a">
    ${escapeXml(money(report.expenses.total, input.currencyCode))}
  </text>

  <rect x="60" y="770" width="1080" height="150" rx="16" fill="#f5f7fa"/>
  <text x="100" y="830" font-family="Arial" font-size="32" font-weight="bold" fill="#17202a">
    ${resultLabel}
  </text>
  <text x="1100" y="875" text-anchor="end" font-family="Arial" font-size="44" font-weight="bold" fill="#17202a">
    ${escapeXml(money(Math.abs(report.profitOrLoss.amount), input.currencyCode))}
  </text>

  <text x="60" y="1010" font-family="Arial" font-size="30" font-weight="bold" fill="#17202a">
    Expense categories
  </text>

  ${
      Object.entries(report.expenses.byCategory)
        .slice(0, 8)
        .map(
          ([category, amount], index) => `
    <text x="80" y="${1080 + index * 48}" font-family="Arial" font-size="24" fill="#52606d">
      ${escapeXml(category)}
    </text>
    <text x="1120" y="${1080 + index * 48}" text-anchor="end" font-family="Arial" font-size="24" font-weight="bold" fill="#17202a">
      ${escapeXml(money(amount, input.currencyCode))}
    </text>
  `,
        )
        .join("")
    }

  <text x="60" y="1450" font-family="Arial" font-size="20" fill="#7b8794">
    Generated from recognized accounting records.
  </text>
</svg>
`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
