import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    customer: { findMany: vi.fn() },
    customerAccount: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    customerAccountTransaction: { findMany: vi.fn(), updateMany: vi.fn() },
    user: { findFirst: vi.fn() },
    userBranch: { findUnique: vi.fn(), findFirst: vi.fn() },
    branch: { findMany: vi.fn() },
    inventoryItem: { findFirst: vi.fn() },
    employeeCompensation: { findFirst: vi.fn() },
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
import { recordAuditEvent } from "../../src/lib/audit.js";
import { AppError } from "../../src/middleware/error-handler.js";
import {
  deleteBranchResourceShare,
  saveBranchResourceShare,
} from "../../src/modules/branches/branch-resource-sharing.service.js";

const actorFindFirst = vi.mocked(prisma.user.findFirst);
const membershipFindUnique = vi.mocked(prisma.userBranch.findUnique);
const branchFindMany = vi.mocked(prisma.branch.findMany);
const inventoryItemFindFirst = vi.mocked(prisma.inventoryItem.findFirst);
const employeeCompensationFindFirst = vi.mocked(prisma.employeeCompensation.findFirst);
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
  vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(prisma) as never);
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

    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "branch.resource_share.created",
      entityType: "BranchResourceShare",
      businessId: "business-a",
      branchId: "owner-branch",
    }));
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

  it("rejects an individual resource that is not owned by the selected branch", async () => {
    actorFindFirst.mockResolvedValue({ securityRole: "BRANCH_MANAGER" } as never);
    membershipFindUnique.mockResolvedValue({ id: "membership-1" } as never);
    inventoryItemFindFirst.mockResolvedValue(null);

    await expect(saveBranchResourceShare({
      ...baseInput,
      resourceId: "11111111-1111-4111-8111-111111111111",
    })).rejects.toBeInstanceOf(AppError);

    expect(inventoryItemFindFirst).toHaveBeenCalledWith({
      where: {
        id: "11111111-1111-4111-8111-111111111111",
        businessId: "business-a",
        ownerBranchId: "owner-branch",
      },
      select: { id: true },
    });
    expect(shareCreate).not.toHaveBeenCalled();
  });

  it("allows an individual payroll compensation share only for a record owned by the selected branch", async () => {
    actorFindFirst.mockResolvedValue({ securityRole: "BUSINESS_OWNER" } as never);
    employeeCompensationFindFirst.mockResolvedValue({ id: "compensation-1" } as never);

    await saveBranchResourceShare({
      ...baseInput,
      resourceType: "PAYROLL_COMPENSATION",
      resourceId: "11111111-1111-4111-8111-111111111111",
      accessLevel: "READ",
    });

    expect(employeeCompensationFindFirst).toHaveBeenCalledWith({
      where: {
        id: "11111111-1111-4111-8111-111111111111",
        businessId: "business-a",
        branchId: "owner-branch",
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


  it("moves only the receiving branch's existing customer transactions into its separate account", async () => {
    actorFindFirst.mockResolvedValue({ securityRole: "BUSINESS_OWNER" } as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([{ id: "customer-1" }] as never);
    vi.mocked(prisma.customerAccount.findFirst)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ id: "shared-account" } as never);
    vi.mocked(prisma.customerAccountTransaction.findMany).mockResolvedValue([{ id: "target-tx" }] as never);
    vi.mocked(prisma.customerAccount.create).mockResolvedValue({ id: "target-account" } as never);

    await saveBranchResourceShare({
      ...baseInput,
      resourceType: "CUSTOMERS",
      customerAccountMode: "SEPARATE",
    });

    expect(prisma.customerAccountTransaction.updateMany).toHaveBeenCalledWith({
      where: { customerAccountId: "shared-account", branchId: "target-branch" },
      data: { customerAccountId: "target-account" },
    });
    expect(prisma.customerAccount.create).toHaveBeenCalledWith({
      data: { businessId: "business-a", customerId: "customer-1", branchId: "target-branch" },
      select: { id: true },
    });
  });

  it("merges a branch account back into the shared ledger when the mode changes to SHARED", async () => {
    actorFindFirst.mockResolvedValue({ securityRole: "BUSINESS_OWNER" } as never);
    shareFindFirst.mockResolvedValue({ id: "share-1", customerAccountMode: "SEPARATE" } as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([{ id: "customer-1" }] as never);
    vi.mocked(prisma.customerAccount.findFirst)
      .mockResolvedValueOnce({ id: "target-account" } as never)
      .mockResolvedValueOnce({ id: "shared-account" } as never);
    vi.mocked(prisma.branchResourceShare.update).mockResolvedValue({ id: "share-1", customerAccountMode: "SHARED" } as never);

    await saveBranchResourceShare({
      ...baseInput,
      resourceType: "CUSTOMERS",
      customerAccountMode: "SHARED",
    });

    expect(prisma.customerAccountTransaction.updateMany).toHaveBeenCalledWith({
      where: { customerAccountId: "target-account" },
      data: { customerAccountId: "shared-account" },
    });
    expect(prisma.customerAccount.delete).toHaveBeenCalledWith({ where: { id: "target-account" } });
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
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "branch.resource_share.deleted",
      entityType: "BranchResourceShare",
      entityId: "share-1",
      businessId: "business-a",
      branchId: "owner-branch",
    }));
  });
});
