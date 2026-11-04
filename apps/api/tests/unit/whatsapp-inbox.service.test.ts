import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindMany: vi.fn(),\n  eventFindFirst: vi.fn(),
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
}));

import { listWhatsAppConversations, markWhatsAppConversationRead, sendWhatsAppConversationReply } from "../../src/modules/whatsapp/whatsapp-inbox.service.js";

describe("WhatsApp tenant inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventFindMany.mockResolvedValue([]);\n    mocks.eventFindFirst.mockResolvedValue({ payload: { from: "2348012345678", timestamp: String(Math.floor(Date.now() / 1000) - 60) }, receivedAt: new Date(Date.now() - 60_000) });
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

  it("sends a reply only within the customer's 24-hour service window", async () => {
    mocks.eventFindMany.mockResolvedValue([{
      payload: { from: "2348012345678", timestamp: String(Math.floor(Date.now() / 1000) - 60) },
      receivedAt: new Date(Date.now() - 60_000),
    }]);
    const result = await sendWhatsAppConversationReply({ businessId: "business-1", customerId: "customer-1", body: "Thanks for messaging us" });
    expect(mocks.sendText).toHaveBeenCalledWith({ businessId: "business-1", to: "2348012345678", body: "Thanks for messaging us" });
    expect(mocks.eventCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessId: "business-1", eventType: "MESSAGE_SENT", providerMessageId: "wamid-outbound" }),
    }));
    expect(result.status).toBe("SENT");
  });

  it("blocks free-form replies after the 24-hour service window", async () => {
    mocks.eventFindMany.mockResolvedValue([{
      payload: { from: "2348012345678", timestamp: String(Math.floor(Date.now() / 1000) - 25 * 60 * 60) },
      receivedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    }]);
    await expect(sendWhatsAppConversationReply({ businessId: "business-1", customerId: "customer-1", body: "Hello again" }))
      .rejects.toThrow("24-hour customer-service window has expired");
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("marks only this tenant customer's inbound messages as read", async () => {
    mocks.eventFindMany.mockResolvedValue([{ id: "in-1", payload: { from: "2348012345678" } }]);
    const result = await markWhatsAppConversationRead({ businessId: "business-1", customerId: "customer-1" });
    expect(result.markedRead).toBe(1);
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: "business-1", id: { in: ["in-1"] } }) }));
  });
});
