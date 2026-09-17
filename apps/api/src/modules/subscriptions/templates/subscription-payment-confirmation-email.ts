export interface SubscriptionPaymentConfirmationEmailInput {
  companyName: string;
  paymentReference: string;
  providerTransactionId: string | null;
  paymentMethod: string;
  amount: number;
  currencyCode: string;
  plan: string;
  startsAt: Date;
  endsAt: Date;
  businessCode?: string | null;
  paymentCode?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatAmount(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currencyCode}`;
  }
}

function formatDate(value: Date): string {
  return value.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function renderSubscriptionPaymentConfirmationEmail(
  input: SubscriptionPaymentConfirmationEmailInput,
): string {
  const providerTransaction = input.providerTransactionId
    ? escapeHtml(input.providerTransactionId)
    : "Not provided";

  const businessIdentity = [
    input.businessCode
      ? `<div><strong>Business ID:</strong> ${escapeHtml(input.businessCode)}</div>`
      : "",
    input.paymentCode
      ? `<div><strong>Payment ID:</strong> ${escapeHtml(input.paymentCode)}</div>`
      : "",
  ].join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Subscription payment confirmed — ${escapeHtml(input.companyName)}</title>
  <style>
    body {
      margin: 0;
      padding: 24px 12px;
      background: #f3f4f6;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
    }

    .card {
      max-width: 680px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 18px rgba(0,0,0,.08);
    }

    .header {
      padding: 28px 24px;
      background: #111827;
      color: #ffffff;
    }

    .header h1 {
      margin: 0 0 8px;
      font-size: 24px;
    }

    .header p {
      margin: 0;
      color: #d1d5db;
      font-size: 14px;
    }

    .content {
      padding: 28px 24px;
    }

    .success {
      padding: 16px;
      margin-bottom: 22px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 8px;
      color: #065f46;
      line-height: 1.5;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }

    td {
      padding: 12px 0;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }

    td:first-child {
      width: 42%;
      color: #6b7280;
    }

    td:last-child {
      font-weight: 600;
      text-align: right;
      word-break: break-word;
    }

    .subscription {
      margin-top: 24px;
      padding: 18px;
      background: #f9fafb;
      border-radius: 8px;
    }

    .subscription h2 {
      margin: 0 0 12px;
      font-size: 17px;
    }

    .footer {
      padding: 18px 24px 24px;
      color: #6b7280;
      font-size: 12px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Subscription payment confirmed</h1>
      <p>${escapeHtml(input.companyName)}</p>
    </div>

    <div class="content">
      <div class="success">
        <strong>Payment successfully verified.</strong><br>
        Your LaundryAngel subscription has been activated or extended successfully.
      </div>

      <table>
        <tr>
          <td>Payment reference</td>
          <td>${escapeHtml(input.paymentReference)}</td>
        </tr>
        <tr>
          <td>Amount paid</td>
          <td>${escapeHtml(formatAmount(input.amount, input.currencyCode))}</td>
        </tr>
        <tr>
          <td>Currency</td>
          <td>${escapeHtml(input.currencyCode)}</td>
        </tr>
        <tr>
          <td>Payment method</td>
          <td>${escapeHtml(humanize(input.paymentMethod))}</td>
        </tr>
        <tr>
          <td>Provider transaction</td>
          <td>${providerTransaction}</td>
        </tr>
      </table>

      <div class="subscription">
        <h2>Subscription details</h2>
        <table>
          <tr>
            <td>Plan</td>
            <td>${escapeHtml(humanize(input.plan))}</td>
          </tr>
          <tr>
            <td>Start</td>
            <td>${escapeHtml(formatDate(input.startsAt))}</td>
          </tr>
          <tr>
            <td>Expiry</td>
            <td>${escapeHtml(formatDate(input.endsAt))}</td>
          </tr>
          ${businessIdentity}
        </table>
      </div>
    </div>

    <div class="footer">
      This email confirms a successfully verified subscription payment.
      Please keep it for your records.
    </div>
  </div>
</body>
</html>`;
}
