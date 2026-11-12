import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectionFindUnique: vi.fn(),
  customerFindFirst: vi.fn(),
  webhookEventCreate: vi.fn(),
  webhookEventFindFirst: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    whatsAppBusinessConnection: { findUnique: mocks.connectionFindUnique },
    customer: { findFirst: mocks.customerFindFirst },
    whatsAppWebhookEvent: { create: mocks.webhookEventCreate, findFirst: mocks.webhookEventFindFirst },
  },
}));
vi.mock("../../src/config/index.js", () => ({
  config: { receiptDelivery: { whatsappApiVersion: "v23.0" } },
}));
vi.mock("../../src/lib/logger.js", () => ({ logger: { warn: vi.fn() } }));
vi.mock("../../src/modules/whatsapp/whatsapp-token-crypto.js", () => ({
  decryptWhatsAppAccessToken: vi.fn(() => "decrypted-test-token"),
}));
vi.mock("../../src/modules/invoices/providers/whatsapp.provider.js", () => ({
  normalizeWhatsAppRecipient: (value: string) => value.replace(/\\D/g, ""),
}));

import { listApprovedWhatsAppTemplates, sendApprovedWhatsAppTemplate, sendAutomatedWhatsAppTemplate, uploadWhatsAppTemplateImage } from "../../src/modules/whatsapp/whatsapp-templates.service.js";

