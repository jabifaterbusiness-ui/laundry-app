import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  renderCustomerReceiptImage,
} from "../../src/modules/invoices/templates/customer-receipt-image.js";

const RECEIPT = {
  receiptType: "CUSTOMER" as const,
  invoiceNumber: "INV-00001",
  orderNumber: "00001",
  companyName: "Test Laundry",
  companyPhone: "08000000000",
  companyEmail: "hello@testlaundry.com",
  companyWebsite: "https://testlaundry.com",
  companyAddress: "Enugu, Nigeria",
  logoUrl: null,
  receiptPrimaryColor: "#123456",
  receiptAccentColor: "#D4AF37",
  receiptBackgroundColor: "#FFFFFF",
  receiptTextColor: "#111111",
  receiptHeaderStyle: "BRANDED",
  customerName: "John Doe",
  branchName: "Main Branch",
  createdAt: "2026-09-07T08:00:00.000Z",
  items: [
    {
      id: "item-1",
      quantity: 2,
      itemName: "Complete Agbada",
      totalPieces: 6,
      unitPrice: 4500,
      totalPrice: 9000,
    },
  ],
  totalAmount: 9000,
  garmentNote: "Minor stain noted",
  customerAgreement: "Customer agrees to the company laundry terms.",
};

describe("customer-receipt-image", () => {
  it("renders a valid PNG customer receipt image", async () => {
    const image = await renderCustomerReceiptImage(RECEIPT);

    expect(Buffer.isBuffer(image)).toBe(true);
    expect(image.length).toBeGreaterThan(100);

    const metadata = await sharp(image).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);
  });

  it("renders the receipt without customer contact information", async () => {
    const image = await renderCustomerReceiptImage(RECEIPT);

    expect(image.includes(Buffer.from("08000000000"))).toBe(false);
    expect(image.includes(Buffer.from("hello@testlaundry.com"))).toBe(false);
  });

  it("renders a receipt when optional branding fields are null", async () => {
    const image = await renderCustomerReceiptImage({
      ...RECEIPT,
      logoUrl: null,
      receiptPrimaryColor: null,
      receiptAccentColor: null,
      receiptBackgroundColor: null,
      receiptTextColor: null,
      receiptHeaderStyle: null,
    });

    const metadata = await sharp(image).metadata();

    expect(metadata.format).toBe("png");
  });
});
