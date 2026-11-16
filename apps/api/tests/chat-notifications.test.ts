import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    chatMessage: { findMany: vi.fn() },
    chatParticipant: { findFirst: vi.fn() },
  },
}));

import { prisma } from "../src/lib/prisma.js";
import { listMessages, listNotifications } from "../src/modules/chat/chat.controller.js";

const findMany = vi.mocked(prisma.chatMessage.findMany);
const findParticipant = vi.mocked(prisma.chatParticipant.findFirst);

function response() {
  const res = { json: vi.fn() } as unknown as Response;
  return res;
}

function request(query: Record<string, unknown> = {}) {
  return {
    user: { id: "user-a", businessId: "business-a" },
    branchId: "branch-a",
    query,
    params: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  } as unknown as Request;
}

describe("chat notification feed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes notifications to the signed-in user's business and active conversation memberships across branches", async () => {
    findMany.mockResolvedValue([] as never);
    const res = response();

    await listNotifications(request({ since: "2026-11-16T00:00:00.000Z" }), res);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        senderUserId: { not: "user-a" },
        deletedAt: null,
        conversation: {
          businessId: "business-a",
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
      conversation: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Operations", kind: "GROUP" },
    }] as never);
    const res = response();

    await listNotifications(request(), res);

    expect(res.json).toHaveBeenCalledWith({
      data: [{
        id: "message-1",
        conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

describe("chat message history search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findParticipant.mockResolvedValue({ id: "participant-a", conversation: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", businessId: "business-a" } } as never);
  });

  it("searches message text only inside the active member's conversation and excludes deleted matches", async () => {
    findMany.mockResolvedValue([] as never);
    const res = response();

    await listMessages(request({ search: "  invoice overdue  " }), res);

    expect(findParticipant).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        userId: "user-a",
        leftAt: null,
        conversation: { businessId: "business-a" },
      },
    }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        body: { contains: "invoice overdue", mode: "insensitive" },
        deletedAt: null,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    }));
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });

  it("bounds search terms to 100 characters", async () => {
    findMany.mockResolvedValue([] as never);
    const res = response();
    const term = "x".repeat(140);

    await listMessages(request({ search: term }), res);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        body: { contains: "x".repeat(100), mode: "insensitive" },
        deletedAt: null,
      },
    }));
  });
});
