import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    userBranch: { findUnique: vi.fn(), findFirst: vi.fn() },
    branch: { findMany: vi.fn() },
    branchResourceShare: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import { AppError } from "../../src/middleware/error-handler.js";
import {
  deleteBranchResourceShare,
  saveBranchResourceShare,
} from "../../src/modules/branches/branch-resource-sharing.service.js";

const actorFindFirst = vi.mocked(prisma.user.findFirst);
const membershipFindUnique = vi.mocked(prisma.userBranch.findUnique);
const branchFindMany = vi.mocked(prisma.branch.findMany);
const shareFindFirst = vi.mocked(prisma.branchResourceShare.findFirst);
const shareCreate = vi.mocked(prisma.branchResourceShare.create);
const shareDelete = vi.mocked(prisma.branchResourceShare.delete);

const baseInput = {
  businessId: "business-a",
  ownerBranchId: "owner-branch",
  targetBranchId: "target-branch",
  resourceType: "INVENTORY" as const,
  accessLevel: "READ" as const,
  createdByUserId: "actor-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  branchFindMany.mockResolvedValue([
    { id: "owner-branch" },
    { id: "target-branch" },
  ] as never);
  shareFindFirst.mockResolvedValue(null);
  shareCreate.mockResolvedValue({ id: "share-1" } as never);
});

describe("branch resource sharing authorization", () => {
  it("allows a business owner to create a cross-branch sharing rule", async () => {
    actorFindFirst.mockResolvedValue({ securityRole: "BUSINESS_OWNER" } as never);

    await saveBranchResourceShare(baseInput);

    expect(shareCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        businessId: "business-a",
        ownerBranchId: "owner-branch",
        targetBranchId: "target-branch",
      }),
    }));
    expect(membershipFindUnique).not.toHaveBeenCalled();
  });

  it("rejects a staff member who does not belong to the resource-owning branch", async () => {
    actorFindFirst.mockResolvedValue({ securityRole: "STAFF" } as never);
    membershipFindUnique.mockResolvedValue(null);

    await expect(saveBranchResourceShare(baseInput)).rejects.toBeInstanceOf(AppError);

    expect(branchFindMany).not.toHaveBeenCalled();
    expect(shareCreate).not.toHaveBeenCalled();
  });

  it("allows an authorized branch member to create a sharing rule", async () => {
    actorFindFirst.mockResolvedValue({ securityRole: "BRANCH_MANAGER" } as never);
    membershipFindUnique.mockResolvedValue({ id: "membership-1" } as never);

    await saveBranchResourceShare(baseInput);

    expect(membershipFindUnique).toHaveBeenCalledWith({
      where: {
        userId_branchId: {
          userId: "actor-1",
          branchId: "owner-branch",
        },
      },
      select: { id: true },
    });
    expect(shareCreate).toHaveBeenCalled();
  });

  it("prevents a staff member from deleting another branch's sharing rule", async () => {
    shareFindFirst.mockResolvedValue({
      id: "share-1",
      ownerBranchId: "owner-branch",
    } as never);
    actorFindFirst.mockResolvedValue({ securityRole: "STAFF" } as never);
    membershipFindUnique.mockResolvedValue(null);

    await expect(deleteBranchResourceShare({
      businessId: "business-a",
      id: "share-1",
      actorUserId: "actor-1",
    })).rejects.toBeInstanceOf(AppError);

    expect(shareDelete).not.toHaveBeenCalled();
  });

  it("allows a business owner to delete a sharing rule in their business", async () => {
    shareFindFirst.mockResolvedValue({
      id: "share-1",
      ownerBranchId: "owner-branch",
    } as never);
    actorFindFirst.mockResolvedValue({ securityRole: "BUSINESS_OWNER" } as never);

    await deleteBranchResourceShare({
      businessId: "business-a",
      id: "share-1",
      actorUserId: "actor-1",
    });

    expect(shareDelete).toHaveBeenCalledWith({ where: { id: "share-1" } });
  });
});
