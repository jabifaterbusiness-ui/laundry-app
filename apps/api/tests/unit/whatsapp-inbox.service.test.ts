import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindMany: vi.fn(),
  eventFindFirst: vi.fn(),
  eventCreate: vi.fn(),
  eventUpdateMany: vi.fn(),
  customerFindMany: vi.fn(),
  customerFindFirst: vi.fn(),
  connectionFindUnique: vi.fn(),
  sendText: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    whatsAppWebhookEvent: { findMany: mocks.eventFindMany, findFirst: mocks.eventFindFirst, create: mocks.eventCreate, updateMany: mocks.eventUpdateMany },
    customer: { findMany: mocks.customerFindMany, findFirst: mocks.customerFindFirst },
    whatsAppBusinessConnection: { findUnique: mocks.connectionFindUnique },
  },
}));
vi.mock("../../src/modules/invoices/providers/whatsapp.provider.js", () => ({
  sendWhatsAppText: mocks.sendText,
  normalizeWhatsAppRecipient: (value: string) => { const normalized = value.replace(/\D/g, ""); return normalized.length === 11 && normalized.startsWith("0") ? "234" + normalized.slice(1) : normalized; },
}));

import { listWhatsAppConversations, markWhatsAppConversationRead, sendWhatsAppConversationReply } from "../../src/modules/whatsapp/whatsapp-inbox.service.js";

