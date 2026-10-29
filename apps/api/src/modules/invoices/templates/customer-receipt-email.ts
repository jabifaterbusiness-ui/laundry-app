import type { CustomerReceipt } from "../receipts.service.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatAmount(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function safeColor(value: string | null, fallback: string): string {
  return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback;
}

export function renderCustomerReceiptEmail(receipt: CustomerReceipt): string {
  const items = receipt.items
    .map((item) => {
      const piecesPerUnit =
        item.quantity > 0 && item.totalPieces > 0
          ? item.totalPieces / item.quantity
          : 1;
      const ratePerPiece = item.unitPrice / piecesPerUnit;
      const colors =
        item.colors.length > 0
          ? `<div class="colors">${escapeHtml(item.colors.join(", "))}</div>`
          : "";

      return `
        <tr>
          <td>${item.quantity}</td>
          <td>
            <strong>${escapeHtml(item.itemName)}</strong>
            ${colors}
          </td>
          <td>${formatAmount(ratePerPiece)}</td>
          <td>${formatAmount(item.totalPieces * ratePerPiece)}</td>
        </tr>`;
    })
    .join("");

  const totalPieces = receipt.items.reduce(
    (total, item) => total + item.totalPieces,
    0,
  );

  const paymentRows = receipt.payments.length
    ? receipt.payments.map((payment) => {
        const method = payment.type === "REFUND"
          ? "Refund"
          : ({
              CASH: "Cash",
              TRANSFER: "Bank transfer",
              POS: "POS",
              PAY_FROM_ACCOUNT: "Customer account",
            } as const)[payment.method as "CASH" | "TRANSFER" | "POS" | "PAY_FROM_ACCOUNT"];
        return `<tr><td>${escapeHtml(formatDate(payment.createdAt))}</td><td>${escapeHtml(method)}</td><td>${escapeHtml(payment.reference ?? "—")}</td><td>${payment.type === "REFUND" ? "−" : ""}${formatAmount(payment.amount)}</td></tr>`;
      }).join("")
    : '<tr><td colspan="4">No payments recorded.</td></tr>';

  const paymentHistory = `
    <div class="payment-history">
      <h2>Payment History</h2>
      <table>
        <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead>
        <tbody>${paymentRows}</tbody>
      </table>
      <div class="payment-totals">
        <div><span>Total amount</span><strong>${formatAmount(receipt.totalAmount)}</strong></div>
        <div><span>Amount paid</span><strong>${formatAmount(receipt.totalPaid)}</strong></div>
        <div><span>Balance due</span><strong>${formatAmount(receipt.balanceDue)}</strong></div>
      </div>
    </div>`;

  const companyContact = [
    receipt.companyPhone,
    receipt.companyEmail,
    receipt.companyWebsite,
    receipt.companyAddress,
  ]
    .filter(Boolean)
    .map((value) => `<div>${escapeHtml(value as string)}</div>`)
    .join("");

  const primaryColor = safeColor(receipt.receiptPrimaryColor, "#111827");
  const accentColor = safeColor(receipt.receiptAccentColor, "#2563eb");
  const backgroundColor = safeColor(receipt.receiptBackgroundColor, "#f3f4f6");
  const textColor = safeColor(receipt.receiptTextColor, "#111827");
  const headerStyle = receipt.receiptHeaderStyle?.trim() || "standard";

  const logo = receipt.logoUrl
    ? `<img src="${escapeAttribute(receipt.logoUrl)}" alt="${escapeAttribute(receipt.companyName)} logo" class="logo">`
    : "";

  const headerClass =
    headerStyle.toLowerCase() === "compact"
      ? "header header-compact"
      : headerStyle.toLowerCase() === "centered"
        ? "header header-centered"
        : "header";

  const garmentNote = receipt.garmentNote
    ? `
      <div class="note">
        <strong>Garment Note</strong>
        <div>${escapeHtml(receipt.garmentNote)}</div>
      </div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(receipt.invoiceNumber)} — Laundry Receipt</title>
  <style>
    body {
      margin: 0;
      padding: 24px 12px;
      background: ${backgroundColor};
      color: ${textColor};
      font-family: Arial, Helvetica, sans-serif;
    }

    .receipt {
      max-width: 720px;
      margin: 0 auto;
      background: #ffffff;
      border-top: 6px solid ${primaryColor};
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 4px 18px rgba(0,0,0,.08);
    }

    .header {
      padding: 24px;
      background: ${primaryColor};
      color: #ffffff;
    }

    .logo {
      display: block;
      max-width: 140px;
      max-height: 64px;
      width: auto;
      height: auto;
      margin-bottom: 10px;
      object-fit: contain;
    }

    .header-centered {
      text-align: center;
    }

    .header-compact {
      padding-top: 16px;
      padding-bottom: 16px;
    }

    .company {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .contact {
      font-size: 12px;
      line-height: 1.6;
      opacity: .9;
    }

    .content {
      padding: 24px;
    }

    .title {
      margin: 0 0 4px;
      font-size: 24px;
      font-weight: 700;
    }

    .meta {
      color: #6b7280;
      font-size: 13px;
      line-height: 1.7;
      margin-bottom: 20px;
    }

    .customer {
      padding: 14px;
      margin-bottom: 20px;
      background: #f9fafb;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.6;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    th {
      padding: 10px 6px;
      text-align: left;
      border-bottom: 2px solid ${accentColor};
      font-size: 11px;
      text-transform: uppercase;
    }

    td {
      padding: 11px 6px;
      border-bottom: 1px solid #e5e7eb;
    }

    th:nth-child(1),
    td:nth-child(1) {
      width: 10%;
      text-align: center;
    }

    th:nth-child(2),
    td:nth-child(2) {
      width: 48%;
      text-align: left;
    }

    th:nth-child(3),
    td:nth-child(3) {
      width: 20%;
      text-align: right;
    }

    th:nth-child(4),
    td:nth-child(4) {
      width: 22%;
      text-align: right;
    }

    .colors {
      margin-top: 3px;
      color: #6b7280;
      font-size: 11px;
      line-height: 1.35;
    }

    .summary {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      margin-top: 18px;
      padding-top: 12px;
      border-top: 3px solid ${primaryColor};
    }

    .summary-pcs {
      font-size: 13px;
      color: #6b7280;
    }

    .summary-pcs strong {
      display: block;
      margin-top: 3px;
      color: ${textColor};
      font-size: 17px;
    }

    .total {
      display: flex;
      justify-content: space-between;
      margin-top: 0;
      padding: 0;
      border-top: 0;
      font-size: 18px;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      margin-top: 18px;
      padding: 16px 0;
      border-top: 3px solid ${primaryColor};
      font-size: 18px;
      font-weight: 700;
    }

    .payment-history {
      margin-top: 22px;
      font-size: 13px;
    }

    .payment-history h2 {
      font-size: 16px;
      margin: 0 0 8px;
    }

    .payment-history th,
    .payment-history td {
      padding: 8px 5px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
      overflow-wrap: anywhere;
    }

    .payment-history th:last-child,
    .payment-history td:last-child {
      text-align: right;
      white-space: nowrap;
    }

    .payment-totals {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 2px solid ${primaryColor};
    }

    .payment-totals span,
    .payment-totals strong {
      display: block;
    }

    .payment-totals span {
      font-size: 11px;
      color: #6b7280;
    }

    .payment-totals strong {
      margin-top: 4px;
      font-size: 14px;
      overflow-wrap: anywhere;
    }

    .note,
    .agreement {
      margin-top: 18px;
      padding: 14px;
      border-radius: 8px;
      background: #f9fafb;
      font-size: 13px;
      line-height: 1.6;
    }

    .agreement {
      border-left: 4px solid ${accentColor};
    }

    .note strong,
    .agreement strong {
      display: block;
      margin-bottom: 5px;
    }

    .footer {
      padding: 18px 24px 24px;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
      line-height: 1.6;
    }

    @media (max-width: 560px) {
      body {
        padding: 0;
      }

      .receipt {
        border-radius: 0;
      }

      .content,
      .header {
        padding: 18px;
      }

      table {
        font-size: 11px;
      }

      th,
      td {
        padding: 8px 3px;
      }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="${headerClass}">
      ${logo}
      <div class="company">${escapeHtml(receipt.companyName)}</div>
      <div class="contact">${companyContact}</div>
    </div>

    <div class="content">
      <h1 class="title">Laundry Receipt</h1>

      <div class="meta">
        Invoice: ${escapeHtml(receipt.invoiceNumber)}<br>
        Order: ${escapeHtml(receipt.orderNumber)}<br>
        Date: ${escapeHtml(formatDate(receipt.createdAt))}
      </div>

      <div class="customer">
        <strong>Customer:</strong> ${escapeHtml(receipt.customerName)}<br>
        <strong>Branch:</strong> ${escapeHtml(receipt.branchName)}
      </div>

      <table>
        <thead>
          <tr>
            <th>QTY</th>
            <th>ITEM / COLORS</th>
            <th>RATE / PC</th>
            <th>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${items}
        </tbody>
      </table>

      ${garmentNote}

      ${paymentHistory}

      <div class="summary">
        <div class="summary-pcs">
          TOTAL PCS
          <strong>${totalPieces}</strong>
        </div>

        <div class="total">
          <span>TOTAL AMOUNT</span>
          <span>${formatAmount(receipt.totalAmount)}</span>
        </div>
      </div>

      <div class="agreement">
        <strong>Customer Agreement</strong>
        ${escapeHtml(receipt.customerAgreement)}
      </div>
    </div>

    <div class="footer">
      Thank you for choosing us.<br>
      Please keep this receipt for your records.
    </div>
  </div>
</body>
</html>`;
}
