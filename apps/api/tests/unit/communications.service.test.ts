import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  communicationDeliveryFindFirst: vi.fn(),
  communicationDeliveryFindMany: vi.fn(),
  communicationDeliveryCreate: vi.fn(),
  communicationDeliveryUpdateMany: vi.fn(),
  customerFindFirst: vi.fn(),
  customerFindMany: vi.fn(),
  customerGroupFindMany: vi.fn(),
  branchResourceShareFindMany: vi.fn(),
  sendWhatsAppText: vi.fn(),
  sendAutomatedWhatsAppTemplate: vi.fn(),
  assertWhatsAppMessagingEnabled: vi.fn(),
  replayPendingWhatsAppStatusEvents: vi.fn(),
  orderStatusRuleUpsert: vi.fn(),
  orderStatusRuleUpdate: vi.fn(),
  orderStatusRuleFindMany: vi.fn(),
  orderStatusRuleFindFirst: vi.fn(),
  orderFindFirst: vi.fn(),
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
      findMany: mocks.customerFindMany,
    },
    customerGroup: {
      findMany: mocks.customerGroupFindMany,
    },
    branchResourceShare: {
      findMany: mocks.branchResourceShareFindMany,
    },
    orderStatusNotificationRule: {
      upsert: mocks.orderStatusRuleUpsert,
      update: mocks.orderStatusRuleUpdate,
      findMany: mocks.orderStatusRuleFindMany,
      findFirst: mocks.orderStatusRuleFindFirst,
    },
    order: { findFirst: mocks.orderFindFirst },
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

import { createAnnouncement, listCommunicationDeliveries, listCustomerGroups, listOrderStatusRules, notifyOrderStatus, retryWhatsAppDelivery } from "../../src/modules/communications/communications.service.js";

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
  mocks.customerFindFirst.mockResolvedValue({
    whatsappOptIn: true,
    whatsappOptInAt: new Date("2026-10-01T00:00:00.000Z"),
    whatsappOptInSource: "CUSTOMER_WRITTEN",
    phone: "+2348000000000",
  });
  mocks.customerFindMany.mockResolvedValue([]);
  mocks.customerGroupFindMany.mockResolvedValue([]);
  mocks.branchResourceShareFindMany.mockResolvedValue([]);
  mocks.sendWhatsAppText.mockResolvedValue({ id: "wamid.retry-1" });
  mocks.sendAutomatedWhatsAppTemplate.mockResolvedValue({ providerMessageId: "wamid.template-1" });
  mocks.assertWhatsAppMessagingEnabled.mockResolvedValue(undefined);
  mocks.replayPendingWhatsAppStatusEvents.mockResolvedValue(undefined);
  mocks.orderStatusRuleUpsert.mockResolvedValue({
    id: "ready-rule-1", enabled: false, channel: "WHATSAPP",
    whatsappTemplateName: null, whatsappTemplateLanguage: null,
  });
  mocks.orderStatusRuleUpdate.mockResolvedValue({
    id: "ready-rule-1", enabled: false, channel: "WHATSAPP",
    whatsappTemplateName: null, whatsappTemplateLanguage: null,
  });
  mocks.orderStatusRuleFindMany.mockResolvedValue([]);
});

describe("customer communications branch visibility", () => {
  it("lists only customer groups containing customers visible to the active branch", async () => {
    await listCustomerGroups("business-1", "branch-1", "user-1");

    expect(mocks.customerGroupFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        businessId: "business-1",
        members: {
          some: {
            businessId: "business-1",
            customer: {
              OR: [
                { ownerBranchId: { in: ["branch-1"] } },
                { id: { in: [] } },
              ],
            },
          },
        },
      },
    }));
  });

  it("rejects an announcement selection containing a customer hidden from the active branch", async () => {
    await expect(createAnnouncement({
      businessId: "business-1",
      branchId: "branch-1",
      userId: "user-1",
      createdByUserId: "user-1",
      title: "Branch update",
      message: "Hello",
      channels: ["EMAIL"],
      audience: "SELECTED_CUSTOMERS",
      customerIds: [CUSTOMER_ID],
    })).rejects.toMatchObject({
      message: "One or more selected customers are unavailable",
      statusCode: 422,
    });

    expect(mocks.customerFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        businessId: "business-1",
        id: { in: [CUSTOMER_ID] },
        lifecycleStatus: "ACTIVE",
        OR: [
          { ownerBranchId: { in: ["branch-1"] } },
          { id: { in: [] } },
        ],
      },
    }));
  });
});

