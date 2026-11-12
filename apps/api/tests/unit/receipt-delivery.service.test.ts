import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  customerFindFirstMock,
  getCustomerReceiptMock,
  renderCustomerReceiptEmailMock,
  renderCustomerReceiptImageMock,
  sendReceiptEmailMock,
  sendWhatsAppReceiptMock,
  connectionFindUniqueMock,
  sendAutomatedWhatsAppTemplateMock,
  uploadWhatsAppTemplateImageMock,
} = vi.hoisted(() => ({
  customerFindFirstMock: vi.fn(),
  getCustomerReceiptMock: vi.fn(),
  renderCustomerReceiptEmailMock: vi.fn(),
  renderCustomerReceiptImageMock: vi.fn(),
  sendReceiptEmailMock: vi.fn(),
  sendWhatsAppReceiptMock: vi.fn(),
  connectionFindUniqueMock: vi.fn(),
  sendAutomatedWhatsAppTemplateMock: vi.fn(),
  uploadWhatsAppTemplateImageMock: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    platformConfig: {
      upsert: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        allowNewBusinessRegistration: true,
        maintenanceMode: false,
        whatsappMessagingEnabled: true,
        automatedNotificationsEnabled: true,
        offlineSyncEnabled: true,
        version: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    },
    customer: {
      findFirst: customerFindFirstMock,
    },
    whatsAppBusinessConnection: {
      findUnique: connectionFindUniqueMock,
    },
  },
}));

vi.mock("../../src/modules/invoices/receipts.service.js", () => ({
  getCustomerReceipt: getCustomerReceiptMock,
}));

vi.mock(
  "../../src/modules/invoices/templates/customer-receipt-email.js",
  () => ({
    renderCustomerReceiptEmail: renderCustomerReceiptEmailMock,
  }),
);

vi.mock(
  "../../src/modules/invoices/templates/customer-receipt-image.js",
  () => ({
    renderCustomerReceiptImage: renderCustomerReceiptImageMock,
  }),
);

vi.mock("../../src/modules/invoices/providers/resend.provider.js", () => ({
  sendReceiptEmail: sendReceiptEmailMock,
}));

vi.mock("../../src/modules/invoices/providers/whatsapp.provider.js", () => ({
  sendWhatsAppReceipt: sendWhatsAppReceiptMock,
}));

