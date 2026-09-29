import sharp from "sharp";
import { readBusinessLogo } from "../../businesses/business-branding.storage.js";
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

  const totalPieces = receipt.items.reduce(
    (total, item) => total + item.totalPieces,
    0,
  );

  const tableTop = 350;
  const headerHeight = 48;
  const rowHeight = 78;

  const itemRows = receipt.items
    .map((item, index) => {
      const y = tableTop + headerHeight + index * rowHeight;
      const piecesPerUnit =
        item.quantity > 0 && item.totalPieces > 0
          ? item.totalPieces / item.quantity
          : 1;
      const ratePerPiece = item.unitPrice / piecesPerUnit;
      const amount = item.totalPieces * ratePerPiece;
      const colors =
        item.colors.length > 0
          ? item.colors.join(", ")
          : "";

      return `
        <line
          x1="${padding}"
          y1="${y + 24}"
          x2="${width - padding}"
          y2="${y + 24}"
          stroke="#e5e7eb"
          stroke-width="1"
        />

        <text x="${padding + 12}" y="${y}" font-size="24"
          font-family="Arial" font-weight="700" fill="${textColor}">
          ${escapeXml(String(item.quantity))}
        </text>

        <text x="${padding + 92}" y="${y}" font-size="24"
          font-family="Arial" font-weight="700" fill="${textColor}">
          ${escapeXml(item.itemName)}
        </text>

        ${
          colors
            ? `
              <text x="${padding + 92}" y="${y + 29}" font-size="17"
                font-family="Arial" fill="#6b7280">
                ${escapeXml(colors)}
              </text>
            `
            : ""
        }

        <text x="${width - 250}" y="${y}" text-anchor="end"
          font-size="21" font-family="Arial" fill="${textColor}">
          ${escapeXml(formatAmount(ratePerPiece))}
        </text>

        <text x="${width - padding}" y="${y}" text-anchor="end"
          font-size="24" font-family="Arial" font-weight="700" fill="${textColor}">
          ${escapeXml(formatAmount(amount))}
        </text>
      `;
    })
    .join("");

  const itemCount = receipt.items.length;
  const tableBottom = tableTop + headerHeight + itemCount * rowHeight;
  const agreementY = tableBottom + 35;
  const totalY = agreementY + (receipt.garmentNote ? 130 : 45);
  const footerY = totalY + 205;
  const height = footerY + 80;

  // Read the logo directly from private, business-scoped storage.
  // Never fetch the authenticated logo URL from the server-side renderer.
  const storedLogo =
    receipt.logoUrl ? await readBusinessLogo(receipt.businessId) : null;

  const logoMarkup = storedLogo
    ? `
      <rect
        x="${padding}"
        y="52"
        width="90"
        height="90"
        rx="20"
        fill="${accentColor}"
      />
      <image
        x="${padding + 8}"
        y="60"
        width="74"
        height="74"
        preserveAspectRatio="xMidYMid meet"
        href="data:image/png;base64,${storedLogo.toString("base64")}"
      />
    `
    : `
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

      <rect
        x="${padding}"
        y="${tableTop}"
        width="${width - padding * 2}"
        height="${headerHeight}"
        rx="8"
        fill="${primaryColor}"
      />

      <text x="${padding + 12}" y="${tableTop + 31}" font-size="17"
        font-family="Arial" font-weight="700" fill="#ffffff">
        QTY
      </text>

      <text x="${padding + 92}" y="${tableTop + 31}" font-size="17"
        font-family="Arial" font-weight="700" fill="#ffffff">
        ITEM / COLORS
      </text>

      <text x="${width - 250}" y="${tableTop + 31}" text-anchor="end"
        font-size="17" font-family="Arial" font-weight="700" fill="#ffffff">
        RATE / PC
      </text>

      <text x="${width - padding - 12}" y="${tableTop + 31}" text-anchor="end"
        font-size="17" font-family="Arial" font-weight="700" fill="#ffffff">
        AMOUNT
      </text>

      ${itemRows}

      <line x1="${padding}" y1="${tableBottom + 8}" x2="${width - padding}" y2="${tableBottom + 8}"
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

      <text x="${padding}" y="${totalY - 8}" font-size="20"
        font-family="Arial" font-weight="700" fill="${textColor}">
        TOTAL PCS
      </text>

      <text x="${padding}" y="${totalY + 25}" font-size="30"
        font-family="Arial" font-weight="700" fill="${textColor}">
        ${escapeXml(String(totalPieces))}
      </text>

      <rect
        x="${width - 390}"
        y="${totalY - 45}"
        width="334"
        height="92"
        rx="16"
        fill="${accentColor}"
      />

      <text x="${width - 362}" y="${totalY - 7}" font-size="19"
        font-family="Arial" font-weight="700" fill="#ffffff">
        TOTAL AMOUNT
      </text>

      <text x="${width - padding - 28}" y="${totalY + 27}" text-anchor="end"
        font-size="34" font-family="Arial" font-weight="700" fill="#ffffff">
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
