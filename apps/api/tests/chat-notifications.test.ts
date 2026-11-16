import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    chatMessage: { findMany: vi.fn() },
  },
}));

import { prisma } from "../src/lib/prisma.js";
import { listNotifications } from "../src/modules/chat/chat.controller.js";

const findMany = vi.mocked(prisma.chatMessage.findMany);

function response() {
  const res = { json: vi.fn() } as unknown as Response;
  return res;
}

function request(query: Record<string, unknown> = {}) {
  return {
    user: { id: "user-a", businessId: "business-a" },
    branchId: "branch-a",
    query,
  } as unknown as Request;
}

describe("chat notification feed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes notifications to the signed-in user's business, branch and active memberships", async () => {
    findMany.mockResolvedValue([] as never);
    const res = response();

    await listNotifications(request({ since: "2026-11-16T00:00:00.000Z" }), res);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        senderUserId: { not: "user-a" },
        deletedAt: null,
        conversation: {
          businessId: "business-a",
          branchId: "branch-a",
          participants: { some: { userId: "user-a", leftAt: null } },
        },
      }),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 30,
      include: expect.objectContaining({
        sender: { select: { id: true, fullName: true } },
        conversation: { select: { id: true, title: true, kind: true } },
      }),
    }));
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });

  it("uses a stable timestamp-and-id cursor so a full page can continue without gaps", async () => {
    findMany.mockResolvedValue([] as never);
    const res = response();
    await listNotifications(request({
      since: "2026-11-16T00:00:01.000Z",
      afterId: "11111111-1111-4111-8111-111111111111",
    }), res);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { createdAt: { gt: new Date("2026-11-16T00:00:01.000Z") } },
          {
            createdAt: new Date("2026-11-16T00:00:01.000Z"),
            id: { gt: "11111111-1111-4111-8111-111111111111" },
          },
        ],
      }),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 30,
    }));
  });

  it("rejects an invalid message id cursor without querying messages", async () => {
    const res = response();
    await expect(listNotifications(request({
      since: "2026-11-16T00:00:00.000Z",
      afterId: "not-a-uuid",
    }), res)).rejects.toMatchObject({
      statusCode: 422,
      message: "Invalid notification cursor",
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns only safe notification metadata and truncates message previews", async () => {
    const createdAt = new Date("2026-11-16T00:00:01.000Z");
    findMany.mockResolvedValue([{
      id: "message-1",
      body: "x".repeat(200),
      createdAt,
      sender: { id: "sender-a", fullName: "Alex" },
      conversation: { id: "conversation-a", title: "Operations", kind: "GROUP" },
    }] as never);
    const res = response();

    await listNotifications(request(), res);

    expect(res.json).toHaveBeenCalledWith({
      data: [{
        id: "message-1",
        conversationId: "conversation-a",
        conversationTitle: "Operations",
        conversationKind: "GROUP",
        senderId: "sender-a",
        senderName: "Alex",
        preview: "x".repeat(160),
        createdAt,
      }],
    });
  });

  it("rejects an invalid notification cursor without querying messages", async () => {
    const res = response();
    await expect(listNotifications(request({ since: "not-a-date" }), res)).rejects.toMatchObject({
      statusCode: 422,
      message: "Invalid notification cursor",
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("requires a business and active branch context", async () => {
    const res = response();
    await expect(listNotifications({
      user: { id: "user-a", businessId: "business-a" },
      query: {},
    } as unknown as Request, res)).rejects.toMatchObject({
      statusCode: 400,
      message: "Choose an active branch to use chat",
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});
