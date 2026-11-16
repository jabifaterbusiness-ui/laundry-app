import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    chatConversation: { findFirst: vi.fn(), upsert: vi.fn(), create: vi.fn() },
    chatMessage: { count: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    chatParticipant: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("../src/modules/permissions/permissions.service.js", () => ({
  hasPermission: vi.fn(),
}));
vi.mock("../src/lib/audit.js", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("../src/modules/chat/chat-storage.service.js", () => ({
  deleteChatFile: vi.fn(),
  readChatFile: vi.fn(),
  storeChatFile: vi.fn(),
}));

import { prisma } from "../src/lib/prisma.js";
import { hasPermission } from "../src/modules/permissions/permissions.service.js";
import { addGroupMember, createDirectConversation, createGroupConversation, listDirectory } from "../src/modules/chat/chat.controller.js";

const findManyUsers = vi.mocked(prisma.user.findMany);
const findFirstUser = vi.mocked(prisma.user.findFirst);
const crossBranchPermission = vi.mocked(hasPermission);

function response() {
  return { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;
}
function request(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "user-a", businessId: "business-a", securityRole: "STAFF" },
    branchId: "branch-a",
    query: {},
    params: {},
    ...overrides,
  } as unknown as Request;
}

describe("cross-branch chat authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("limits colleague discovery to the active branch without chat.cross_branch", async () => {
    crossBranchPermission.mockResolvedValue(false);
    findManyUsers.mockResolvedValue([{
      id: "user-b", fullName: "Branch Colleague", email: "b@example.test", role: "Staff",
      branches: [{ branch: { id: "branch-a", name: "Central Branch" } }],
    }] as never);
    const res = response();

    await listDirectory(request(), res);

    expect(findManyUsers).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business-a",
        branches: { some: { branchId: "branch-a", branch: { isActive: true } } },
      }),
      select: expect.objectContaining({
        branches: expect.objectContaining({
          where: { branch: { businessId: "business-a", isActive: true } },
        }),
      }),
    }));
    expect(res.json).toHaveBeenCalledWith({
      data: [{
        id: "user-b", fullName: "Branch Colleague", email: "b@example.test", role: "Staff",
        branches: [{ id: "branch-a", name: "Central Branch" }],
      }],
    });
  });

  it("allows cross-business branch discovery only when chat.cross_branch is granted", async () => {
    crossBranchPermission.mockResolvedValue(true);
    findManyUsers.mockResolvedValue([] as never);
    await listDirectory(request(), response());

    expect(findManyUsers).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        branches: { some: { branch: { businessId: "business-a", isActive: true } } },
      }),
    }));
  });

  it("rejects a direct chat to another branch when chat.cross_branch is absent", async () => {
    crossBranchPermission.mockResolvedValue(false);
    findFirstUser.mockResolvedValue({
      id: "user-b",
      branches: [{ branchId: "branch-b" }],
    } as never);

    await expect(createDirectConversation(request({
      params: { userId: "11111111-1111-4111-8111-111111111111" },
    }), response())).rejects.toMatchObject({
      statusCode: 403,
      message: "Cross-branch chat permission is required to contact this colleague",
    });
  });

  it("includes colleagues from every active business branch in all-eligible groups when chat.cross_branch is granted", async () => {
    crossBranchPermission.mockResolvedValue(true);
    findManyUsers
      .mockResolvedValueOnce([
        { id: "22222222-2222-4222-8222-222222222222" },
        { id: "33333333-3333-4333-8333-333333333333" },
      ] as never)
      .mockResolvedValueOnce([
        { id: "33333333-3333-4333-8333-333333333333" },
      ] as never);
    vi.mocked(prisma.chatConversation.create).mockResolvedValue({ id: "conversation-a" } as never);
    const res = response();

    await createGroupConversation(request({
      body: { title: "All business colleagues", includeAllEligible: true },
    }), res);

    expect(prisma.chatConversation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        participants: { create: [
          { userId: "user-a", role: "OWNER" },
          { userId: "22222222-2222-4222-8222-222222222222", role: "MEMBER" },
          { userId: "33333333-3333-4333-8333-333333333333", role: "MEMBER" },
        ] },
      }),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("restores a re-added group member from archived state with a fresh read cursor", async () => {
    crossBranchPermission.mockResolvedValue(false);
    vi.mocked(prisma.chatParticipant.findFirst)
      .mockResolvedValueOnce({
        role: "ADMIN",
        conversation: { kind: "GROUP", businessId: "business-a" },
      } as never)
      .mockResolvedValueOnce({
        id: "participant-b",
        leftAt: new Date("2026-11-15T00:00:00.000Z"),
        archivedAt: new Date("2026-11-15T01:00:00.000Z"),
      } as never);
    findManyUsers.mockResolvedValue([{ id: "22222222-2222-4222-8222-222222222222" }] as never);
    vi.mocked(prisma.chatParticipant.upsert).mockResolvedValue({} as never);

    await addGroupMember(request({
      params: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      body: { userId: "22222222-2222-4222-8222-222222222222" },
    }), response());

    expect(prisma.chatParticipant.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { conversationId_userId: { conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userId: "22222222-2222-4222-8222-222222222222" } },
      update: expect.objectContaining({
        leftAt: null,
        role: "MEMBER",
        archivedAt: null,
        lastReadMessageId: null,
        lastReadAt: null,
      }),
    }));
  });
  it("rejects cross-branch group participants without chat.cross_branch", async () => {
    crossBranchPermission.mockResolvedValue(false);
    findManyUsers.mockResolvedValue([{ id: "22222222-2222-4222-8222-222222222222" }] as never);

    await expect(createGroupConversation(request({
      body: {
        title: "Cross-branch group",
        participantIds: ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"],
      },
    }), response())).rejects.toMatchObject({
      statusCode: 403,
      message: "Cross-branch chat permission is required to add colleagues from another branch",
    });
  });
});
