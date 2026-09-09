import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    invoice: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import {
  getCompanyReceipt,
  getCustomerReceipt,
} from "../../src/modules/invoices/receipts.service.js";

const invoiceFindFirst = vi.mocked(prisma.invoice.findFirst);

const INVOICE_ID = "88888888-8888-8888-8888-888888888888";
const BRANCH_ID = "33333333-3333-3333-3333-333333333333";

const invoiceFixture = {
  id: INVOICE_ID,
  businessId: "biz-A",
  branchId: BRANCH_ID,
  orderId: "77777777-7777-7777-7777-777777777777",
  order: {
    orderNumber: "00017",
  },
  invoiceNumber: "00042",
  status: "ISSUED",
  customerName: "Jane Doe",

  branch: {
    name: "Main Branch",
  },

  companyName: "Clean Laundry",
  companyPhone: "08000000000",
  companyEmail: "hello@cleanlaundry.com",
  companyWebsite: "https://cleanlaundry.com",
  companyAddress: "12 Main Street",
  logoUrl: "https://cleanlaundry.com/logo.png",
  receiptPrimaryColor: "#123456",
  receiptAccentColor: "#abcdef",
  receiptBackgroundColor: "#f8f8f8",
  receiptTextColor: "#222222",
  receiptHeaderStyle: "modern",

  totalAmount: 13500,
  garmentNote: "Small stain already present on white shirt.",
  internalNote: "Keep Agbada separate. Customer will inspect before pickup.",
  customerAgreement: "Please check garments before leaving.",

  items: [
    {
      id: "item-1",
      invoiceId: INVOICE_ID,
      itemName: "Shirt",
      piecesPerUnit: 1,
      quantity: 2,
      totalPieces: 2,
      unitPrice: 4500,
      totalPrice: 9000,
      createdAt: new Date("2026-08-29T10:00:00.000Z"),
    },
    {
      id: "item-2",
      invoiceId: INVOICE_ID,
      itemName: "Complete Agbada",
      piecesPerUnit: 3,
      quantity: 1,
      totalPieces: 3,
      unitPrice: 4500,
      totalPrice: 4500,
      createdAt: new Date("2026-08-29T10:01:00.000Z"),
    },
  ],

  createdAt: new Date("2026-08-29T10:00:00.000Z"),
  updatedAt: new Date("2026-08-29T10:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCustomerReceipt", () => {
  it("returns the customer-safe receipt projection", async () => {
    invoiceFindFirst.mockResolvedValue(invoiceFixture as never);

    const result = await getCustomerReceipt(
      INVOICE_ID,
      "biz-A",
      BRANCH_ID,
    );

    expect(result).toEqual({
      receiptType: "CUSTOMER",
      invoiceNumber: "00042",
      orderNumber: "00017",
      companyName: "Clean Laundry",
      companyPhone: "08000000000",
      companyEmail: "hello@cleanlaundry.com",
      companyWebsite: "https://cleanlaundry.com",
      companyAddress: "12 Main Street",
      logoUrl: "https://cleanlaundry.com/logo.png",
      receiptPrimaryColor: "#123456",
      receiptAccentColor: "#abcdef",
      receiptBackgroundColor: "#f8f8f8",
      receiptTextColor: "#222222",
      receiptHeaderStyle: "modern",
      customerName: "Jane Doe",
      branchName: "Main Branch",
      createdAt: "2026-08-29T10:00:00.000Z",
      items: [
        {
          id: "item-1",
          quantity: 2,
          itemName: "Shirt",
          totalPieces: 2,
          unitPrice: 4500,
          totalPrice: 9000,
        },
        {
          id: "item-2",
          quantity: 1,
          itemName: "Complete Agbada",
          totalPieces: 3,
          unitPrice: 4500,
          totalPrice: 4500,
        },
      ],
      totalAmount: 13500,
      garmentNote: "Small stain already present on white shirt.",
      customerAgreement: "Please check garments before leaving.",
    });
  });

  it("never exposes the private internal note", async () => {
    invoiceFindFirst.mockResolvedValue(invoiceFixture as never);

    const result = await getCustomerReceipt(
      INVOICE_ID,
      "biz-A",
      BRANCH_ID,
    );

    expect(result).not.toHaveProperty("internalNote");
    expect(JSON.stringify(result)).not.toContain(
      "Keep Agbada separate",
    );
  });

  it("uses business and branch isolation when loading the invoice", async () => {
    invoiceFindFirst.mockResolvedValue(invoiceFixture as never);

    await getCustomerReceipt(
      INVOICE_ID,
      "biz-A",
      BRANCH_ID,
    );

    expect(invoiceFindFirst).toHaveBeenCalledWith({
      where: {
        id: INVOICE_ID,
        businessId: "biz-A",
        branchId: BRANCH_ID,
      },
      include: {
        order: {
          select: {
            orderNumber: true,
          },
        },
        branch: {
          select: {
            name: true,
          },
        },
        items: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });
  });

  it("returns null when the invoice does not belong to the requested scope", async () => {
    invoiceFindFirst.mockResolvedValue(null);

    const result = await getCustomerReceipt(
      INVOICE_ID,
      "biz-B",
      BRANCH_ID,
    );

    expect(result).toBeNull();
  });
});

describe("getCompanyReceipt", () => {
  it("returns the company receipt projection including the internal note", async () => {
    invoiceFindFirst.mockResolvedValue(invoiceFixture as never);

    const result = await getCompanyReceipt(
      INVOICE_ID,
      "biz-A",
      BRANCH_ID,
    );

    expect(result).toEqual({
      receiptType: "COMPANY",
      invoiceNumber: "00042",
      orderNumber: "00017",
      companyName: "Clean Laundry",
      companyPhone: "08000000000",
      companyEmail: "hello@cleanlaundry.com",
      companyWebsite: "https://cleanlaundry.com",
      companyAddress: "12 Main Street",
      logoUrl: "https://cleanlaundry.com/logo.png",
      receiptPrimaryColor: "#123456",
      receiptAccentColor: "#abcdef",
      receiptBackgroundColor: "#f8f8f8",
      receiptTextColor: "#222222",
      receiptHeaderStyle: "modern",
      customerName: "Jane Doe",
      branchName: "Main Branch",
      createdAt: "2026-08-29T10:00:00.000Z",
      items: [
        {
          id: "item-1",
          quantity: 2,
          itemName: "Shirt",
          totalPieces: 2,
          unitPrice: 4500,
          totalPrice: 9000,
        },
        {
          id: "item-2",
          quantity: 1,
          itemName: "Complete Agbada",
          totalPieces: 3,
          unitPrice: 4500,
          totalPrice: 4500,
        },
      ],
      totalAmount: 13500,
      garmentNote: "Small stain already present on white shirt.",
      internalNote:
        "Keep Agbada separate. Customer will inspect before pickup.",
    });
  });

  it("never exposes customer phone, email or address", async () => {
    const invoiceWithForbiddenCustomerData = {
      ...invoiceFixture,
      customerPhone: "08123456789",
      customerEmail: "jane@example.com",
      customerAddress: "99 Customer Street",
    };

    invoiceFindFirst.mockResolvedValue(
      invoiceWithForbiddenCustomerData as never,
    );

    const result = await getCompanyReceipt(
      INVOICE_ID,
      "biz-A",
      BRANCH_ID,
    );

    expect(result).not.toHaveProperty("customerPhone");
    expect(result).not.toHaveProperty("customerEmail");
    expect(result).not.toHaveProperty("customerAddress");
    expect(JSON.stringify(result)).not.toContain("08123456789");
    expect(JSON.stringify(result)).not.toContain(
      "jane@example.com",
    );
    expect(JSON.stringify(result)).not.toContain(
      "99 Customer Street",
    );
  });

  it("returns null when the invoice does not belong to the requested scope", async () => {
    invoiceFindFirst.mockResolvedValue(null);

    const result = await getCompanyReceipt(
      INVOICE_ID,
      "biz-B",
      BRANCH_ID,
    );

    expect(result).toBeNull();
  });
});

describe("receipt financial snapshots", () => {
  it("preserves QTY, PCS, unit price and total price from InvoiceItem", async () => {
    invoiceFindFirst.mockResolvedValue(invoiceFixture as never);

    const result = await getCustomerReceipt(
      INVOICE_ID,
      "biz-A",
      BRANCH_ID,
    );

    expect(result?.items).toEqual([
      {
        id: "item-1",
        quantity: 2,
        itemName: "Shirt",
        totalPieces: 2,
        unitPrice: 4500,
        totalPrice: 9000,
      },
      {
        id: "item-2",
        quantity: 1,
        itemName: "Complete Agbada",
        totalPieces: 3,
        unitPrice: 4500,
        totalPrice: 4500,
      },
    ]);

    expect(result?.totalAmount).toBe(13500);
  });
});