describe("WhatsApp tenant inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventFindMany.mockResolvedValue([]);
    mocks.eventFindFirst.mockResolvedValue({ payload: { from: "2348012345678", timestamp: String(Math.floor(Date.now() / 1000) - 60) }, receivedAt: new Date(Date.now() - 60_000) });
    mocks.eventCreate.mockResolvedValue({});
    mocks.eventUpdateMany.mockResolvedValue({ count: 1 });
    mocks.customerFindMany.mockResolvedValue([]);
    mocks.customerFindFirst.mockResolvedValue({ id: "customer-1", name: "Ada", phone: "2348012345678" });
    mocks.connectionFindUnique.mockResolvedValue({ status: "CONNECTED" });
    mocks.sendText.mockResolvedValue({ id: "wamid-outbound" });
  });

  it("groups inbound and outbound messages by the business customer phone", async () => {
    mocks.eventFindMany.mockResolvedValue([
      { id: "out-1", eventType: "MESSAGE_SENT", payload: { id: "wamid-out", to: "2348012345678", timestamp: "1793800000", type: "text", text: { body: "Your order is ready" } }, providerMessageId: "wamid-out", receivedAt: new Date("2026-11-04T10:01:00Z"), processedAt: null },
      { id: "in-1", eventType: "MESSAGE_RECEIVED", payload: { id: "wamid-in", from: "2348012345678", timestamp: "1793799900", type: "text", text: { body: "Hello" } }, providerMessageId: "wamid-in", receivedAt: new Date("2026-11-04T10:00:00Z"), processedAt: null },
    ]);
    mocks.customerFindMany.mockResolvedValue([{ id: "customer-1", name: "Ada", phone: "2348012345678" }]);

    const result = await listWhatsAppConversations("business-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ customerId: "customer-1", customerName: "Ada", phone: "2348012345678", unreadCount: 1 });
    expect(result[0]?.messages.map((message) => message.direction)).toEqual(["INBOUND", "OUTBOUND"]);
  });

  it("does not show a late failure after a message was delivered", async () => {
    mocks.eventFindMany.mockResolvedValue([
      { id: "out-1", eventType: "MESSAGE_SENT", payload: { id: "wamid-1", to: "2348012345678", timestamp: "1793800000", type: "text", text: { body: "Ready" } }, providerMessageId: "wamid-1", receivedAt: new Date("2026-11-04T10:00:00Z"), processedAt: null },
      { id: "status-failed", eventType: "STATUS_FAILED", payload: { id: "wamid-1", status: "failed" }, providerMessageId: "wamid-1", receivedAt: new Date("2026-11-04T10:03:00Z"), processedAt: null },
      { id: "status-delivered", eventType: "STATUS_DELIVERED", payload: { id: "wamid-1", status: "delivered" }, providerMessageId: "wamid-1", receivedAt: new Date("2026-11-04T10:02:00Z"), processedAt: null },
    ]);
    const result = await listWhatsAppConversations("business-1");
    expect(result[0]?.messages[0]?.status).toBe("DELIVERED");
  });
  it("does not let a late delivered callback upgrade a failed message", async () => {
    mocks.eventFindMany.mockResolvedValue([
      { id: "out-1", eventType: "MESSAGE_SENT", payload: { id: "wamid-1", to: "2348012345678", timestamp: "1793800000", type: "text", text: { body: "Ready" } }, providerMessageId: "wamid-1", receivedAt: new Date("2026-11-04T10:00:00Z"), processedAt: null },
      { id: "status-failed", eventType: "STATUS_FAILED", payload: { id: "wamid-1", status: "failed" }, providerMessageId: "wamid-1", receivedAt: new Date("2026-11-04T10:02:00Z"), processedAt: null },
      { id: "status-delivered", eventType: "STATUS_DELIVERED", payload: { id: "wamid-1", status: "delivered" }, providerMessageId: "wamid-1", receivedAt: new Date("2026-11-04T10:03:00Z"), processedAt: null },
    ]);
    const result = await listWhatsAppConversations("business-1");
    expect(result[0]?.messages[0]?.status).toBe("FAILED");
  });

  it("sends a reply only within the customer's 24-hour service window", async () => {
    mocks.eventFindFirst.mockResolvedValue({
      payload: { from: "2348012345678", timestamp: String(Math.floor(Date.now() / 1000) - 60) },
      receivedAt: new Date(Date.now() - 60_000),
    });
    const result = await sendWhatsAppConversationReply({ businessId: "business-1", customerId: "customer-1", phone: "2348012345678", body: "Thanks for messaging us" });
    expect(mocks.sendText).toHaveBeenCalledWith({ businessId: "business-1", to: "2348012345678", body: "Thanks for messaging us" });
    expect(result.status).toBe("SENT");
  });

  it("allows replies to first-time contacts that are not saved as customers", async () => {
    mocks.eventFindFirst.mockResolvedValue({
      payload: { from: "2348098765432", timestamp: String(Math.floor(Date.now() / 1000) - 60) },
      receivedAt: new Date(Date.now() - 60_000),
    });
    const result = await sendWhatsAppConversationReply({
      businessId: "business-1", phone: "+2348098765432", body: "Hello, how can we help?",
    });
    expect(mocks.customerFindFirst).not.toHaveBeenCalled();
    expect(mocks.sendText).toHaveBeenCalledWith({
      businessId: "business-1", to: "2348098765432", body: "Hello, how can we help?",
    });
    expect(result.customerId).toBeNull();
  });

  it("blocks free-form replies after the 24-hour service window", async () => {
    mocks.eventFindFirst.mockResolvedValue({
      payload: { from: "2348012345678", timestamp: String(Math.floor(Date.now() / 1000) - 25 * 60 * 60) },
      receivedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    await expect(sendWhatsAppConversationReply({ businessId: "business-1", customerId: "customer-1", phone: "2348012345678", body: "Hello again" }))
      .rejects.toThrow("24-hour customer-service window has expired");
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("marks only this tenant customer's inbound messages as read", async () => {
    mocks.eventFindMany.mockResolvedValue([{ id: "in-1", payload: { from: "2348012345678" } }]);
    const result = await markWhatsAppConversationRead({ businessId: "business-1", customerId: "customer-1", phone: "2348012345678" });
    expect(result.markedRead).toBe(1);
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: "business-1", id: { in: ["in-1"] } }) }));
  });
});
