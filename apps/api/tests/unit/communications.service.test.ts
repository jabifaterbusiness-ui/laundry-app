import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  communicationDeliveryFindFirst: vi.fn(),
  communicationDeliveryFindMany: vi.fn(),
  communicationDeliveryCreate: vi.fn(),
  communicationDeliveryUpdateMany: vi.fn(),
  customerFindFirst: vi.fn(),
  sendWhatsAppText: vi.fn(),
  sendAutomatedWhatsAppTemplate: vi.fn(),
  assertWhatsAppMessagingEnabled: vi.fn(),
  replayPendingWhatsAppStatusEvents: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    communicationDelivery: {
      findFirst: mocks.communicationDeliveryFindFirst,
      findMany: mocks.communicationDeliveryFindMany,
      create: mocks.communicationDeliveryCreate,
      updateMany: mocks.communicationDeliveryUpdateMany,
    },
    customer: {
      findFirst: mocks.customerFindFirst,
    },
  },
}));

vi.mock("../../src/modules/invoices/providers/resend.provider.js", () => ({
  sendHtmlEmail: vi.fn(),
}));

vi.mock("../../src/modules/invoices/providers/whatsapp.provider.js", () => ({
  sendWhatsAppText: mocks.sendWhatsAppText,
}));

vi.mock("../../src/modules/platform/platform-controls.middleware.js", () => ({
  assertWhatsAppMessagingEnabled: mocks.assertWhatsAppMessagingEnabled,
}));

vi.mock("../../src/modules/whatsapp/whatsapp-webhook.service.js", () => ({
  replayPendingWhatsAppStatusEvents: mocks.replayPendingWhatsAppStatusEvents,
}));

vi.mock("../../src/modules/whatsapp/whatsapp-templates.service.js", () => ({
  sendAutomatedWhatsAppTemplate: mocks.sendAutomatedWhatsAppTemplate,
}));

import { listCommunicationDeliveries, retryWhatsAppDelivery } from "../../src/modules/communications/communications.service.js";

const DELIVERY_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";

function failedDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: DELIVERY_ID,
    businessId: "business-1",
    customerId: CUSTOMER_ID,
    orderId: ORDER_ID,
    campaignId: null,
    channel: "WHATSAPP",
    messageType: "ORDER_STATUS",
    destination: "+2348000000000",
    status: "FAILED",
    dedupeKey: "order-status:order-1:rule-1:READY_FOR_PICKUP:WHATSAPP",
    retryAttempt: 0,
    retryPayload: {
      subject: "Order update",
      body: "Hello Ada, order 001 is ready.",
      whatsappTemplateName: "order_ready",
      whatsappTemplateLanguage: "en",
      whatsappTemplateVariables: ["Ada", "001", "ready", "LaundryAngel"],
      whatsappTemplateCategory: "UTILITY",
    },
    retries: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.communicationDeliveryFindFirst.mockResolvedValue(failedDelivery());
  mocks.communicationDeliveryFindMany.mockResolvedValue([]);
  mocks.communicationDeliveryCreate.mockResolvedValue({ id: "retry-delivery-1" });
  mocks.communicationDeliveryUpdateMany.mockResolvedValue({ count: 1 });
  mocks.customerFindFirst.mockResolvedValue({ whatsappOptIn: true, phone: "+2348000000000" });
  mocks.sendWhatsAppText.mockResolvedValue({ id: "wamid.retry-1" });
  mocks.sendAutomatedWhatsAppTemplate.mockResolvedValue({ providerMessageId: "wamid.template-1" });
  mocks.assertWhatsAppMessagingEnabled.mockResolvedValue(undefined);
  mocks.replayPendingWhatsAppStatusEvents.mockResolvedValue(undefined);
});

describe("listCommunicationDeliveries", () => {
  it("marks only retryable failed WhatsApp attempts and does not expose stored message payloads", async () => {
    mocks.communicationDeliveryFindMany.mockResolvedValue([
      {
        ...failedDelivery(),
        customer: { id: CUSTOMER_ID, name: "Ada", phone: "+2348000000000", whatsappOptIn: true },
        order: { id: ORDER_ID, orderNumber: "001" },
        campaign: null,
      },
    ]);

    const result = await listCommunicationDeliveries("business-1", "branch-1");

    expect(mocks.communicationDeliveryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "business-1",
          OR: [
            { campaignId: { not: null } },
            { order: { is: { branchId: "branch-1" } } },
          ],
        },
        take: 200,
      }),
    );
    expect(result[0]).toMatchObject({
      id: DELIVERY_ID,
      retryAvailable: true,
      retryAttempt: 0,
      customer: { name: "Ada" },
    });
    expect(result[0]).not.toHaveProperty("retryPayload");
    expect(result[0]?.customer).not.toHaveProperty("phone");
    expect(result[0]?.customer).not.toHaveProperty("whatsappOptIn");
  });

  it("does not advertise retries when the customer opted out or the stored destination is stale", async () => {
    mocks.communicationDeliveryFindMany.mockResolvedValue([
      {
        ...failedDelivery(),
        customer: { id: CUSTOMER_ID, name: "Ada", phone: "+2348999999999", whatsappOptIn: true },
        order: { id: ORDER_ID, orderNumber: "001" },
        campaign: null,
      },
      {
        ...failedDelivery({ id: "22222222-2222-4222-8222-222222222223" }),
        customer: { id: CUSTOMER_ID, name: "Ada", phone: "+2348000000000", whatsappOptIn: false },
        order: { id: ORDER_ID, orderNumber: "001" },
        campaign: null,
      },
    ]);

    const result = await listCommunicationDeliveries("business-1", "branch-1");

    expect(result).toHaveLength(2);
    expect(result.every((delivery) => delivery.retryAvailable === false)).toBe(true);
  });
});

