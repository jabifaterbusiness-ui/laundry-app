import { beforeEach, describe, expect, it, vi } from "vitest";
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    businessInboxMessage: {
      findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(),
    },
  },
}));
vi.mock("../../src/lib/prisma.js", () => ({ prisma: prismaMock }));
import { dismissBusinessInboxPopup, listBusinessInbox, markBusinessInboxMessageRead } from "../../src/modules/inbox/inbox.service.js";

describe("business inbox service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes inbox results and unread count to the authenticated user and business", async () => {
    prismaMock.businessInboxMessage.findMany.mockResolvedValue([{ id: "message-1" }]);
    prismaMock.businessInboxMessage.count.mockResolvedValue(1);
    const result = await listBusinessInbox("user-1", "business-1");
    expect(result).toEqual({ messages: [{ id: "message-1" }], unreadCount: 1 });
    expect(prismaMock.businessInboxMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user-1", businessId: "business-1" }),
    }));
  });

  it("marks only the current user's message as read", async () => {
    prismaMock.businessInboxMessage.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.businessInboxMessage.findFirst.mockResolvedValue({ id: "message-1", readAt: new Date() });
    await markBusinessInboxMessageRead("message-1", "user-1", "business-1");
    expect(prismaMock.businessInboxMessage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "message-1", userId: "user-1", businessId: "business-1", readAt: null },
    }));
  });

  it("dismisses only the current user's popup", async () => {
    prismaMock.businessInboxMessage.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.businessInboxMessage.findFirst.mockResolvedValue({ id: "message-1", dismissedAt: new Date() });
    await dismissBusinessInboxPopup("message-1", "user-1", "business-1");
    expect(prismaMock.businessInboxMessage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "message-1", userId: "user-1", businessId: "business-1", dismissedAt: null },
    }));
  });
});
