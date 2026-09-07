import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  customerFindFirstMock,
  getCustomerReceiptMock,
} = vi.hoisted(() => ({
  customerFindFirstMock: vi.fn(),
  getCustomerReceiptMock: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    customer: {
      findFirst: customerFindFirstMock,
    },
  },
}));

vi.mock("../../src/modules/invoices/receipts.service.js", () => ({
  getCustomerReceipt: getCustomerReceiptMock,
}));

import { resendDigitalReceipt } from "../../src/modules/invoices/receipt-delivery.service.js";

const INPUT = {
  invoiceId: "44444444-4444-4444-8444-444444444444",
  businessId: "biz-A",
  branchId: "branch-A",
};

const RECEIPT = {
  receiptType: "CUSTOMER" as const,
  invoiceNumber: "INV-00001",
  orderNumber: "00001",
  companyName: "Test Laundry",
  companyPhone: "08000000000",
  companyEmail: "hello@testlaundry.com",
  companyWebsite: "https://testlaundry.com",
  companyAddress: "Enugu, Nigeria",
  customerName: "John Doe",
  branchName: "Main Branch",
  createdAt: "2026-09-07T08:00:00.000Z",
  items: [],
  totalAmount: 9000,
  garmentNote: "Minor stain noted",
  customerAgreement: "Customer agrees to the company laundry terms.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("receipt-delivery.service", () => {
  it("resolves an EMAIL destination from the current customer", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "customer-A",
      name: "John Doe",
      email: "john@example.com",
      phone: "08000000000",
    });

    getCustomerReceiptMock.mockResolvedValue(RECEIPT);

    await expect(
      resendDigitalReceipt({
        ...INPUT,
        channel: "EMAIL",
      }),
    ).rejects.toMatchObject({
      message: "EMAIL receipt delivery is not configured",
      statusCode: 503,
    });

    expect(customerFindFirstMock).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        orders: {
          some: {
            businessId: "biz-A",
            branchId: "branch-A",
            invoice: {
              id: INPUT.invoiceId,
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    });

    expect(getCustomerReceiptMock).toHaveBeenCalledWith(
      INPUT.invoiceId,
      INPUT.businessId,
      INPUT.branchId,
    );
  });

  it("resolves a WHATSAPP destination from the current customer", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "customer-A",
      name: "John Doe",
      email: null,
      phone: "08000000000",
    });

    getCustomerReceiptMock.mockResolvedValue(RECEIPT);

    await expect(
      resendDigitalReceipt({
        ...INPUT,
        channel: "WHATSAPP",
      }),
    ).rejects.toMatchObject({
      message: "WHATSAPP receipt delivery is not configured",
      statusCode: 503,
    });
  });

  it("rejects an invoice outside the authenticated business or branch", async () => {
    customerFindFirstMock.mockResolvedValue(null);

    await expect(
      resendDigitalReceipt({
        ...INPUT,
        businessId: "biz-B",
        branchId: "branch-B",
        channel: "EMAIL",
      }),
    ).rejects.toMatchObject({
      message: "Invoice not found",
      statusCode: 404,
    });

    expect(getCustomerReceiptMock).not.toHaveBeenCalled();
  });

  it("rejects EMAIL when the customer has no email address", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "customer-A",
      name: "John Doe",
      email: null,
      phone: "08000000000",
    });

    getCustomerReceiptMock.mockResolvedValue(RECEIPT);

    await expect(
      resendDigitalReceipt({
        ...INPUT,
        channel: "EMAIL",
      }),
    ).rejects.toMatchObject({
      message: "Customer does not have an email address",
      statusCode: 422,
    });
  });

  it("rejects WHATSAPP when the customer has no phone number", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "customer-A",
      name: "John Doe",
      email: "john@example.com",
      phone: null,
    });

    getCustomerReceiptMock.mockResolvedValue(RECEIPT);

    await expect(
      resendDigitalReceipt({
        ...INPUT,
        channel: "WHATSAPP",
      }),
    ).rejects.toMatchObject({
      message: "Customer does not have a phone number",
      statusCode: 422,
    });
  });

  it("does not expose customer contact information through the receipt payload", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "customer-A",
      name: "John Doe",
      email: "john@example.com",
      phone: "08000000000",
    });

    getCustomerReceiptMock.mockResolvedValue(RECEIPT);

    await expect(
      resendDigitalReceipt({
        ...INPUT,
        channel: "EMAIL",
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
    });

    const receiptPayload = getCustomerReceiptMock.mock.results[0]?.value;
    expect(receiptPayload).toBeDefined();

    expect(RECEIPT).not.toHaveProperty("customerPhone");
    expect(RECEIPT).not.toHaveProperty("customerEmail");
    expect(RECEIPT).not.toHaveProperty("customerAddress");
  });

  it("returns 404 when the scoped invoice receipt does not exist", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "customer-A",
      name: "John Doe",
      email: "john@example.com",
      phone: "08000000000",
    });

    getCustomerReceiptMock.mockResolvedValue(null);

    await expect(
      resendDigitalReceipt({
        ...INPUT,
        channel: "EMAIL",
      }),
    ).rejects.toMatchObject({
      message: "Invoice not found",
      statusCode: 404,
    });
  });

  it("never reports successful delivery when no provider is configured", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "customer-A",
      name: "John Doe",
      email: "john@example.com",
      phone: "08000000000",
    });

    getCustomerReceiptMock.mockResolvedValue(RECEIPT);

    await expect(
      resendDigitalReceipt({
        ...INPUT,
        channel: "EMAIL",
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});