describe("retryWhatsAppDelivery", () => {
  it("retries a failed WhatsApp delivery using the stored original message", async () => {
    const result = await retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1");

    expect(mocks.communicationDeliveryFindFirst).toHaveBeenCalledWith({
      where: {
        id: DELIVERY_ID,
        businessId: "business-1",
        channel: "WHATSAPP",
        OR: [
          { campaignId: { not: null } },
          { order: { is: { branchId: "branch-1" } } },
        ],
      },
      include: {
        retries: { select: { id: true }, take: 1 },
      },
    });
    expect(mocks.customerFindFirst).toHaveBeenCalledWith({
      where: { id: CUSTOMER_ID, businessId: "business-1" },
      select: { whatsappOptIn: true, phone: true },
    });
    expect(mocks.communicationDeliveryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "business-1",
        customerId: CUSTOMER_ID,
        orderId: ORDER_ID,
        channel: "WHATSAPP",
        messageType: "ORDER_STATUS",
        destination: "+2348000000000",
        dedupeKey: "order-status:order-1:rule-1:READY_FOR_PICKUP:WHATSAPP:retry:1",
        retryOfId: DELIVERY_ID,
        retryAttempt: 1,
        retryPayload: failedDelivery().retryPayload,
        status: "PENDING",
      }),
    });
    expect(mocks.sendWhatsAppText).toHaveBeenCalledWith({
      businessId: "business-1",
      to: "+2348000000000",
      body: "Hello Ada, order 001 is ready.",
    });
    expect(mocks.communicationDeliveryUpdateMany).toHaveBeenCalledWith({
      where: { id: "retry-delivery-1", status: "PENDING" },
      data: {
        status: "SENT",
        providerMessageId: "wamid.retry-1",
        sentAt: expect.any(Date),
      },
    });
    expect(mocks.replayPendingWhatsAppStatusEvents).toHaveBeenCalledWith("wamid.retry-1");
    expect(result).toMatchObject({
      status: "SENT",
      deliveryId: "retry-delivery-1",
      retryOfId: DELIVERY_ID,
      retryAttempt: 1,
      providerMessageId: "wamid.retry-1",
    });
  });

  it("uses the stored approved template when the WhatsApp service window is closed", async () => {
    mocks.sendWhatsAppText.mockRejectedValue(
      new Error("24-hour WhatsApp customer-service window is closed"),
    );

    const result = await retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1");

    expect(mocks.sendAutomatedWhatsAppTemplate).toHaveBeenCalledWith({
      businessId: "business-1",
      customerId: CUSTOMER_ID,
      phone: "+2348000000000",
      templateName: "order_ready",
      language: "en",
      variableValues: ["Ada", "001", "ready", "LaundryAngel"],
      templateCategory: "UTILITY",
    });
    expect(result).toMatchObject({ status: "SENT", providerMessageId: "wamid.template-1" });
  });

  it("rejects deliveries that are not failed", async () => {
    mocks.communicationDeliveryFindFirst.mockResolvedValue(
      failedDelivery({ status: "DELIVERED" }),
    );

    await expect(
      retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1"),
    ).rejects.toMatchObject({
      message: "Only failed WhatsApp deliveries can be retried",
      statusCode: 409,
    });
    expect(mocks.communicationDeliveryCreate).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("prevents retrying an earlier attempt when a retry already exists", async () => {
    mocks.communicationDeliveryFindFirst.mockResolvedValue(
      failedDelivery({ retries: [{ id: "retry-delivery-1" }] }),
    );

    await expect(
      retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1"),
    ).rejects.toMatchObject({
      message: "This delivery already has a retry attempt. Retry the latest failed attempt instead.",
      statusCode: 409,
    });
    expect(mocks.communicationDeliveryCreate).not.toHaveBeenCalled();
  });

  it("rejects records without a persisted original payload", async () => {
    mocks.communicationDeliveryFindFirst.mockResolvedValue(
      failedDelivery({ retryPayload: null }),
    );

    await expect(
      retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1"),
    ).rejects.toMatchObject({
      message: "The original WhatsApp message payload is unavailable for retry",
      statusCode: 422,
    });
    expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("rejects a retry when the customer's phone number no longer matches the original destination", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      whatsappOptIn: true,
      phone: "+2348999999999",
    });

    await expect(
      retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1"),
    ).rejects.toMatchObject({
      message: "Customer phone number has changed since this message was created. Confirm consent for the current number before retrying.",
      statusCode: 422,
    });

    expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
    expect(mocks.communicationDeliveryCreate).not.toHaveBeenCalled();
  });

  it("rejects a retry when the customer has not opted in", async () => {
    mocks.customerFindFirst.mockResolvedValue({ whatsappOptIn: false, phone: "+2348000000000" });

    await expect(
      retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1"),
    ).rejects.toMatchObject({
      message: "Customer has not explicitly opted in to WhatsApp messages. Record consent before retrying.",
      statusCode: 422,
    });

    expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
    expect(mocks.communicationDeliveryCreate).not.toHaveBeenCalled();
  });
});
