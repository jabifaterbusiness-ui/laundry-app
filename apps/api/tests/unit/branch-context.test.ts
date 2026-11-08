import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    userBranch: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import { requireBranchContext } from "../../src/middleware/branch-context.js";
import { AppError } from "../../src/middleware/error-handler.js";

const findUnique = vi.mocked(prisma.userBranch.findUnique);

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    user: { id: "user-1", email: "a@example.com", role: "STAFF", businessId: "biz-1" },
    ...overrides,
  } as unknown as Request;
}

const res = {} as Response;
const next = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireBranchContext", () => {
  it("sets req.branchId for an authorized active branch", async () => {
    findUnique.mockResolvedValue({
      id: "ub-1",
      userId: "user-1",
      branchId: "branch-1",
      createdAt: new Date(),
      branch: { id: "branch-1", businessId: "biz-1", name: "Main", address: null, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    } as never);

    const req = makeReq({ headers: { "x-branch-id": "branch-1" } });
    await requireBranchContext(req, res, next);

    expect(req.branchId).toBe("branch-1");
    expect(next).toHaveBeenCalledOnce();
  });

  it("denies access to an inactive branch even when the user remains a member", async () => {
    findUnique.mockResolvedValue({
      id: "ub-1",
      userId: "user-1",
      branchId: "branch-1",
      createdAt: new Date(),
      branch: { id: "branch-1", businessId: "biz-1", name: "Closed", address: null, isActive: false, createdAt: new Date(), updatedAt: new Date() },
    } as never);

    const req = makeReq({ headers: { "x-branch-id": "branch-1" } });

    await expect(requireBranchContext(req, res, next)).rejects.toMatchObject({
      statusCode: 403,
      message: "You do not have access to this branch",
    });
    expect(req.branchId).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it("denies unauthorized branch access (no membership row)", async () => {
    findUnique.mockResolvedValue(null);

    const req = makeReq({ headers: { "x-branch-id": "branch-2" } });

    await expect(requireBranchContext(req, res, next)).rejects.toThrow(AppError);
    expect(req.branchId).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it("denies cross-business branch access even with a membership row", async () => {
    findUnique.mockResolvedValue({
      id: "ub-1",
      userId: "user-1",
      branchId: "branch-3",
      createdAt: new Date(),
      branch: { id: "branch-3", businessId: "other-biz", name: "Other", address: null, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    } as never);

    const req = makeReq({ headers: { "x-branch-id": "branch-3" } });

    await expect(requireBranchContext(req, res, next)).rejects.toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects when the caller has no business context at all", async () => {
    const req = makeReq({
      user: {
        id: "user-1",
        email: "a@example.com",
        role: "STAFF",
        securityRole: "STAFF",
        businessId: null,
      },
      headers: { "x-branch-id": "branch-1" },
    });

    await expect(requireBranchContext(req, res, next)).rejects.toThrow(AppError);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects when no X-Branch-Id header is sent", async () => {
    const req = makeReq({ headers: {} });

    await expect(requireBranchContext(req, res, next)).rejects.toThrow(AppError);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
