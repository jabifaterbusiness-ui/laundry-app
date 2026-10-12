import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, recordAuditEventMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    iOU: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
  recordAuditEventMock: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

import {
  approveIOU,
  cancelIOU,
  createIOU,
  getIOU,
  listIOUs,
  rejectIOU,
} from "../../src/modules/payroll/ious.service.js";

const IOU_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ious.service", () => {
  describe("createIOU", () => {
    it("creates a pending IOU for an employee in the same business and branch", async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        id: "employee-A",
        fullName: "Employee A",
        role: "Accountant",
      });

      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
      });

      const iou = {
        id: IOU_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        amount: 5000,
        outstandingAmount: 5000,
        reason: "Emergency assistance",
        status: "PENDING",
      };

      prismaMock.iOU.create.mockResolvedValue(iou);

      const result = await createIOU({
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        amount: 5000,
        reason: "Emergency assistance",
      });

      expect(result).toBe(iou);

      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: "employee-A",
          businessId: "biz-A",
          isActive: true,
        },
        select: {
          id: true,
          fullName: true,
          role: true,
        },
      });

      expect(prismaMock.branch.findFirst).toHaveBeenCalledWith({
        where: {
          id: "branch-A",
          businessId: "biz-A",
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      expect(prismaMock.iOU.create).toHaveBeenCalledWith({
        data: {
          businessId: "biz-A",
          branchId: "branch-A",
          employeeId: "employee-A",
          amount: 5000,
          outstandingAmount: 5000,
          reason: "Emergency assistance",
          status: "PENDING",
        },
      });
    });

    it("rejects an employee outside the authenticated business", async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(
        createIOU({
          businessId: "biz-A",
          branchId: "branch-A",
          employeeId: "employee-from-biz-B",
          amount: 5000,
        }),
      ).rejects.toMatchObject({
        message: "Employee not found in this business",
        statusCode: 404,
      });

      expect(prismaMock.iOU.create).not.toHaveBeenCalled();
      expect(prismaMock.branch.findFirst).not.toHaveBeenCalled();
    });

    it("rejects a branch outside the authenticated business", async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        id: "employee-A",
        fullName: "Employee A",
        role: "STAFF",
      });

      prismaMock.branch.findFirst.mockResolvedValue(null);

      await expect(
        createIOU({
          businessId: "biz-A",
          branchId: "branch-from-biz-B",
          employeeId: "employee-A",
          amount: 5000,
        }),
      ).rejects.toMatchObject({
        message: "Branch not found in this business",
        statusCode: 404,
      });

      expect(prismaMock.iOU.create).not.toHaveBeenCalled();
    });
  });

  describe("approveIOU", () => {
    it("changes a pending IOU to approved and records an audit event", async () => {
      const iou = {
        id: IOU_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        amount: 5000,
        outstandingAmount: 5000,
        status: "PENDING",
      };

      const approved = {
        ...iou,
        status: "APPROVED",
        approvedById: "manager-A",
      };

      prismaMock.iOU.findFirst.mockResolvedValue(iou);
      prismaMock.iOU.update.mockResolvedValue(approved);

      const result = await approveIOU({
        businessId: "biz-A",
        branchId: "branch-A",
        id: IOU_A,
        actorUserId: "manager-A",
      });

      expect(result).toBe(approved);

      expect(prismaMock.iOU.findFirst).toHaveBeenCalledWith({
        where: {
          id: IOU_A,
          businessId: "biz-A",
          branchId: "branch-A",
        },
      });

      expect(prismaMock.iOU.update).toHaveBeenCalledWith({
        where: { id: IOU_A },
        data: {
          status: "APPROVED",
          approvedAt: expect.any(Date),
          approvedById: "manager-A",
        },
      });

      expect(recordAuditEventMock).toHaveBeenCalledWith({
        businessId: "biz-A",
        branchId: "branch-A",
        actorUserId: "manager-A",
        action: "iou.approved",
        entityType: "IOU",
        entityId: IOU_A,
        metadata: {
          employeeId: "employee-A",
          amount: 5000,
        },
      });
    });

    it("rejects an already approved IOU", async () => {
      prismaMock.iOU.findFirst.mockResolvedValue({
        id: IOU_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        amount: 5000,
        outstandingAmount: 5000,
        status: "APPROVED",
      });

      await expect(
        approveIOU({
          businessId: "biz-A",
          branchId: "branch-A",
          id: IOU_A,
          actorUserId: "manager-A",
        }),
      ).rejects.toMatchObject({
        message: "Only pending IOUs can be approved",
        statusCode: 400,
      });

      expect(prismaMock.iOU.update).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("cannot approve an IOU outside the authenticated business and branch", async () => {
      prismaMock.iOU.findFirst.mockResolvedValue(null);

      await expect(
        approveIOU({
          businessId: "biz-B",
          branchId: "branch-B",
          id: IOU_A,
          actorUserId: "manager-B",
        }),
      ).rejects.toMatchObject({
        message: "IOU not found",
        statusCode: 404,
      });

      expect(prismaMock.iOU.findFirst).toHaveBeenCalledWith({
        where: {
          id: IOU_A,
          businessId: "biz-B",
          branchId: "branch-B",
        },
      });

      expect(prismaMock.iOU.update).not.toHaveBeenCalled();
    });
  });

  describe("rejectIOU", () => {
    it("changes a pending IOU to rejected and records the rejection reason in the audit event", async () => {
      const iou = {
        id: IOU_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        amount: 5000,
        outstandingAmount: 5000,
        status: "PENDING",
      };

      const rejected = {
        ...iou,
        status: "REJECTED",
      };

      prismaMock.iOU.findFirst.mockResolvedValue(iou);
      prismaMock.iOU.update.mockResolvedValue(rejected);

      const result = await rejectIOU({
        businessId: "biz-A",
        branchId: "branch-A",
        id: IOU_A,
        actorUserId: "owner-A",
        reason: "Insufficient supporting information",
      });

      expect(result).toBe(rejected);

      expect(prismaMock.iOU.update).toHaveBeenCalledWith({
        where: { id: IOU_A },
        data: {
          status: "REJECTED",
        },
      });

      expect(recordAuditEventMock).toHaveBeenCalledWith({
        businessId: "biz-A",
        branchId: "branch-A",
        actorUserId: "owner-A",
        action: "iou.rejected",
        entityType: "IOU",
        entityId: IOU_A,
        metadata: {
          employeeId: "employee-A",
          amount: 5000,
          reason: "Insufficient supporting information",
        },
      });
    });

    it("rejects an already approved IOU", async () => {
      prismaMock.iOU.findFirst.mockResolvedValue({
        id: IOU_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        amount: 5000,
        outstandingAmount: 5000,
        status: "APPROVED",
      });

      await expect(
        rejectIOU({
          businessId: "biz-A",
          branchId: "branch-A",
          id: IOU_A,
          actorUserId: "owner-A",
        }),
      ).rejects.toMatchObject({
        message: "Only pending IOUs can be rejected",
        statusCode: 400,
      });

      expect(prismaMock.iOU.update).not.toHaveBeenCalled();
    });
  });

  describe("cancelIOU", () => {
    it("cancels an approved IOU and records an audit event", async () => {
      const iou = {
        id: IOU_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        amount: 5000,
        outstandingAmount: 5000,
        status: "APPROVED",
      };

      const cancelled = {
        ...iou,
        status: "CANCELLED",
      };

      prismaMock.iOU.findFirst.mockResolvedValue(iou);
      prismaMock.iOU.update.mockResolvedValue(cancelled);

      const result = await cancelIOU({
        businessId: "biz-A",
        branchId: "branch-A",
        id: IOU_A,
        actorUserId: "owner-A",
      });

      expect(result).toBe(cancelled);

      expect(prismaMock.iOU.update).toHaveBeenCalledWith({
        where: { id: IOU_A },
        data: {
          status: "CANCELLED",
        },
      });

      expect(recordAuditEventMock).toHaveBeenCalledWith({
        businessId: "biz-A",
        branchId: "branch-A",
        actorUserId: "owner-A",
        action: "iou.cancelled",
        entityType: "IOU",
        entityId: IOU_A,
        metadata: {
          employeeId: "employee-A",
          amount: 5000,
          reason: null,
        },
      });
    });

    it("rejects cancellation after deductions have started", async () => {
      prismaMock.iOU.findFirst.mockResolvedValue({
        id: IOU_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        amount: 5000,
        outstandingAmount: 2500,
        status: "PARTIALLY_DEDUCTED",
      });

      await expect(
        cancelIOU({
          businessId: "biz-A",
          branchId: "branch-A",
          id: IOU_A,
          actorUserId: "owner-A",
        }),
      ).rejects.toMatchObject({
        message: "Only pending or approved IOUs can be cancelled",
        statusCode: 400,
      });

      expect(prismaMock.iOU.update).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });
  });

  describe("getIOU", () => {
    it("uses business and branch scope", async () => {
      const iou = { id: IOU_A };

      prismaMock.iOU.findFirst.mockResolvedValue(iou);

      const result = await getIOU({
        businessId: "biz-A",
        branchId: "branch-A",
        id: IOU_A,
      });

      expect(result).toBe(iou);

      expect(prismaMock.iOU.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: IOU_A,
            businessId: "biz-A",
            branchId: "branch-A",
          },
        }),
      );
    });
  });

  describe("listIOUs", () => {
    it("lists only IOUs from the authenticated business and branch", async () => {
      const ious = [{ id: IOU_A }];

      prismaMock.iOU.findMany.mockResolvedValue(ious);

      const result = await listIOUs({
        businessId: "biz-A",
        branchId: "branch-A",
      });

      expect(result).toBe(ious);

      expect(prismaMock.iOU.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            businessId: "biz-A",
            branchId: "branch-A",
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
      );
    });
  });
});