vi.mock("../../src/modules/whatsapp/whatsapp-templates.service.js", () => ({
  sendAutomatedWhatsAppTemplate: sendAutomatedWhatsAppTemplateMock,
  uploadWhatsAppTemplateImage: uploadWhatsAppTemplateImageMock,
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
  totalPaid: 0,
  balanceDue: 9000,
  payments: [],
  garmentNote: "Minor stain noted",
  customerAgreement: "Customer agrees to the company laundry terms.",
};

beforeEach(() => {
  vi.clearAllMocks();
  renderCustomerReceiptEmailMock.mockReturnValue("<html>receipt</html>");
  renderCustomerReceiptImageMock.mockResolvedValue(
    Buffer.from("receipt-png"),
  );
  connectionFindUniqueMock.mockResolvedValue({
    receiptTemplateName: "laundry_receipt",
    receiptTemplateLanguage: "en",
  });
  uploadWhatsAppTemplateImageMock.mockResolvedValue("media-receipt-1");
  sendAutomatedWhatsAppTemplateMock.mockResolvedValue({
    providerMessageId: "wamid.template-receipt",
  });
});

describe("receipt-delivery.service", () => {
  it("sends an EMAIL receipt through the Resend provider", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "customer-A",
      name: "John Doe",
      email: "john@example.com",
      phone: "08000000000",
    });

    getCustomerReceiptMock.mockResolvedValue(RECEIPT);
    sendReceiptEmailMock.mockResolvedValue({
      id: "resend-message-123",
    });

    await expect(
      resendDigitalReceipt({
        ...INPUT,
        channel: "EMAIL",
      }),
    ).resolves.toEqual({
      channel: "EMAIL",
      destination: "john@example.com",
      providerMessageId: "resend-message-123",
    });

    expect(renderCustomerReceiptEmailMock).toHaveBeenCalledWith(RECEIPT);

    expect(sendReceiptEmailMock).toHaveBeenCalledWith({
      to: "john@example.com",
      subject: "Test Laundry — Receipt INV-00001",
      html: "<html>receipt</html>",
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

  it("returns 503 when Resend email delivery fails", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "customer-A",
      name: "John Doe",
      email: "john@example.com",
      phone: "08000000000",
    });

    getCustomerReceiptMock.mockResolvedValue(RECEIPT);
    sendReceiptEmailMock.mockRejectedValue(
      new Error("Resend email delivery failed: provider unavailable"),
    );

    await expect(
      resendDigitalReceipt({
        ...INPUT,
        channel: "EMAIL",
      }),
    ).rejects.toMatchObject({
      message: "Resend email delivery failed: provider unavailable",
      statusCode: 503,
    });
  });

  it("sends a WHATSAPP receipt through the Meta provider", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "customer-A",
      name: "John Doe",
      email: null,
      phone: "08000000000",
    });

    getCustomerReceiptMock.mockResolvedValue(RECEIPT);
    sendWhatsAppReceiptMock.mockResolvedValue({
      id: "wamid.test-123",
    });

    await expect(
      resendDigitalReceipt({
        ...INPUT,
        channel: "WHATSAPP",
      }),
    ).resolves.toEqual({
      channel: "WHATSAPP",
      destination: "08000000000",
      providerMessageId: "wamid.test-123",
    });

    expect(renderCustomerReceiptImageMock).toHaveBeenCalledWith(
      RECEIPT,
    );

    expect(sendWhatsAppReceiptMock).toHaveBeenCalledWith({
      businessId: INPUT.businessId,
      to: "08000000000",
      image: Buffer.from("receipt-png"),
    });

    expect(renderCustomerReceiptEmailMock).not.toHaveBeenCalled();
  });

  it("sends the receipt image through an approved UTILITY template when the 24-hour window is closed", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "customer-A",
      name: "John Doe",
      email: null,
      phone: "08000000000",
    });
    getCustomerReceiptMock.mockResolvedValue(RECEIPT);
    sendWhatsAppReceiptMock.mockRejectedValue(
      new Error("The 24-hour WhatsApp customer-service window is closed. Use an approved template for this customer instead."),
    );

    await expect(resendDigitalReceipt({ ...INPUT, channel: "WHATSAPP" })).resolves.toEqual({
      channel: "WHATSAPP",
      destination: "08000000000",
      providerMessageId: "wamid.template-receipt",
    });

    expect(uploadWhatsAppTemplateImageMock).toHaveBeenCalledWith(INPUT.businessId, Buffer.from("receipt-png"));
    expect(sendAutomatedWhatsAppTemplateMock).toHaveBeenCalledWith(expect.objectContaining({
      businessId: INPUT.businessId,
      customerId: "customer-A",
      phone: "08000000000",
      templateName: "laundry_receipt",
      language: "en",
      templateCategory: "UTILITY",
      headerImageId: "media-receipt-1",
      variableValues: ["John Doe", "INV-00001", "₦9,000", "₦9,000"],
    }));
  });

  it("returns 503 when WhatsApp delivery fails", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "customer-A",
      name: "John Doe",
      email: null,
      phone: "08000000000",
    });

    getCustomerReceiptMock.mockResolvedValue(RECEIPT);
    renderCustomerReceiptImageMock.mockResolvedValue(
      Buffer.from("receipt-png"),
    );

    sendWhatsAppReceiptMock.mockRejectedValue(
      new Error("WhatsApp delivery failed: provider unavailable"),
    );

    await expect(
      resendDigitalReceipt({
        ...INPUT,
        channel: "WHATSAPP",
      }),
    ).rejects.toMatchObject({
      message: "WhatsApp delivery failed: provider unavailable",
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

  it("does not call the email provider when the receipt cannot be found", async () => {
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

    expect(renderCustomerReceiptEmailMock).not.toHaveBeenCalled();
    expect(renderCustomerReceiptImageMock).not.toHaveBeenCalled();
    expect(sendReceiptEmailMock).not.toHaveBeenCalled();
    expect(sendWhatsAppReceiptMock).not.toHaveBeenCalled();
  });
});
