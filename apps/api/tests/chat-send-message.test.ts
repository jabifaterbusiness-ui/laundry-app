import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    chatParticipant: { findFirst: vi.fn(), findMany: vi.fn() },
    chatMessage: { findFirst: vi.fn() },
    chatAttachment: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../src/modules/chat/chat-storage.service.js", () => ({
  readChatFile: vi.fn(),
  storeChatFile: vi.fn(),
  deleteChatFile: vi.fn(),
}));
vi.mock("../src/modules/chat/chat-events.service.js", () => ({ publishChatEvent: vi.fn(), subscribeChatEvents: vi.fn() }));

import { prisma } from "../src/lib/prisma.js";
import { sendMessage } from "../src/modules/chat/chat.controller.js";
import { publishChatEvent } from "../src/modules/chat/chat-events.service.js";

const findParticipant = vi.mocked(prisma.chatParticipant.findFirst);
const findParticipants = vi.mocked(prisma.chatParticipant.findMany);
const publishEvent = vi.mocked(publishChatEvent);
const findMessage = vi.mocked(prisma.chatMessage.findFirst);
const findAttachments = vi.mocked(prisma.chatAttachment.findMany);
const transaction = vi.mocked(prisma.$transaction);

function request() {
  return {
    user: { id: "user-a", businessId: "business-a", securityRole: "STAFF" },
    branchId: "branch-a",
    params: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    body: {
      body: "Please find the attached invoice",
      attachmentIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      clientMessageId: "client-message-123",
    },
    header: vi.fn(),
  } as unknown as Request;
}

function response() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("chat message send idempotency", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the original message on retry before checking attachments already linked to it", async () => {
    findParticipant.mockResolvedValue({
      id: "participant-a",
      conversation: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", businessId: "business-a" },
    } as never);
    const original = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      body: "Please find the attached invoice",
      sender: { id: "user-a", fullName: "Alex" },
      attachments: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", originalName: "invoice.pdf", safeMimeType: "application/pdf", sizeBytes: 1024 }],
    };
    findMessage.mockResolvedValue(original as never);
    const res = response();

    await sendMessage(request(), res);

    expect(findMessage).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        senderUserId: "user-a",
        clientMessageId: "client-message-123",
      },
      include: expect.objectContaining({
        sender: { select: { id: true, fullName: true } },
        attachments: expect.objectContaining({ where: { deletedAt: null } }),
      }),
    }));
    expect(findAttachments).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: original });
  });
  it("returns the original message when a concurrent retry loses the unique-key race", async () => {
    findParticipant.mockResolvedValue({
      id: "participant-a",
      conversation: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", businessId: "business-a" },
    } as never);
    const original = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      body: "Please find the attached invoice",
      sender: { id: "user-a", fullName: "Alex" },
      attachments: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", originalName: "invoice.pdf", safeMimeType: "application/pdf", sizeBytes: 1024 }],
    };
    findMessage.mockResolvedValueOnce(null).mockResolvedValueOnce(original as never);
    findAttachments.mockResolvedValue([{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] as never);
    transaction.mockRejectedValueOnce({ code: "P2002" } as never);
    const res = response();

    await sendMessage(request(), res);

    expect(transaction).toHaveBeenCalledOnce();
    expect(findMessage).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: original });
  });
  it("publishes a metadata-only event to active conversation participants after a new message commits", async () => {
    findParticipant.mockResolvedValue({
      id: "participant-a",
      conversation: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", businessId: "business-a" },
    } as never);
    findMessage.mockResolvedValueOnce(null);
    findAttachments.mockResolvedValue([{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] as never);
    const createdAt = new Date("2026-11-16T20:02:00.000Z");
    const created = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      body: "Please find the attached invoice",
      createdAt,
      sender: { id: "user-a", fullName: "Alex" },
      attachments: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", originalName: "invoice.pdf", safeMimeType: "application/pdf", sizeBytes: 1024 }],
    };
    transaction.mockResolvedValueOnce(created as never);
    findParticipants.mockResolvedValue([{ userId: "user-a" }, { userId: "user-b" }] as never);
    const res = response();

    await sendMessage(request(), res);

    expect(publishEvent).toHaveBeenCalledWith("business-a", ["user-a", "user-b"], {
      id: created.id,
      type: "message.created",
      conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      messageId: created.id,
      createdAt: createdAt.toISOString(),
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });


});