describe("default order-status notification compliance", () => {
  it("keeps the default ready notification disabled until an approved template is configured", async () => {
    const legacyRule = {
      id: "ready-rule-1",
      enabled: true,
      channel: "WHATSAPP",
      whatsappTemplateName: null,
      whatsappTemplateLanguage: null,
    };
    mocks.orderStatusRuleUpsert.mockResolvedValue(legacyRule);
    mocks.orderStatusRuleUpdate.mockResolvedValue({ ...legacyRule, enabled: false });
    const legacyInProgressRule = {
      ...legacyRule,
      id: "in-progress-rule-1",
      status: "IN_PROGRESS",
      enabled: true,
    };
    const legacyBothRule = {
      ...legacyRule,
      id: "both-rule-1",
      status: "IN_PROGRESS",
      channel: "BOTH",
      enabled: true,
    };
    mocks.orderStatusRuleFindMany.mockResolvedValue([
      { ...legacyRule, enabled: false },
      legacyInProgressRule,
      legacyBothRule,
    ]);

    await listOrderStatusRules("business-1");

    expect(mocks.orderStatusRuleUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ enabled: false, channel: "WHATSAPP" }),
    }));
    expect(mocks.orderStatusRuleUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "ready-rule-1" },
      data: { enabled: false },
    });
    expect(mocks.orderStatusRuleUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "in-progress-rule-1" },
      data: { enabled: false },
    });
    expect(mocks.orderStatusRuleUpdate).toHaveBeenNthCalledWith(3, {
      where: { id: "both-rule-1" },
      data: { channel: "EMAIL" },
    });
  });
});

describe("automatic WhatsApp order notifications", () => {
  const order = {
    id: "order-1",
    businessId: "business-1",
    branchId: "branch-1",
    customerId: CUSTOMER_ID,
    orderNumber: "00001",
    customer: {
      id: CUSTOMER_ID,
      name: "Ada",
      phone: "+2348000000000",
      email: "ada@example.com",
      whatsappOptIn: true,
    },
    business: { name: "LaundryAngel" },
  };

  beforeEach(() => {
    mocks.orderFindFirst.mockResolvedValue(order);
    mocks.orderStatusRuleUpsert.mockResolvedValue({
      id: "ready-rule-1",
      enabled: true,
      channel: "WHATSAPP",
      whatsappMessage: "Hello {{customerName}}, order {{orderNumber}} is ready.",
      whatsappTemplateName: "order_ready",
      whatsappTemplateLanguage: "en",
      emailSubject: "Order update",
      emailMessage: "Your order is ready.",
    });
    mocks.customerFindFirst.mockResolvedValue({
      whatsappOptIn: true,
      whatsappOptInAt: new Date("2026-10-01T00:00:00.000Z"),
      whatsappOptInSource: "CUSTOMER_WRITTEN",
    });
    mocks.communicationDeliveryCreate.mockResolvedValue({ id: "delivery-1" });
    mocks.communicationDeliveryUpdateMany.mockResolvedValue({ count: 1 });
    mocks.sendWhatsAppText.mockResolvedValue({ id: "wamid-order-1" });
  });

  it("sends the configured WhatsApp notification to an opted-in customer", async () => {
    const result = await notifyOrderStatus({
      orderId: "order-1",
      businessId: "business-1",
      branchId: "branch-1",
      status: "READY_FOR_PICKUP",
    });

    expect(result).toEqual([
      expect.objectContaining({ status: "SENT", channel: "WHATSAPP", providerMessageId: "wamid-order-1" }),
    ]);
    expect(mocks.sendWhatsAppText).toHaveBeenCalledWith({
      businessId: "business-1",
      to: "+2348000000000",
      body: "Hello Ada, order 00001 is ready.",
    });
  });

  it("uses the approved UTILITY template after the 24-hour reply window closes", async () => {
    mocks.sendWhatsAppText.mockRejectedValue(
      new Error("The 24-hour WhatsApp customer-service window is closed. Use an approved template for this customer instead."),
    );
    mocks.sendAutomatedWhatsAppTemplate.mockResolvedValue({ providerMessageId: "wamid-template-ready" });

    const result = await notifyOrderStatus({
      orderId: "order-1",
      businessId: "business-1",
      branchId: "branch-1",
      status: "READY_FOR_PICKUP",
    });

    expect(result).toEqual([
      expect.objectContaining({ status: "SENT", channel: "WHATSAPP", providerMessageId: "wamid-template-ready" }),
    ]);
    expect(mocks.sendAutomatedWhatsAppTemplate).toHaveBeenCalledWith({
      businessId: "business-1",
      customerId: CUSTOMER_ID,
      phone: "+2348000000000",
      templateName: "order_ready",
      language: "en",
      variableValues: ["Ada", "00001", "ready for pickup", "LaundryAngel"],
      templateCategory: "UTILITY",
    });
  });

  it("blocks automatic notifications when legacy opt-in has no source or timestamp", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      whatsappOptIn: true,
      whatsappOptInAt: null,
      whatsappOptInSource: null,
    });

    const result = await notifyOrderStatus({
      orderId: "order-1",
      businessId: "business-1",
      branchId: "branch-1",
      status: "READY_FOR_PICKUP",
    });

    expect(result).toEqual([
      expect.objectContaining({ status: "FAILED", channel: "WHATSAPP" }),
    ]);
    expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
    expect(mocks.sendAutomatedWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("records the notification as blocked when the customer has not opted in", async () => {
    mocks.customerFindFirst.mockResolvedValue({ whatsappOptIn: false });

    const result = await notifyOrderStatus({
      orderId: "order-1",
      businessId: "business-1",
      branchId: "branch-1",
      status: "READY_FOR_PICKUP",
    });

    expect(result).toEqual([
      expect.objectContaining({ status: "FAILED", channel: "WHATSAPP" }),
    ]);
    expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
    expect(mocks.sendAutomatedWhatsAppTemplate).not.toHaveBeenCalled();
  });
});

