import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, recordAuditEventMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    loan: {
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
  approveLoan,
  cancelLoan,
  createLoan,
  getLoan,
  listLoans,
  rejectLoan,
} from "../../src/modules/payroll/loans.service.js";

const LOAN_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loans.service", () => {
  describe("createLoan", () => {
    it("creates a pending loan with the full principal as outstanding", async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        id: "employee-A",
        fullName: "Employee A",
        role: "Laundry Supervisor",
      });

      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
      });

      const loan = {
        id: LOAN_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        principalAmount: 100000,
        outstandingAmount: 100000,
        reason: "Business equipment",
        status: "PENDING",
      };

      prismaMock.loan.create.mockResolvedValue(loan);

      const result = await createLoan({
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        principalAmount: 100000,
        reason: "Business equipment",
      });

      expect(result).toBe(loan);

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

      expect(prismaMock.loan.create).toHaveBeenCalledWith({
        data: {
          businessId: "biz-A",
          branchId: "branch-A",
          employeeId: "employee-A",
          principalAmount: 100000,
          outstandingAmount: 100000,
          reason: "Business equipment",
          status: "PENDING",
        },
      });
    });

    it("rejects an employee outside the authenticated business", async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(
        createLoan({
          businessId: "biz-A",
          branchId: "branch-A",
          employeeId: "employee-from-biz-B",
          principalAmount: 100000,
        }),
      ).rejects.toMatchObject({
        message: "Employee not found in this business",
        statusCode: 404,
      });

      expect(prismaMock.loan.create).not.toHaveBeenCalled();
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
        createLoan({
          businessId: "biz-A",
          branchId: "branch-from-biz-B",
          employeeId: "employee-A",
          principalAmount: 100000,
        }),
      ).rejects.toMatchObject({
        message: "Branch not found in this business",
        statusCode: 404,
      });

      expect(prismaMock.loan.create).not.toHaveBeenCalled();
    });
  });

  describe("approveLoan", () => {
    it("changes a pending loan to approved and records an audit event", async () => {
      const loan = {
        id: LOAN_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        principalAmount: 100000,
        outstandingAmount: 100000,
        status: "PENDING",
      };

      const approved = {
        ...loan,
        status: "APPROVED",
        approvedById: "manager-A",
      };

      prismaMock.loan.findFirst.mockResolvedValue(loan);
      prismaMock.loan.update.mockResolvedValue(approved);

      const result = await approveLoan({
        businessId: "biz-A",
        branchId: "branch-A",
        id: LOAN_A,
        actorUserId: "manager-A",
      });

      expect(result).toBe(approved);

      expect(prismaMock.loan.findFirst).toHaveBeenCalledWith({
        where: {
          id: LOAN_A,
          businessId: "biz-A",
          branchId: "branch-A",
        },
      });

      expect(prismaMock.loan.update).toHaveBeenCalledWith({
        where: { id: LOAN_A },
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
        action: "loan.approved",
        entityType: "LOAN",
        entityId: LOAN_A,
        metadata: {
          employeeId: "employee-A",
          principalAmount: 100000,
        },
      });
    });

    it("rejects an already approved loan", async () => {
      prismaMock.loan.findFirst.mockResolvedValue({
        id: LOAN_A,
        businessId: "biz-A",
        branchId: "branch-A",
        status: "APPROVED",
      });

      await expect(
        approveLoan({
          businessId: "biz-A",
          branchId: "branch-A",
          id: LOAN_A,
          actorUserId: "manager-A",
        }),
      ).rejects.toMatchObject({
        message: "Only pending loans can be approved",
        statusCode: 400,
      });

      expect(prismaMock.loan.update).not.toHaveBeenCalled();
    });

    it("enforces business and branch scope", async () => {
      prismaMock.loan.findFirst.mockResolvedValue(null);

      await expect(
        approveLoan({
          businessId: "biz-A",
          branchId: "branch-A",
          id: LOAN_A,
          actorUserId: "manager-A",
        }),
      ).rejects.toMatchObject({
        message: "Loan not found",
        statusCode: 404,
      });

      expect(prismaMock.loan.findFirst).toHaveBeenCalledWith({
        where: {
          id: LOAN_A,
          businessId: "biz-A",
          branchId: "branch-A",
        },
      });
    });
  });

  describe("rejectLoan", () => {
    it("rejects a pending loan and records the reason in the audit event", async () => {
      const loan = {
        id: LOAN_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        principalAmount: 100000,
        status: "PENDING",
      };

      const rejected = {
        ...loan,
        status: "REJECTED",
      };

      prismaMock.loan.findFirst.mockResolvedValue(loan);
      prismaMock.loan.update.mockResolvedValue(rejected);

      const result = await rejectLoan({
        businessId: "biz-A",
        branchId: "branch-A",
        id: LOAN_A,
        actorUserId: "owner-A",
        reason: "Insufficient repayment capacity",
      });

      expect(result).toBe(rejected);

      expect(prismaMock.loan.update).toHaveBeenCalledWith({
        where: { id: LOAN_A },
        data: {
          status: "REJECTED",
        },
      });

      expect(recordAuditEventMock).toHaveBeenCalledWith({
        businessId: "biz-A",
        branchId: "branch-A",
        actorUserId: "owner-A",
        action: "loan.rejected",
        entityType: "LOAN",
        entityId: LOAN_A,
        metadata: {
          employeeId: "employee-A",
          principalAmount: 100000,
          reason: "Insufficient repayment capacity",
        },
      });
    });

    it("rejects an already approved loan", async () => {
      prismaMock.loan.findFirst.mockResolvedValue({
        id: LOAN_A,
        businessId: "biz-A",
        branchId: "branch-A",
        status: "APPROVED",
      });

      await expect(
        rejectLoan({
          businessId: "biz-A",
          branchId: "branch-A",
          id: LOAN_A,
          actorUserId: "owner-A",
        }),
      ).rejects.toMatchObject({
        message: "Only pending loans can be rejected",
        statusCode: 400,
      });

      expect(prismaMock.loan.update).not.toHaveBeenCalled();
    });
  });

  describe("cancelLoan", () => {
    it("cancels an approved loan and records an audit event", async () => {
      const loan = {
        id: LOAN_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        principalAmount: 100000,
        status: "APPROVED",
      };

      const cancelled = {
        ...loan,
        status: "CANCELLED",
      };

      prismaMock.loan.findFirst.mockResolvedValue(loan);
      prismaMock.loan.update.mockResolvedValue(cancelled);

      const result = await cancelLoan({
        businessId: "biz-A",
        branchId: "branch-A",
        id: LOAN_A,
        actorUserId: "owner-A",
      });

      expect(result).toBe(cancelled);

      expect(prismaMock.loan.update).toHaveBeenCalledWith({
        where: { id: LOAN_A },
        data: {
          status: "CANCELLED",
        },
      });

      expect(recordAuditEventMock).toHaveBeenCalledWith({
        businessId: "biz-A",
        branchId: "branch-A",
        actorUserId: "owner-A",
        action: "loan.cancelled",
        entityType: "LOAN",
        entityId: LOAN_A,
        metadata: {
          employeeId: "employee-A",
          principalAmount: 100000,
        },
      });
    });

    it("rejects cancelling a partially repaid loan", async () => {
      prismaMock.loan.findFirst.mockResolvedValue({
        id: LOAN_A,
        businessId: "biz-A",
        branchId: "branch-A",
        status: "PARTIALLY_REPAID",
      });

      await expect(
        cancelLoan({
          businessId: "biz-A",
          branchId: "branch-A",
          id: LOAN_A,
          actorUserId: "owner-A",
        }),
      ).rejects.toMatchObject({
        message: "Only pending or approved loans can be cancelled",
        statusCode: 400,
      });

      expect(prismaMock.loan.update).not.toHaveBeenCalled();
    });
  });

  describe("getLoan", () => {
    it("loads a loan only within the authenticated business and branch", async () => {
      const loan = {
        id: LOAN_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
      };

      prismaMock.loan.findFirst.mockResolvedValue(loan);

      const result = await getLoan({
        businessId: "biz-A",
        branchId: "branch-A",
        id: LOAN_A,
      });

      expect(result).toBe(loan);

      expect(prismaMock.loan.findFirst).toHaveBeenCalledWith({
        where: {
          id: LOAN_A,
          businessId: "biz-A",
          branchId: "branch-A",
        },
        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });
    });
  });

  describe("listLoans", () => {
    it("lists loans only within the authenticated business and branch", async () => {
      const loans = [
        {
          id: LOAN_A,
          businessId: "biz-A",
          branchId: "branch-A",
        },
      ];

      prismaMock.loan.findMany.mockResolvedValue(loans);

      const result = await listLoans({
        businessId: "biz-A",
        branchId: "branch-A",
      });

      expect(result).toBe(loans);

      expect(prismaMock.loan.findMany).toHaveBeenCalledWith({
        where: {
          businessId: "biz-A",
          branchId: "branch-A",
        },
        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    });
  });
});
