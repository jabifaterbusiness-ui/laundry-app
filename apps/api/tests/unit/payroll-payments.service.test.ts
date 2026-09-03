import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    payrollRecord: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    payrollPayment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    payrollPeriod: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  auditMock: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: auditMock,
}));

import {
  createPayrollPayment,
  getPayrollPayment,
  listPayrollPayments,
  voidPayrollPayment,
} from "../../src/modules/payroll/payroll-payments.service.js";

const RECORD_A = "55555555-5555-5555-5555-555555555555";
const EMPLOYEE_A = "66666666-6666-6666-6666-666666666666";
const PAYMENT_A = "77777777-7777-7777-7777-777777777777";
const PERIOD_A = "88888888-8888-8888-8888-888888888888";

function mockTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction();
});

describe("payroll-payments.service", () => {
  describe("createPayrollPayment", () => {
    it("creates a payment against a finalized payroll record", async () => {
      prismaMock.payrollRecord.findFirst.mockResolvedValue({
        id: RECORD_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: EMPLOYEE_A,
        netPay: 100000,
        payrollPeriod: {
          id: PERIOD_A,
          status: "FINALIZED",
        },
        payments: [{ amount: 30000 }],
      });

      prismaMock.payrollPayment.create.mockResolvedValue({
        id: PAYMENT_A,
        businessId: "biz-A",
        branchId: "branch-A",
        payrollRecordId: RECORD_A,
        employeeId: EMPLOYEE_A,
        amount: 40000,
        method: "TRANSFER",
        status: "POSTED",
      });

      prismaMock.payrollPeriod.findFirst.mockResolvedValue({
        id: PERIOD_A,
        status: "FINALIZED",
      });

      prismaMock.payrollRecord.findMany.mockResolvedValue([
        {
          id: RECORD_A,
          netPay: 100000,
          payments: [
            { amount: 30000 },
            { amount: 40000 },
          ],
        },
      ]);

      prismaMock.payrollPeriod.updateMany.mockResolvedValue({
        count: 0,
      });

      const result = await createPayrollPayment({
        businessId: "biz-A",
        branchId: "branch-A",
        payrollRecordId: RECORD_A,
        employeeId: EMPLOYEE_A,
        amount: 40000,
        method: "TRANSFER",
        reference: "SAL-001",
        note: "September salary",
        actorUserId: "user-owner-a",
      });

      expect(result.amountPaid).toBe(70000);
      expect(result.balance).toBe(30000);
      expect(result.payrollPeriodStatus).toBe("FINALIZED");

      expect(prismaMock.payrollPayment.create).toHaveBeenCalledWith({
        data: {
          businessId: "biz-A",
          branchId: "branch-A",
          payrollRecordId: RECORD_A,
          employeeId: EMPLOYEE_A,
          amount: 40000,
          method: "TRANSFER",
          reference: "SAL-001",
          note: "September salary",
        },
      });

      expect(auditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "payroll_payment.created",
          entityType: "PAYROLL_PAYMENT",
          entityId: PAYMENT_A,
        }),
      );
    });

    it("automatically marks the period PAID when the payment fully settles the final record", async () => {
      prismaMock.payrollRecord.findFirst.mockResolvedValue({
        id: RECORD_A,
        businessId: "biz-A",
        branchId: "branch-A",
        employeeId: EMPLOYEE_A,
        netPay: 100000,
        payrollPeriod: {
          id: PERIOD_A,
          status: "FINALIZED",
        },
        payments: [{ amount: 70000 }],
      });

      prismaMock.payrollPayment.create.mockResolvedValue({
        id: PAYMENT_A,
        payrollRecordId: RECORD_A,
        employeeId: EMPLOYEE_A,
        amount: 30000,
        status: "POSTED",
      });

      prismaMock.payrollPeriod.findFirst.mockResolvedValue({
        id: PERIOD_A,
        status: "FINALIZED",
      });

      prismaMock.payrollRecord.findMany.mockResolvedValue([
        {
          id: RECORD_A,
          netPay: 100000,
          payments: [
            { amount: 70000 },
            { amount: 30000 },
          ],
        },
      ]);

      prismaMock.payrollPeriod.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await createPayrollPayment({
        businessId: "biz-A",
        branchId: "branch-A",
        payrollRecordId: RECORD_A,
        employeeId: EMPLOYEE_A,
        amount: 30000,
        method: "CASH",
        actorUserId: "user-owner-a",
      });

      expect(result.balance).toBe(0);
      expect(result.payrollPeriodStatus).toBe("PAID");

      expect(prismaMock.payrollPeriod.updateMany).toHaveBeenCalledWith({
        where: {
          id: PERIOD_A,
          businessId: "biz-A",
          branchId: "branch-A",
          status: "FINALIZED",
        },
        data: {
          status: "PAID",
        },
      });
    });

    it("rejects a payroll record outside the authenticated business and branch", async () => {
      prismaMock.payrollRecord.findFirst.mockResolvedValue(null);

      await expect(
        createPayrollPayment({
          businessId: "biz-B",
          branchId: "branch-B",
          payrollRecordId: RECORD_A,
          employeeId: EMPLOYEE_A,
          amount: 10000,
          method: "CASH",
          actorUserId: "user-owner-b",
        }),
      ).rejects.toMatchObject({
        message: "Payroll record not found for this employee and branch",
        statusCode: 404,
      });

      expect(prismaMock.payrollPayment.create).not.toHaveBeenCalled();
    });

    it("rejects a payroll record whose employee does not match", async () => {
      prismaMock.payrollRecord.findFirst.mockResolvedValue(null);

      await expect(
        createPayrollPayment({
          businessId: "biz-A",
          branchId: "branch-A",
          payrollRecordId: RECORD_A,
          employeeId: "99999999-9999-9999-9999-999999999999",
          amount: 10000,
          method: "CASH",
          actorUserId: "user-owner-a",
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(prismaMock.payrollPayment.create).not.toHaveBeenCalled();
    });

    it("rejects payment before payroll is finalized", async () => {
      prismaMock.payrollRecord.findFirst.mockResolvedValue({
        id: RECORD_A,
        employeeId: EMPLOYEE_A,
        netPay: 100000,
        payrollPeriod: {
          id: PERIOD_A,
          status: "PROCESSING",
        },
        payments: [],
      });

      await expect(
        createPayrollPayment({
          businessId: "biz-A",
          branchId: "branch-A",
          payrollRecordId: RECORD_A,
          employeeId: EMPLOYEE_A,
          amount: 10000,
          method: "CASH",
          actorUserId: "user-owner-a",
        }),
      ).rejects.toMatchObject({
        message:
          "Payroll payments can only be recorded for a finalized payroll period",
        statusCode: 400,
      });

      expect(prismaMock.payrollPayment.create).not.toHaveBeenCalled();
    });

    it("rejects payment greater than the outstanding balance", async () => {
      prismaMock.payrollRecord.findFirst.mockResolvedValue({
        id: RECORD_A,
        employeeId: EMPLOYEE_A,
        netPay: 100000,
        payrollPeriod: {
          id: PERIOD_A,
          status: "FINALIZED",
        },
        payments: [{ amount: 70000 }],
      });

      await expect(
        createPayrollPayment({
          businessId: "biz-A",
          branchId: "branch-A",
          payrollRecordId: RECORD_A,
          employeeId: EMPLOYEE_A,
          amount: 30001,
          method: "POS",
          actorUserId: "user-owner-a",
        }),
      ).rejects.toMatchObject({
        message:
          "Payroll payment amount cannot exceed the outstanding balance of 30000",
        statusCode: 422,
      });

      expect(prismaMock.payrollPayment.create).not.toHaveBeenCalled();
    });

    it("rejects payment when the payroll record is already fully paid", async () => {
      prismaMock.payrollRecord.findFirst.mockResolvedValue({
        id: RECORD_A,
        employeeId: EMPLOYEE_A,
        netPay: 100000,
        payrollPeriod: {
          id: PERIOD_A,
          status: "FINALIZED",
        },
        payments: [{ amount: 100000 }],
      });

      await expect(
        createPayrollPayment({
          businessId: "biz-A",
          branchId: "branch-A",
          payrollRecordId: RECORD_A,
          employeeId: EMPLOYEE_A,
          amount: 1,
          method: "CASH",
          actorUserId: "user-owner-a",
        }),
      ).rejects.toMatchObject({
        message: "This payroll record has already been fully paid",
        statusCode: 422,
      });
    });

    it("supports multiple partial payments", async () => {
      prismaMock.payrollRecord.findFirst.mockResolvedValue({
        id: RECORD_A,
        employeeId: EMPLOYEE_A,
        netPay: 100000,
        payrollPeriod: {
          id: PERIOD_A,
          status: "FINALIZED",
        },
        payments: [
          { amount: 20000 },
          { amount: 30000 },
        ],
      });

      prismaMock.payrollPayment.create.mockResolvedValue({
        id: PAYMENT_A,
        amount: 25000,
        status: "POSTED",
      });

      prismaMock.payrollPeriod.findFirst.mockResolvedValue({
        id: PERIOD_A,
        status: "FINALIZED",
      });

      prismaMock.payrollRecord.findMany.mockResolvedValue([
        {
          id: RECORD_A,
          netPay: 100000,
          payments: [
            { amount: 20000 },
            { amount: 30000 },
            { amount: 25000 },
          ],
        },
      ]);

      const result = await createPayrollPayment({
        businessId: "biz-A",
        branchId: "branch-A",
        payrollRecordId: RECORD_A,
        employeeId: EMPLOYEE_A,
        amount: 25000,
        method: "TRANSFER",
        actorUserId: "user-owner-a",
      });

      expect(result.amountPaid).toBe(75000);
      expect(result.balance).toBe(25000);
    });

    it("does not count VOID payments toward the outstanding balance", async () => {
      prismaMock.payrollRecord.findFirst.mockResolvedValue({
        id: RECORD_A,
        employeeId: EMPLOYEE_A,
        netPay: 100000,
        payrollPeriod: {
          id: PERIOD_A,
          status: "FINALIZED",
        },
        payments: [
          { amount: 60000 },
        ],
      });

      prismaMock.payrollPayment.create.mockResolvedValue({
        id: PAYMENT_A,
        amount: 10000,
        status: "POSTED",
      });

      prismaMock.payrollPeriod.findFirst.mockResolvedValue({
        id: PERIOD_A,
        status: "FINALIZED",
      });

      prismaMock.payrollRecord.findMany.mockResolvedValue([
        {
          id: RECORD_A,
          netPay: 100000,
          payments: [
            { amount: 60000 },
            { amount: 10000 },
          ],
        },
      ]);

      const result = await createPayrollPayment({
        businessId: "biz-A",
        branchId: "branch-A",
        payrollRecordId: RECORD_A,
        employeeId: EMPLOYEE_A,
        amount: 10000,
        method: "CASH",
        actorUserId: "user-owner-a",
      });

      expect(result.balance).toBe(30000);
    });
  });

  describe("voidPayrollPayment", () => {
    it("voids a posted payment without deleting historical data", async () => {
      const payment = {
        id: PAYMENT_A,
        businessId: "biz-A",
        branchId: "branch-A",
        payrollRecordId: RECORD_A,
        employeeId: EMPLOYEE_A,
        amount: 100000,
        status: "POSTED",
        payrollRecord: {
          id: RECORD_A,
          payrollPeriodId: PERIOD_A,
        },
      };

      prismaMock.payrollPayment.findFirst.mockResolvedValue(payment);
      prismaMock.payrollPayment.update.mockResolvedValue({
        ...payment,
        status: "VOID",
      });

      prismaMock.payrollPeriod.findFirst.mockResolvedValue({
        id: PERIOD_A,
        status: "PAID",
      });

      prismaMock.payrollRecord.findMany.mockResolvedValue([
        {
          id: RECORD_A,
          netPay: 100000,
          payments: [],
        },
      ]);

      prismaMock.payrollPeriod.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await voidPayrollPayment(
        PAYMENT_A,
        "biz-A",
        "branch-A",
        "user-owner-a",
      );

      expect(result.payment.status).toBe("VOID");

      expect(prismaMock.payrollPayment.update).toHaveBeenCalledWith({
        where: {
          id: PAYMENT_A,
        },
        data: {
          status: "VOID",
        },
      });

      expect(prismaMock.payrollPeriod.updateMany).toHaveBeenCalledWith({
        where: {
          id: PERIOD_A,
          businessId: "biz-A",
          branchId: "branch-A",
          status: "PAID",
        },
        data: {
          status: "FINALIZED",
        },
      });
    });

    it("rejects a payment that is already void", async () => {
      prismaMock.payrollPayment.findFirst.mockResolvedValue({
        id: PAYMENT_A,
        status: "VOID",
        payrollRecord: {
          id: RECORD_A,
          payrollPeriodId: PERIOD_A,
        },
      });

      await expect(
        voidPayrollPayment(
          PAYMENT_A,
          "biz-A",
          "branch-A",
          "user-owner-a",
        ),
      ).rejects.toMatchObject({
        message: "Payroll payment is already void",
        statusCode: 422,
      });

      expect(prismaMock.payrollPayment.update).not.toHaveBeenCalled();
    });

    it("rejects a payment outside the authenticated business and branch", async () => {
      prismaMock.payrollPayment.findFirst.mockResolvedValue(null);

      await expect(
        voidPayrollPayment(
          PAYMENT_A,
          "biz-B",
          "branch-B",
          "user-owner-b",
        ),
      ).rejects.toMatchObject({
        message: "Payroll payment not found",
        statusCode: 404,
      });

      expect(prismaMock.payrollPayment.update).not.toHaveBeenCalled();
    });
  });

  describe("getPayrollPayment", () => {
    it("uses business and branch scope", async () => {
      const payment = { id: PAYMENT_A };

      prismaMock.payrollPayment.findFirst.mockResolvedValue(payment);

      const result = await getPayrollPayment(
        PAYMENT_A,
        "biz-A",
        "branch-A",
      );

      expect(result).toBe(payment);

      expect(prismaMock.payrollPayment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: PAYMENT_A,
            businessId: "biz-A",
            branchId: "branch-A",
          },
        }),
      );
    });
  });

  describe("listPayrollPayments", () => {
    it("lists payments only within the authenticated business and branch", async () => {
      const payments = [{ id: PAYMENT_A }];

      prismaMock.payrollPayment.findMany.mockResolvedValue(payments);
      prismaMock.payrollPayment.count.mockResolvedValue(1);

      const result = await listPayrollPayments({
        businessId: "biz-A",
        branchId: "branch-A",
        page: 1,
        pageSize: 25,
      });

      expect(result).toEqual({
        data: payments,
        pagination: {
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1,
        },
      });

      expect(prismaMock.payrollPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            businessId: "biz-A",
            branchId: "branch-A",
          },
          skip: 0,
          take: 25,
        }),
      );
    });
  });
});