describe("listCommunicationDeliveries", () => {
  it("marks only retryable failed WhatsApp attempts and does not expose stored message payloads", async () => {
    mocks.communicationDeliveryFindMany.mockResolvedValue([
      {
        ...failedDelivery(),
        customer: { id: CUSTOMER_ID, name: "Ada", phone: "+234 800 000 0000", whatsappOptIn: true, whatsappOptInAt: new Date("2026-11-01T10:00:00.000Z"), whatsappOptInSource: "CUSTOMER_FORM" },
        order: { id: ORDER_ID, orderNumber: "001" },
        campaign: null,
      },
    ]);

    const result = await listCommunicationDeliveries("business-1", "branch-1", "user-1");

    expect(mocks.communicationDeliveryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "business-1",
          OR: [
            {
              order: {
                is: {
                  branchId: "branch-1",
                  customer: {
                    is: {
                      businessId: "business-1",
                      OR: [
                        { ownerBranchId: { in: ["branch-1"] } },
                        { id: { in: [] } },
                      ],
                    },
                  },
                },
              },
            },
            {
              campaignId: { not: null },
              customer: {
                is: {
                  businessId: "business-1",
                  OR: [
                    { ownerBranchId: { in: ["branch-1"] } },
                    { id: { in: [] } },
                  ],
                },
              },
            },
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

  it("does not advertise retries when an opt-in is missing its recorded source or timestamp", async () => {
    mocks.communicationDeliveryFindMany.mockResolvedValue([
      {
        ...failedDelivery(),
        customer: { id: CUSTOMER_ID, name: "Ada", phone: "+2348000000000", whatsappOptIn: true, whatsappOptInAt: null, whatsappOptInSource: "CUSTOMER_FORM" },
        order: { id: ORDER_ID, orderNumber: "001" },
        campaign: null,
      },
      {
        ...failedDelivery({ id: "22222222-2222-4222-8222-222222222224" }),
        customer: { id: CUSTOMER_ID, name: "Ada", phone: "+2348000000000", whatsappOptIn: true, whatsappOptInAt: new Date("2026-11-01T10:00:00.000Z"), whatsappOptInSource: null },
        order: { id: ORDER_ID, orderNumber: "001" },
        campaign: null,
      },
    ]);

    const result = await listCommunicationDeliveries("business-1", "branch-1", "user-1");

    expect(result).toHaveLength(2);
    expect(result.every((delivery) => delivery.retryAvailable === false)).toBe(true);
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

    const result = await listCommunicationDeliveries("business-1", "branch-1", "user-1");

    expect(result).toHaveLength(2);
    expect(result.every((delivery) => delivery.retryAvailable === false)).toBe(true);
  });
});

describe("retryWhatsAppDelivery", () => {
  it("retries a failed WhatsApp delivery using the stored original message", async () => {
    const result = await retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1", "user-1");

    expect(mocks.communicationDeliveryFindFirst).toHaveBeenCalledWith({
      where: {
        id: DELIVERY_ID,
        businessId: "business-1",
        channel: "WHATSAPP",
        OR: [
            {
              order: {
                is: {
                  branchId: "branch-1",
                  customer: {
                    is: {
                      businessId: "business-1",
                      OR: [
                        { ownerBranchId: { in: ["branch-1"] } },
                        { id: { in: [] } },
                      ],
                    },
                  },
                },
              },
            },
            {
              campaignId: { not: null },
              customer: {
                is: {
                  businessId: "business-1",
                  OR: [
                    { ownerBranchId: { in: ["branch-1"] } },
                    { id: { in: [] } },
                  ],
                },
              },
            },
          ],
      },
      include: {
        retries: { select: { id: true }, take: 1 },
      },
    });
    expect(mocks.customerFindFirst).toHaveBeenCalledWith({
      where: { id: CUSTOMER_ID, businessId: "business-1" },
      select: {
        whatsappOptIn: true,
        whatsappOptInAt: true,
        whatsappOptInSource: true,
        phone: true,
      },
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

    const result = await retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1", "user-1");

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
      retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1", "user-1"),
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
      retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1", "user-1"),
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
      retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1", "user-1"),
    ).rejects.toMatchObject({
      message: "The original WhatsApp message payload is unavailable for retry",
      statusCode: 422,
    });
    expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("rejects a retry when the legacy opt-in has no recorded source or timestamp", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      whatsappOptIn: true,
      whatsappOptInAt: null,
      whatsappOptInSource: null,
      phone: "+2348000000000",
    });

    await expect(
      retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1", "user-1"),
    ).rejects.toMatchObject({
      message: "Customer has no complete recorded WhatsApp consent (source and timestamp). Record consent before retrying.",
      statusCode: 422,
    });

    expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
    expect(mocks.communicationDeliveryCreate).not.toHaveBeenCalled();
  });

  it("allows retry when the customer's phone number only has formatting changes", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      whatsappOptIn: true,
      whatsappOptInAt: new Date("2026-10-01T00:00:00.000Z"),
      whatsappOptInSource: "CUSTOMER_WRITTEN",
      phone: "+234 800 000 0000",
    });

    const result = await retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1", "user-1");

    expect(mocks.sendWhatsAppText).toHaveBeenCalledWith({
      businessId: "business-1",
      to: "+2348000000000",
      body: "Hello Ada, order 001 is ready.",
    });
    expect(result).toMatchObject({ status: "SENT", retryAttempt: 1 });
  });
  it("rejects a retry when the customer's phone number no longer matches the original destination", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      whatsappOptIn: true,
      whatsappOptInAt: new Date("2026-10-01T00:00:00.000Z"),
      whatsappOptInSource: "CUSTOMER_WRITTEN",
      phone: "+2348999999999",
    });

    await expect(
      retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1", "user-1"),
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
      retryWhatsAppDelivery(DELIVERY_ID, "business-1", "branch-1", "user-1"),
    ).rejects.toMatchObject({
      message: "Customer has no complete recorded WhatsApp consent (source and timestamp). Record consent before retrying.",
      statusCode: 422,
    });

    expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
    expect(mocks.communicationDeliveryCreate).not.toHaveBeenCalled();
  });
});
