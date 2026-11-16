import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    chatParticipant: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    chatMessage: { findMany: vi.fn() },
  },
}));
vi.mock("../src/modules/chat/chat-storage.service.js", () => ({
  readChatFile: vi.fn(),
  storeChatFile: vi.fn(),
  deleteChatFile: vi.fn(),
}));
vi.mock("../src/modules/chat/chat-events.service.js", () => ({
  publishChatEvent: vi.fn(),
  subscribeChatEvents: vi.fn(),
}));

import { prisma } from "../src/lib/prisma.js";
import { listMessages } from "../src/modules/chat/chat.controller.js";
import { publishChatEvent } from "../src/modules/chat/chat-events.service.js";

const findParticipant = vi.mocked(prisma.chatParticipant.findFirst);
const findParticipants = vi.mocked(prisma.chatParticipant.findMany);
const updateParticipant = vi.mocked(prisma.chatParticipant.updateMany);
const findMessages = vi.mocked(prisma.chatMessage.findMany);
const publishEvent = vi.mocked(publishChatEvent);

const conversationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const messageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const deliveredAt = new Date("2026-11-16T22:00:00.000Z");
const latestMessage = {
  id: messageId,
  conversationId,
  senderUserId: "sender-a",
  body: "Hello",
  createdAt: deliveredAt,
  sender: { id: "sender-a", fullName: "Sender A" },
  attachments: [],
  reactions: [],
  replyTo: null,
};

function request(query: Record<string, string> = {}) {
  return {
    user: { id: "recipient-b", businessId: "business-a", securityRole: "STAFF" },
    branchId: "branch-a",
    params: { id: conversationId },
    query,
  } as unknown as Request;
}

function response() {
  return { json: vi.fn().mockReturnThis() } as unknown as Response;
}

describe("chat delivery receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findParticipant.mockResolvedValue({
      id: "participant-b",
      conversation: { id: conversationId, businessId: "business-a" },
    } as never);
    findMessages.mockResolvedValue([latestMessage] as never);
    updateParticipant.mockResolvedValue({ count: 1 } as never);
    findParticipants.mockResolvedValue([
      { userId: "sender-a" },
      { userId: "recipient-b" },
    ] as never);
  });

  it("marks the newest messages delivered only after a recipient fetches the conversation", async () => {
    const res = response();

    await listMessages(request(), res);

    expect(updateParticipant).toHaveBeenCalledWith({
      where: {
        conversationId,
        userId: "recipient-b",
        leftAt: null,
        OR: [
          { lastDeliveredAt: null },
          { lastDeliveredAt: { lt: deliveredAt } },
          {
            AND: [
              { lastDeliveredAt: deliveredAt },
              { lastDeliveredMessageId: { lt: messageId } },
            ],
          },
        ],
      },
      data: {
        lastDeliveredMessageId: messageId,
        lastDeliveredAt: deliveredAt,
      },
    });
    expect(publishEvent).toHaveBeenCalledWith(
      "business-a",
      ["sender-a", "recipient-b"],
      expect.objectContaining({
        id: `${conversationId}:delivered:recipient-b:${messageId}`,
        type: "conversation.delivered",
        conversationId,
        actorUserId: "recipient-b",
      }),
    );
    expect(res.json).toHaveBeenCalledWith({ data: [latestMessage] });
  });

  it("does not record delivery for message-search results", async () => {
    await listMessages(request({ search: "Hello" }), response());

    expect(updateParticipant).not.toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it("does not emit another delivery event when the marker is already current", async () => {
    updateParticipant.mockResolvedValue({ count: 0 } as never);

    await listMessages(request(), response());

    expect(updateParticipant).toHaveBeenCalledOnce();
    expect(publishEvent).not.toHaveBeenCalled();
  });
});
