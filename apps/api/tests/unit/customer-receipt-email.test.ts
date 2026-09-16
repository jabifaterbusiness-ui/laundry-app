import { describe, expect, it } from "vitest";
import { renderCustomerReceiptEmail } from "../../src/modules/invoices/templates/customer-receipt-email.js";
import type { CustomerReceipt } from "../../src/modules/invoices/receipts.service.js";

function makeReceipt(
  overrides: Partial<CustomerReceipt> = {},
): CustomerReceipt {
  return {
    receiptType: "CUSTOMER",
    invoiceNumber: "INV-00001",
    orderNumber: "00001",
    companyName: "Fresh & Clean Laundry",
    companyPhone: "+2348000000000",
    companyEmail: "hello@example.com",
    companyWebsite: "https://example.com",
    companyAddress: "12 Laundry Street",
    logoUrl: "https://example.com/logo.png",
    receiptPrimaryColor: "#123456",
    receiptAccentColor: "#abcdef",
    receiptBackgroundColor: "#f8f8f8",
    receiptTextColor: "#222222",
    receiptHeaderStyle: "centered",
    customerName: "John Customer",
    branchName: "Main Branch",
    createdAt: "2026-09-08T00:00:00.000Z",
    items: [
      {
        id: "item-1",
        quantity: 2,
        itemName: "Complete Agbada",
        colors: ["White", "Royal Blue"],
        totalPieces: 6,
        unitPrice: 4500,
        totalPrice: 9000,
      },
    ],
    totalAmount: 9000,
    garmentNote: "Handle with care",
    customerAgreement: "Customer agrees to the laundry service terms.",
    ...overrides,
  };
}

describe("renderCustomerReceiptEmail", () => {
  it("renders the customer receipt with the required receipt fields", () => {
    const html = renderCustomerReceiptEmail(makeReceipt());

    expect(html).toContain("Fresh &amp; Clean Laundry");
    expect(html).toContain("INV-00001");
    expect(html).toContain("00001");
    expect(html).toContain("John Customer");
    expect(html).toContain("Main Branch");
    expect(html).toContain("Complete Agbada");
    expect(html).toContain("White, Royal Blue");
    expect(html).toContain("ITEM / COLORS");
    expect(html).toContain("RATE / PC");
    expect(html).toContain("AMOUNT");
    expect(html).toContain("₦1,500.00");
    expect(html).toContain("TOTAL PCS");
    expect(html).toContain(">6</strong>");
    expect(html).toContain("TOTAL AMOUNT");
    expect(html).toContain("₦9,000.00");
    expect(html).not.toContain("TOTAL ITEMS");
    expect(html).not.toContain("<th>PCS</th>");
    expect(html).not.toContain("Unit Price");
    expect(html).not.toContain("Total Price");
    expect(html).toContain("Customer Agreement");
    expect(html).toContain("Customer agrees to the laundry service terms.");
    expect(html).toContain("Handle with care");
    expect(html).toContain('src="https://example.com/logo.png"');
    expect(html).toContain("background: #f8f8f8");
    expect(html).toContain("color: #222222");
    expect(html).toContain("background: #123456");
    expect(html).toContain("border-bottom: 2px solid #abcdef");
    expect(html).toContain("header header-centered");
  });

  it("never includes customer contact information in the receipt", () => {
    const html = renderCustomerReceiptEmail(makeReceipt());

    expect(html).not.toContain("+2348111111111");
    expect(html).not.toContain("customer@example.com");
    expect(html).not.toContain("45 Customer Address");
  });

  it("escapes customer-controlled and invoice-controlled HTML values", () => {
    const html = renderCustomerReceiptEmail(
      makeReceipt({
        companyName: "<script>alert('company')</script>",
        customerName: "<img src=x onerror=alert(1)>",
        branchName: 'Branch "A"',
        garmentNote: "<b>Dangerous</b>",
        customerAgreement: "Terms & <conditions>",
        items: [
          {
            id: "item-1",
            quantity: 1,
            itemName: "<script>alert('item')</script>",
            colors: ["Black"],
            totalPieces: 3,
            unitPrice: 4500,
            totalPrice: 4500,
          },
        ],
      }),
    );

    expect(html).toContain(
      "&lt;script&gt;alert(&#039;company&#039;)&lt;/script&gt;",
    );
    expect(html).toContain(
      "&lt;img src=x onerror=alert(1)&gt;",
    );
    expect(html).toContain("Branch &quot;A&quot;");
    expect(html).toContain("&lt;b&gt;Dangerous&lt;/b&gt;");
    expect(html).toContain("Terms &amp; &lt;conditions&gt;");
    expect(html).toContain(
      "&lt;script&gt;alert(&#039;item&#039;)&lt;/script&gt;",
    );

    expect(html).not.toContain("<script>alert('company')</script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("omits the garment note when none exists", () => {
    const html = renderCustomerReceiptEmail(
      makeReceipt({ garmentNote: null }),
    );

    expect(html).not.toContain("Garment Note");
  });
});