function page(data: unknown[], next?: string) {
  return new Response(JSON.stringify({ data, ...(next ? { paging: { next } } : {}) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("approved WhatsApp template pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.customerFindFirst.mockResolvedValue({
      id: "customer-1",
      phone: "2348012345678",
      whatsappOptIn: true,
      whatsappOptInAt: new Date("2026-10-01T00:00:00.000Z"),
      whatsappOptInSource: "CUSTOMER_WRITTEN",
    });
    mocks.webhookEventCreate.mockResolvedValue({});
    mocks.connectionFindUnique.mockResolvedValue({
      wabaId: "123456789",
      phoneNumberId: "987654321",
      encryptedAccessToken: "encrypted-token",
      status: "CONNECTED",
    });
  });

  it("loads templates from every Meta page and removes duplicate IDs", async () => {
    mocks.fetch
      .mockResolvedValueOnce(page([
        { id: "template-1", name: "order_ready", language: "en", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hello {{1}}" }] },
      ], "https://graph.facebook.com/v23.0/123456789/message_templates?after=cursor-2"))
      .mockResolvedValueOnce(page([
        { id: "template-1", name: "order_ready", language: "en", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hello {{1}}" }] },
        { id: "template-2", name: "plain_notice", language: "en", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Your order is ready" }] },
        { id: "template-3", name: "pending_notice", language: "en", status: "PENDING", category: "UTILITY", components: [] },
      ]));

    const result = await listApprovedWhatsAppTemplates("business-1");

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      { id: "template-1", name: "order_ready", language: "en", category: "UTILITY", bodyVariableCount: 1, headerFormat: null },
      { id: "template-2", name: "plain_notice", language: "en", category: "UTILITY", bodyVariableCount: 0, headerFormat: null },
    ]);
  });

  it("supports an approved UTILITY image-header template for a receipt", async () => {
    const approvedPage = () => page([
      {
        id: "receipt-template",
        name: "laundry_receipt",
        language: "en",
        status: "APPROVED",
        category: "UTILITY",
        components: [
          { type: "HEADER", format: "IMAGE" },
          { type: "BODY", text: "Hello {{1}}, invoice {{2}} total {{3}}, balance {{4}}" },
        ],
      },
    ]);
    mocks.fetch
      .mockImplementationOnce(async () => approvedPage())
      .mockImplementationOnce(async () => approvedPage())
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid-receipt-1" }] }), { status: 200 }));

    const result = await sendAutomatedWhatsAppTemplate({
      businessId: "business-1",
      customerId: "customer-1",
      phone: "2348012345678",
      templateName: "laundry_receipt",
      language: "en",
      templateCategory: "UTILITY",
      headerImageId: "media-receipt-1",
      variableValues: ["Ada", "INV-100", "₦12,000", "₦2,000"],
    });

    expect(result.providerMessageId).toBe("wamid-receipt-1");
    const request = JSON.parse(String(mocks.fetch.mock.calls[2]?.[1]?.body));
    expect(request.template.components).toEqual([
      { type: "header", parameters: [{ type: "image", image: { id: "media-receipt-1" } }] },
      { type: "body", parameters: [
        { type: "text", text: "Ada" },
        { type: "text", text: "INV-100" },
        { type: "text", text: "₦12,000" },
        { type: "text", text: "₦2,000" },
      ] },
    ]);
  });

  it("uploads receipt images to the connected business phone number", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "media-receipt-2" }), { status: 200 }));
    const mediaId = await uploadWhatsAppTemplateImage("business-1", Buffer.from("receipt-image"));
    expect(mediaId).toBe("media-receipt-2");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v23.0/987654321/media",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends an approved notification template without requiring an inbound message when consent is recorded", async () => {
    const approvedPage = () => page([
      { id: "template-1", name: "order_update", language: "en", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hello {{1}}, order {{2}} is updated" }] },
    ]);
    mocks.fetch
      .mockImplementationOnce(async () => approvedPage())
      .mockImplementationOnce(async () => approvedPage())
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid-template-1" }] }), { status: 200 }));
    const result = await sendAutomatedWhatsAppTemplate({
      businessId: "business-1", customerId: "customer-1", phone: "2348012345678",
      templateName: "order_update", language: "en",
      variableValues: ["Ada", "ORD-100", "ready for pickup", "LaundryAngel"],
    });
    expect(result.providerMessageId).toBe("wamid-template-1");
    const request = JSON.parse(String(mocks.fetch.mock.calls[2]?.[1]?.body));
    expect(request.template.components[0].parameters).toEqual([
      { type: "text", text: "Ada" }, { type: "text", text: "ORD-100" },
    ]);
    expect(mocks.customerFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "customer-1", businessId: "business-1" },
      select: {
        id: true,
        phone: true,
        whatsappOptIn: true,
        whatsappOptInAt: true,
        whatsappOptInSource: true,
      },
    }));
    expect(mocks.webhookEventCreate).toHaveBeenCalled();
  });

  it("requires inbox template conversations to belong to the currently connected number", async () => {
    mocks.webhookEventFindFirst.mockResolvedValue(null);
    await expect(sendApprovedWhatsAppTemplate({
      businessId: "business-1",
      customerId: "customer-1",
      phone: "2348012345678",
      templateName: "inbox_reply",
      language: "en",
      variables: [],
    })).rejects.toThrow("customer-initiated WhatsApp conversation is required");
    expect(mocks.webhookEventFindFirst).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        phoneNumberId: "987654321",
        contactPhone: "2348012345678",
        eventType: "MESSAGE_RECEIVED",
      },
      select: { id: true },
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses inbox templates sent to an unsaved phone number", async () => {
    await expect(sendApprovedWhatsAppTemplate({
      businessId: "business-1",
      phone: "2348012345678",
      templateName: "inbox_reply",
      language: "en",
      variables: [],
    })).rejects.toThrow("saved customer with recorded WhatsApp consent");
    expect(mocks.customerFindFirst).not.toHaveBeenCalled();
    expect(mocks.webhookEventFindFirst).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("requires recorded customer consent before sending an inbox template", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      id: "customer-1",
      phone: "2348012345678",
      whatsappOptIn: false,
      whatsappOptInAt: null,
      whatsappOptInSource: null,
    });

    await expect(sendApprovedWhatsAppTemplate({
      businessId: "business-1",
      customerId: "customer-1",
      phone: "2348012345678",
      templateName: "inbox_reply",
      language: "en",
      variables: [],
    })).rejects.toThrow("complete recorded WhatsApp consent");
    expect(mocks.webhookEventFindFirst).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("sends a marketing template for an opted-in announcement when explicitly selected", async () => {
    const approvedPage = () => page([
      { id: "template-marketing", name: "customer_announcement", language: "en", status: "APPROVED", category: "MARKETING", components: [{ type: "BODY", text: "Hello {{1}} from {{2}}: {{3}}" }] },
    ]);
    mocks.fetch
      .mockImplementationOnce(async () => approvedPage())
      .mockImplementationOnce(async () => approvedPage())
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid-marketing-1" }] }), { status: 200 }));
    const result = await sendAutomatedWhatsAppTemplate({
      businessId: "business-1", customerId: "customer-1", phone: "2348012345678",
      templateName: "customer_announcement", language: "en",
      variableValues: ["Ada", "LaundryAngel", "Holiday opening hours"],
      templateCategory: "MARKETING",
    });
    expect(result.providerMessageId).toBe("wamid-marketing-1");
  });

  it("rejects marketing templates for automated order-status notifications", async () => {
    const approved = page([
      { id: "template-1", name: "order_update_marketing", language: "en", status: "APPROVED", category: "MARKETING", components: [{ type: "BODY", text: "Hello {{1}}" }] },
    ]);
    mocks.fetch.mockResolvedValueOnce(approved);
    await expect(sendAutomatedWhatsAppTemplate({
      businessId: "business-1", customerId: "customer-1", phone: "2348012345678",
      templateName: "order_update_marketing", language: "en", variableValues: ["Ada"],
    })).rejects.toThrow("must use an approved UTILITY");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses automated template delivery when the saved customer has not opted in", async () => {
    mocks.customerFindFirst.mockResolvedValue({ id: "customer-1", phone: "2348012345678", whatsappOptIn: false });
    await expect(sendAutomatedWhatsAppTemplate({
      businessId: "business-1", customerId: "customer-1", phone: "2348012345678",
      templateName: "order_update", language: "en", variableValues: ["Ada"],
    })).rejects.toThrow("recorded WhatsApp consent");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses automated templates when opt-in has no recorded source or timestamp", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      id: "customer-1",
      phone: "2348012345678",
      whatsappOptIn: true,
      whatsappOptInAt: null,
      whatsappOptInSource: null,
    });

    await expect(sendAutomatedWhatsAppTemplate({
      businessId: "business-1",
      customerId: "customer-1",
      phone: "2348012345678",
      templateName: "order_update",
      language: "en",
      variableValues: ["Ada"],
    })).rejects.toThrow("consent (source and timestamp)");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects pagination URLs outside the Meta Graph API host", async () => {
    mocks.fetch.mockResolvedValueOnce(page([], "https://attacker.example/collect"));
    await expect(listApprovedWhatsAppTemplates("business-1"))
      .rejects.toThrow("unexpected template pagination URL");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("fails instead of silently returning a partial catalogue after ten pages", async () => {
    for (let index = 0; index < 10; index += 1) {
      mocks.fetch.mockResolvedValueOnce(page([], `https://graph.facebook.com/v23.0/123456789/message_templates?after=cursor-${index + 1}`));
    }
    await expect(listApprovedWhatsAppTemplates("business-1"))
      .rejects.toThrow("more than 1,000 templates");
    expect(mocks.fetch).toHaveBeenCalledTimes(10);
  });
});
