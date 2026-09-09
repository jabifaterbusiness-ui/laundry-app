import sharp from "sharp";
import type { CustomerReceipt } from "../receipts.service.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatAmount(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function wrapSvgText(
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  fill: string,
): string {
  const words = value.trim().split(/\\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  // Conservative character estimate keeps the SVG renderer deterministic
  // without requiring browser text measurement.
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.55)));

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines
    .map(
      (line, index) => `
        <text
          x="${x}"
          y="${y + index * (fontSize + 10)}"
          font-size="${fontSize}"
          font-family="Arial"
          fill="${fill}"
        >${escapeXml(line)}</text>
      `,
    )
    .join("");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "L";
  }

  if (parts.length === 1) {
    const first = parts[0] ?? "";
    return first.slice(0, 2).toUpperCase();
  }

  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";

  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export async function renderCustomerReceiptImage(
  receipt: CustomerReceipt,
): Promise<Buffer> {
  const width = 900;
  const padding = 56;
  const primaryColor = receipt.receiptPrimaryColor ?? "#111827";
  const accentColor = receipt.receiptAccentColor ?? "#2563eb";
  const backgroundColor = receipt.receiptBackgroundColor ?? "#ffffff";
  const textColor = receipt.receiptTextColor ?? "#111827";

  const itemRows = receipt.items
    .map((item, index) => {
      const y = 430 + index * 78;

      return `
        <text x="${padding}" y="${y}" font-size="27" font-family="Arial" fill="${textColor}">
          ${escapeXml(`${item.quantity} × ${item.itemName}`)}
        </text>
        <text x="${width - padding}" y="${y}" text-anchor="end"
          font-size="27" font-family="Arial" fill="${textColor}">
          ${escapeXml(formatAmount(item.totalPrice))}
        </text>
        <text x="${padding}" y="${y + 31}" font-size="21" font-family="Arial" fill="#6b7280">
          ${escapeXml(`${item.totalPieces} pcs · ${formatAmount(item.unitPrice)} / unit`)}
        </text>
      `;
    })
    .join("");

  const itemCount = receipt.items.length;
  const agreementY = 510 + itemCount * 78;
  const totalY = agreementY + 150;
  const footerY = totalY + 155;
  const height = footerY + 80;

  // Do not fetch or embed arbitrary remote logo URLs during server-side
  // rendering. Use the branded initials fallback until logos are supplied
  // through a trusted local/storage pipeline.
  const logoMarkup = `
    <rect x="${padding}" y="52" width="90" height="90" rx="20" fill="${accentColor}" />
    <text
      x="${padding + 45}"
      y="110"
      text-anchor="middle"
      font-size="30"
      font-family="Arial"
      font-weight="700"
      fill="#ffffff"
    >${escapeXml(initials(receipt.companyName))}</text>
  `;

  const contactParts = [
    receipt.companyPhone,
    receipt.companyEmail,
    receipt.companyWebsite,
    receipt.companyAddress,
  ].filter(Boolean);

  const contactText = contactParts.join("  ·  ");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="${backgroundColor}" />

      <rect x="0" y="0" width="${width}" height="185" fill="${primaryColor}" />

      ${logoMarkup}

      <text
        x="170"
        y="88"
        font-size="38"
        font-family="Arial"
        font-weight="700"
        fill="#ffffff"
      >${escapeXml(receipt.companyName)}</text>

      <text
        x="170"
        y="126"
        font-size="24"
        font-family="Arial"
        fill="#e5e7eb"
      >CUSTOMER RECEIPT</text>

      <text
        x="${width - padding}"
        y="82"
        text-anchor="end"
        font-size="27"
        font-family="Arial"
        font-weight="700"
        fill="#ffffff"
      >${escapeXml(receipt.invoiceNumber)}</text>

      <text
        x="${width - padding}"
        y="119"
        text-anchor="end"
        font-size="21"
        font-family="Arial"
        fill="#e5e7eb"
      >Order ${escapeXml(receipt.orderNumber)}</text>

      <text x="${padding}" y="225" font-size="23" font-family="Arial" fill="#6b7280">
        Customer
      </text>
      <text x="${padding}" y="262" font-size="31" font-family="Arial" font-weight="700" fill="${textColor}">
        ${escapeXml(receipt.customerName)}
      </text>

      <text x="${width - padding}" y="225" text-anchor="end" font-size="23" font-family="Arial" fill="#6b7280">
        Branch
      </text>
      <text x="${width - padding}" y="262" text-anchor="end" font-size="27" font-family="Arial" fill="${textColor}">
        ${escapeXml(receipt.branchName)}
      </text>

      <text x="${padding}" y="304" font-size="21" font-family="Arial" fill="#6b7280">
        ${escapeXml(formatDate(receipt.createdAt))}
      </text>

      <line x1="${padding}" y1="340" x2="${width - padding}" y2="340" stroke="#e5e7eb" stroke-width="2" />

      <text x="${padding}" y="385" font-size="22" font-family="Arial" font-weight="700" fill="#6b7280">
        ITEMS
      </text>

      ${itemRows}

      <line x1="${padding}" y1="${agreementY - 30}" x2="${width - padding}" y2="${agreementY - 30}"
        stroke="#e5e7eb" stroke-width="2" />

      ${
        receipt.garmentNote
          ? `
            <text x="${padding}" y="${agreementY + 12}" font-size="21" font-family="Arial" font-weight="700" fill="${accentColor}">
              GARMENT NOTE
            </text>
            <text x="${padding}" y="${agreementY + 47}" font-size="22" font-family="Arial" fill="${textColor}">
              ${escapeXml(receipt.garmentNote)}
            </text>
          `
          : ""
      }

      <rect
        x="${padding}"
        y="${totalY - 55}"
        width="${width - padding * 2}"
        height="100"
        rx="18"
        fill="${accentColor}"
      />

      <text x="${padding + 28}" y="${totalY + 8}" font-size="27" font-family="Arial" font-weight="700" fill="#ffffff">
        TOTAL
      </text>

      <text x="${width - padding - 28}" y="${totalY + 8}" text-anchor="end"
        font-size="38" font-family="Arial" font-weight="700" fill="#ffffff">
        ${escapeXml(formatAmount(receipt.totalAmount))}
      </text>

      <text x="${padding}" y="${totalY + 100}" font-size="23" font-family="Arial" font-weight="700" fill="${textColor}">
        CUSTOMER AGREEMENT
      </text>

      ${wrapSvgText(
        receipt.customerAgreement,
        padding,
        totalY + 142,
        width - padding * 2,
        22,
        textColor,
      )}

      ${
        contactText
          ? `
            <text x="${width / 2}" y="${footerY - 25}" text-anchor="middle"
              font-size="18" font-family="Arial" fill="#6b7280">
              ${escapeXml(contactText)}
            </text>
          `
          : ""
      }

      <text x="${width / 2}" y="${footerY + 15}" text-anchor="middle"
        font-size="19" font-family="Arial" fill="#9ca3af">
        Thank you for your business.
      </text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
