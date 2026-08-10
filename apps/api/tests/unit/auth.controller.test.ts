import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    userBranch: { findMany: vi.fn() },
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/modules/auth/auth.service.js", () => ({
  issueTokenPair: vi.fn().mockResolvedValue({ accessToken: "at", refreshToken: "rt" }),
  revokeRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import { login, me } from "../../src/modules/auth/auth.controller.js";

const findUniqueUser = vi.mocked(prisma.user.findUnique);
const findManyUserBranch = vi.mocked(prisma.userBranch.findMany);

const baseUser = {
  id: "user-1",
  email: "owner@example.com",
  passwordHash: "hash",
  fullName: "Owner",
  role: "BUSINESS_OWNER",
  isActive: true,
  businessId: "biz-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const twoBranchMemberships = [
  { id: "ub-1", userId: "user-1", branchId: "branch-1", createdAt: new Date(), branch: { id: "branch-1", name: "Main St", businessId: "biz-1" } },
  { id: "ub-2", userId: "user-1", branchId: "branch-2", createdAt: new Date(), branch: { id: "branch-2", name: "Downtown", businessId: "biz-1" } },
];

function makeRes() {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auth controller - multi-branch membership", () => {
  it("login returns all of a user's branch memberships, not just one", async () => {
    findUniqueUser.mockResolvedValue(baseUser as never);
    findManyUserBranch.mockResolvedValue(twoBranchMemberships as never);

    const req = { body: { email: "owner@example.com", password: "pw" }, correlationId: "corr-1" } as unknown as Request;
    const res = makeRes();

    await login(req, res);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.user.branches).toEqual([
      { id: "branch-1", name: "Main St" },
      { id: "branch-2", name: "Downtown" },
    ]);
  });

  it("login records a user.login audit event without leaking tokens", async () => {
    findUniqueUser.mockResolvedValue(baseUser as never);
    findManyUserBranch.mockResolvedValue([]);

    const req = { body: { email: "owner@example.com", password: "pw" }, correlationId: "corr-1" } as unknown as Request;
    await login(req, makeRes());

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.login", actorUserId: "user-1", businessId: "biz-1" }),
    );
    const call = vi.mocked(recordAuditEvent).mock.calls[0][0];
    expect(call).not.toHaveProperty("metadata.password");
    expect(call).not.toHaveProperty("accessToken");
    expect(call).not.toHaveProperty("refreshToken");
  });

  it("me reflects multiple branch memberships for the authenticated user", async () => {
    findUniqueUser.mockResolvedValue(baseUser as never);
    findManyUserBranch.mockResolvedValue(twoBranchMemberships as never);

    const req = { user: { id: "user-1", email: "owner@example.com", role: "BUSINESS_OWNER", businessId: "biz-1" } } as unknown as Request;
    const res = makeRes();

    await me(req, res);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.branches).toHaveLength(2);
  });
});
