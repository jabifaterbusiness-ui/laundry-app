import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("../../src/modules/businesses/business-branding.storage.js", () => ({
  readBusinessLogo: vi.fn(),
}));

import { readBusinessLogo } from "../../src/modules/businesses/business-branding.storage.js";
import {
  renderCustomerReceiptImage,
} from "../../src/modules/invoices/templates/customer-receipt-image.js";

const RECEIPT = {
  receiptType: "CUSTOMER" as const,
  businessId: "business-1",
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
      colors: ["White", "Royal Blue"],
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
  beforeEach(() => {
    vi.mocked(readBusinessLogo).mockResolvedValue(null);
  });

  it("uses the trusted stored company logo when a logo is configured", async () => {
    const logo = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 4,
        background: { r: 212, g: 175, b: 55, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    vi.mocked(readBusinessLogo).mockResolvedValue(logo);

    const image = await renderCustomerReceiptImage({
      ...RECEIPT,
      logoUrl: "/api/v1/businesses/logo",
    });

    expect(Buffer.isBuffer(image)).toBe(true);
    expect(readBusinessLogo).toHaveBeenCalledWith("business-1");

    const metadata = await sharp(image).metadata();
    expect(metadata.format).toBe("png");
  });

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
