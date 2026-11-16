import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    chatConversation: { findFirst: vi.fn(), upsert: vi.fn(), create: vi.fn() },
    chatMessage: { count: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    chatParticipant: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
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
import { createDirectConversation, listDirectory } from "../src/modules/chat/chat.controller.js";

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
});
