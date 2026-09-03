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
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    loan: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    financialRepayment: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
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
  createRepayment,
  getRepayment,
  listRepayments,
  voidRepayment,
} from "../../src/modules/payroll/repayments.service.js";

const REPAYMENT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const IOU_A = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const LOAN_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function useTransactionMock() {
  prismaMock.$transaction.mockImplementation(
    async (callback: (tx: typeof prismaMock) => Promise<unknown>) =>
      callback(prismaMock),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useTransactionMock();
});

describe("repayments.service", () => {
  describe("createRepayment", () => {
    it("posts an IOU repayment, reduces outstanding balance, and preserves the repayment row", async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        id: "employee-A",
        fullName: "Employee A",
      });

      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
      });

      prismaMock.iOU.findFirst.mockResolvedValue({
        id: IOU_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        amount: 10000,
        outstandingAmount: 10000,
        status: "APPROVED",
      });

      const repayment = {
        id: REPAYMENT_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        type: "IOU",
        iouId: IOU_A,
        loanId: null,
        amount: 4000,
        method: "CASH",
        status: "POSTED",
      };

      prismaMock.financialRepayment.create.mockResolvedValue(repayment);
      prismaMock.iOU.update.mockResolvedValue({
        id: IOU_A,
        outstandingAmount: 6000,
        status: "PARTIALLY_DEDUCTED",
      });

      const result = await createRepayment({
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        type: "IOU",
        iouId: IOU_A,
        amount: 4000,
        method: "CASH",
        actorUserId: "manager-A",
      });

      expect(result).toBe(repayment);

      expect(prismaMock.iOU.findFirst).toHaveBeenCalledWith({
        where: {
          id: IOU_A,
          businessId: "biz-A",
          branchId: "branch-A",
          employeeId: "employee-A",
        },
      });

      expect(prismaMock.financialRepayment.create).toHaveBeenCalledWith({
        data: {
          businessId: "biz-A",
          branchId: "branch-A",
          employeeId: "employee-A",
          type: "IOU",
          iouId: IOU_A,
          amount: 4000,
          method: "CASH",
          reference: null,
          note: null,
          status: "POSTED",
          createdById: "manager-A",
        },
      });

      expect(prismaMock.iOU.update).toHaveBeenCalledWith({
        where: { id: IOU_A },
        data: {
          outstandingAmount: 6000,
          status: "PARTIALLY_DEDUCTED",
        },
      });

      expect(recordAuditEventMock).toHaveBeenCalledWith({
        businessId: "biz-A",
        branchId: "branch-A",
        actorUserId: "manager-A",
        action: "financial_repayment.posted",
        entityType: "FINANCIAL_REPAYMENT",
        entityId: REPAYMENT_A,
        metadata: {
          employeeId: "employee-A",
          type: "IOU",
          iouId: IOU_A,
          loanId: null,
          amount: 4000,
          method: "CASH",
        },
      });
    });

    it("rejects an employee outside the authenticated business", async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(
        createRepayment({
          businessId: "biz-A",
          branchId: "branch-A",
          employeeId: "employee-from-biz-B",
          type: "IOU",
          iouId: IOU_A,
          amount: 4000,
          method: "CASH",
          actorUserId: "manager-A",
        }),
      ).rejects.toMatchObject({
        message: "Employee not found in this business",
        statusCode: 404,
      });

      expect(prismaMock.financialRepayment.create).not.toHaveBeenCalled();
    });

    it("rejects a branch outside the authenticated business", async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        id: "employee-A",
        fullName: "Employee A",
      });

      prismaMock.branch.findFirst.mockResolvedValue(null);

      await expect(
        createRepayment({
          businessId: "biz-A",
          branchId: "branch-from-biz-B",
          employeeId: "employee-A",
          type: "IOU",
          iouId: IOU_A,
          amount: 4000,
          method: "CASH",
          actorUserId: "manager-A",
        }),
      ).rejects.toMatchObject({
        message: "Branch not found in this business",
        statusCode: 404,
      });

      expect(prismaMock.financialRepayment.create).not.toHaveBeenCalled();
    });

    it("enforces business and branch scope on the IOU source", async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        id: "employee-A",
        fullName: "Employee A",
      });

      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
      });

      prismaMock.iOU.findFirst.mockResolvedValue(null);

      await expect(
        createRepayment({
          businessId: "biz-B",
          branchId: "branch-B",
          employeeId: "employee-A",
          type: "IOU",
          iouId: IOU_A,
          amount: 4000,
          method: "CASH",
          actorUserId: "manager-B",
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(prismaMock.iOU.findFirst).toHaveBeenCalledWith({
        where: {
          id: IOU_A,
          businessId: "biz-B",
          branchId: "branch-B",
          employeeId: "employee-A",
        },
      });

      expect(prismaMock.financialRepayment.create).not.toHaveBeenCalled();
    });

    it("rejects a repayment greater than the IOU outstanding balance", async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        id: "employee-A",
        fullName: "Employee A",
      });

      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
      });

      prismaMock.iOU.findFirst.mockResolvedValue({
        id: IOU_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        amount: 10000,
        outstandingAmount: 3000,
        status: "PARTIALLY_DEDUCTED",
      });

      await expect(
        createRepayment({
          businessId: "biz-A",
          branchId: "branch-A",
          employeeId: "employee-A",
          type: "IOU",
          iouId: IOU_A,
          amount: 4000,
          method: "CASH",
          actorUserId: "manager-A",
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(prismaMock.financialRepayment.create).not.toHaveBeenCalled();
    });

    it("marks an IOU fully deducted when repayment clears the outstanding balance", async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        id: "employee-A",
        fullName: "Employee A",
      });

      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
      });

      prismaMock.iOU.findFirst.mockResolvedValue({
        id: IOU_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        amount: 10000,
        outstandingAmount: 4000,
        status: "PARTIALLY_DEDUCTED",
      });

      prismaMock.financialRepayment.create.mockResolvedValue({
        id: REPAYMENT_A,
      });

      await createRepayment({
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        type: "IOU",
        iouId: IOU_A,
        amount: 4000,
        method: "TRANSFER",
        actorUserId: "manager-A",
      });

      expect(prismaMock.iOU.update).toHaveBeenCalledWith({
        where: { id: IOU_A },
        data: {
          outstandingAmount: 0,
          status: "FULLY_DEDUCTED",
        },
      });
    });

    it("posts a loan repayment and reduces the loan outstanding balance", async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        id: "employee-A",
        fullName: "Employee A",
      });

      prismaMock.branch.findFirst.mockResolvedValue({
        id: "branch-A",
      });

      prismaMock.loan.findFirst.mockResolvedValue({
        id: LOAN_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        principalAmount: 100000,
        outstandingAmount: 100000,
        status: "ACTIVE",
      });

      prismaMock.financialRepayment.create.mockResolvedValue({
        id: REPAYMENT_A,
        type: "LOAN",
        loanId: LOAN_A,
        amount: 25000,
        status: "POSTED",
      });

      await createRepayment({
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        type: "LOAN",
        loanId: LOAN_A,
        amount: 25000,
        method: "TRANSFER",
        actorUserId: "manager-A",
      });

      expect(prismaMock.loan.update).toHaveBeenCalledWith({
        where: { id: LOAN_A },
        data: {
          outstandingAmount: 75000,
          status: "PARTIALLY_REPAID",
        },
      });
    });
  });

  describe("getRepayment", () => {
    it("enforces business and branch scope", async () => {
      prismaMock.financialRepayment.findFirst.mockResolvedValue(null);

      await expect(
        getRepayment({
          businessId: "biz-B",
          branchId: "branch-B",
          id: REPAYMENT_A,
        }),
      ).rejects.toMatchObject({
        message: "Repayment not found",
        statusCode: 404,
      });

      expect(prismaMock.financialRepayment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: REPAYMENT_A,
            businessId: "biz-B",
            branchId: "branch-B",
          },
        }),
      );
    });
  });

  describe("listRepayments", () => {
    it("lists repayments within the authenticated business and branch", async () => {
      const repayments = [
        {
          id: REPAYMENT_A,
          businessId: "biz-A",
          branchId: "branch-A",
          employeeId: "employee-A",
          type: "IOU",
          amount: 4000,
          status: "POSTED",
        },
      ];

      prismaMock.financialRepayment.findMany.mockResolvedValue(repayments);

      const result = await listRepayments({
        businessId: "biz-A",
        branchId: "branch-A",
      });

      expect(result).toBe(repayments);

      expect(prismaMock.financialRepayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            businessId: "biz-A",
            branchId: "branch-A",
          },
        }),
      );
    });
  });

  describe("voidRepayment", () => {
    it("voids a POSTED IOU repayment, restores the outstanding balance, and preserves the historical row", async () => {
      const repayment = {
        id: REPAYMENT_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        type: "IOU",
        iouId: IOU_A,
        loanId: null,
        amount: 4000,
        status: "POSTED",
      };

      prismaMock.financialRepayment.findFirst.mockResolvedValue(repayment);

      prismaMock.iOU.findFirst.mockResolvedValue({
        id: IOU_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        amount: 10000,
        outstandingAmount: 6000,
        status: "PARTIALLY_DEDUCTED",
      });

      const voided = {
        ...repayment,
        status: "VOID",
      };

      prismaMock.iOU.update.mockResolvedValue({
        id: IOU_A,
        outstandingAmount: 10000,
        status: "APPROVED",
      });

      prismaMock.financialRepayment.update.mockResolvedValue(voided);

      const result = await voidRepayment({
        businessId: "biz-A",
        branchId: "branch-A",
        id: REPAYMENT_A,
        actorUserId: "owner-A",
      });

      expect(result).toBe(voided);

      expect(prismaMock.financialRepayment.update).toHaveBeenCalledWith({
        where: { id: REPAYMENT_A },
        data: {
          status: "VOID",
        },
      });

      expect(prismaMock.financialRepayment.create).not.toHaveBeenCalled();

      expect(recordAuditEventMock).toHaveBeenCalledWith({
        businessId: "biz-A",
        branchId: "branch-A",
        actorUserId: "owner-A",
        action: "financial_repayment.voided",
        entityType: "FINANCIAL_REPAYMENT",
        entityId: REPAYMENT_A,
        metadata: {
          employeeId: "employee-A",
          type: "IOU",
          iouId: IOU_A,
          loanId: null,
          amount: 4000,
        },
      });
    });

    it("rejects an already VOID repayment", async () => {
      prismaMock.financialRepayment.findFirst.mockResolvedValue({
        id: REPAYMENT_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        type: "IOU",
        iouId: IOU_A,
        amount: 4000,
        status: "VOID",
      });

      await expect(
        voidRepayment({
          businessId: "biz-A",
          branchId: "branch-A",
          id: REPAYMENT_A,
          actorUserId: "owner-A",
        }),
      ).rejects.toMatchObject({
        message: "This repayment has already been voided",
        statusCode: 400,
      });

      expect(prismaMock.financialRepayment.update).not.toHaveBeenCalled();
    });

    it("enforces business and branch scope when voiding", async () => {
      prismaMock.financialRepayment.findFirst.mockResolvedValue(null);

      await expect(
        voidRepayment({
          businessId: "biz-B",
          branchId: "branch-B",
          id: REPAYMENT_A,
          actorUserId: "owner-B",
        }),
      ).rejects.toMatchObject({
        message: "Repayment not found",
        statusCode: 404,
      });

      expect(prismaMock.financialRepayment.findFirst).toHaveBeenCalledWith({
        where: {
          id: REPAYMENT_A,
          businessId: "biz-B",
          branchId: "branch-B",
        },
      });
    });

    it("voids a loan repayment and restores the loan outstanding balance", async () => {
      prismaMock.financialRepayment.findFirst.mockResolvedValue({
        id: REPAYMENT_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        type: "LOAN",
        iouId: null,
        loanId: LOAN_A,
        amount: 25000,
        status: "POSTED",
      });

      prismaMock.loan.findFirst.mockResolvedValue({
        id: LOAN_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: "employee-A",
        principalAmount: 100000,
        outstandingAmount: 75000,
        status: "PARTIALLY_REPAID",
      });

      prismaMock.loan.update.mockResolvedValue({
        id: LOAN_A,
        outstandingAmount: 100000,
        status: "APPROVED",
      });

      prismaMock.financialRepayment.update.mockResolvedValue({
        id: REPAYMENT_A,
        status: "VOID",
      });

      await voidRepayment({
        businessId: "biz-A",
        branchId: "branch-A",
        id: REPAYMENT_A,
        actorUserId: "owner-A",
      });

      expect(prismaMock.loan.update).toHaveBeenCalledWith({
        where: { id: LOAN_A },
        data: {
          outstandingAmount: 100000,
          status: "APPROVED",
        },
      });

      expect(prismaMock.financialRepayment.update).toHaveBeenCalledWith({
        where: { id: REPAYMENT_A },
        data: {
          status: "VOID",
        },
      });
    });
  });
});
