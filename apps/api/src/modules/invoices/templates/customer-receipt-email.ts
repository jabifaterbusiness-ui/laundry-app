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

export function renderCustomerReceiptEmail(receipt: CustomerReceipt): string {
  const items = receipt.items
    .map(
      (item) => `
        <tr>
          <td>${item.quantity}</td>
          <td>${escapeHtml(item.itemName)}</td>
          <td>${item.totalPieces}</td>
          <td>${formatAmount(item.unitPrice)}</td>
          <td>${formatAmount(item.totalPrice)}</td>
        </tr>`,
    )
    .join("");

  const companyContact = [
    receipt.companyPhone,
    receipt.companyEmail,
    receipt.companyWebsite,
    receipt.companyAddress,
  ]
    .filter(Boolean)
    .map((value) => `<div>${escapeHtml(value as string)}</div>`)
    .join("");

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
      background: #f3f4f6;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
    }

    .receipt {
      max-width: 720px;
      margin: 0 auto;
      background: #ffffff;
      border-top: 6px solid #111827;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 4px 18px rgba(0,0,0,.08);
    }

    .header {
      padding: 24px;
      background: #111827;
      color: #ffffff;
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
      border-bottom: 2px solid #111827;
      font-size: 11px;
      text-transform: uppercase;
    }

    td {
      padding: 11px 6px;
      border-bottom: 1px solid #e5e7eb;
    }

    th:nth-child(1),
    th:nth-child(3),
    td:nth-child(1),
    td:nth-child(3) {
      text-align: center;
    }

    th:nth-child(n+4),
    td:nth-child(n+4) {
      text-align: right;
    }

    .total {
      display: flex;
      justify-content: space-between;
      margin-top: 18px;
      padding: 16px 0;
      border-top: 3px solid #111827;
      font-size: 18px;
      font-weight: 700;
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
      border-left: 4px solid #111827;
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
    <div class="header">
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
            <th>Item</th>
            <th>PCS</th>
            <th>Unit Price</th>
            <th>Total Price</th>
          </tr>
        </thead>
        <tbody>
          ${items}
        </tbody>
      </table>

      ${garmentNote}

      <div class="total">
        <span>Total</span>
        <span>${formatAmount(receipt.totalAmount)}</span>
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
