import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPayrollPeriod,
  finalizePayroll,
  generatePayroll,
  getPayrollPeriod,
  listPayrollPeriods,
} from "../../src/modules/payroll/payroll.service.js";

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import { AppError } from "../../src/middleware/error-handler.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    branch: {
      findFirst: vi.fn(),
    },
    payrollPeriod: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    payrollRecord: {
      findMany: vi.fn(),
    },
    employeeCompensation: {
      findFirst: vi.fn(),
    },
    branchResourceShare: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn(),
}));

const mockedPrisma = vi.mocked(prisma);
const mockedRecordAuditEvent = vi.mocked(recordAuditEvent);

type MockFn = ReturnType<typeof vi.fn>;

const branchFindFirst = prisma.branch.findFirst as unknown as MockFn;
const payrollPeriodFindFirst =
  prisma.payrollPeriod.findFirst as unknown as MockFn;
const payrollPeriodFindMany =
  prisma.payrollPeriod.findMany as unknown as MockFn;
const payrollPeriodCreate =
  prisma.payrollPeriod.create as unknown as MockFn;
const payrollPeriodUpdate =
  prisma.payrollPeriod.update as unknown as MockFn;
const userFindMany = prisma.user.findMany as unknown as MockFn;
const payrollRecordFindMany =
  prisma.payrollRecord.findMany as unknown as MockFn;
const employeeCompensationFindFirst =
  prisma.employeeCompensation.findFirst as unknown as MockFn;
const branchResourceShareFindMany =
  prisma.branchResourceShare.findMany as unknown as MockFn;
const transaction = prisma.$transaction as unknown as MockFn;

describe("payroll.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    branchFindFirst.mockReset();
    payrollPeriodFindFirst.mockReset();
    payrollPeriodFindMany.mockReset();
    payrollPeriodCreate.mockReset();
    payrollPeriodUpdate.mockReset();
    (prisma.payrollPeriod.updateMany as unknown as MockFn).mockReset();
    userFindMany.mockReset();
    payrollRecordFindMany.mockReset();
    employeeCompensationFindFirst.mockReset();
    branchResourceShareFindMany.mockReset();
    branchResourceShareFindMany.mockResolvedValue([] as never);
    transaction.mockReset();
  });

  describe("createPayrollPeriod", () => {
    it("creates a payroll period for a valid business and branch", async () => {
      const periodStart = new Date("2026-08-01T00:00:00.000Z");
      const periodEnd = new Date("2026-08-31T23:59:59.999Z");

      branchFindFirst.mockResolvedValue({
        id: "branch-1",
      } as never);

      payrollPeriodFindFirst.mockResolvedValue(null);

      const createdPeriod = {
        id: "period-1",
        businessId: "business-1",
        branchId: "branch-1",
        periodStart,
        periodEnd,
        status: "OPEN",
      };

      payrollPeriodCreate.mockResolvedValue(
        createdPeriod as never,
      );

      const result = await createPayrollPeriod({
        businessId: "business-1",
        branchId: "branch-1",
        periodStart,
        periodEnd,
        actorUserId: "user-1",
      });

      expect(result).toEqual(createdPeriod);

      expect(branchFindFirst).toHaveBeenCalledWith({
        where: {
          id: "branch-1",
          businessId: "business-1",
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      expect(payrollPeriodCreate).toHaveBeenCalledWith({
        data: {
          businessId: "business-1",
          branchId: "branch-1",
          periodStart,
          periodEnd,
          status: "OPEN",
        },
      });

      expect(mockedRecordAuditEvent).toHaveBeenCalledWith({
        businessId: "business-1",
        branchId: "branch-1",
        actorUserId: "user-1",
        action: "payroll_period.created",
        entityType: "PAYROLL_PERIOD",
        entityId: "period-1",
        metadata: {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      });
    });

    it("rejects an invalid payroll period", async () => {
      await expect(
        createPayrollPeriod({
          businessId: "business-1",
          branchId: "branch-1",
          periodStart: new Date("2026-08-31T00:00:00.000Z"),
          periodEnd: new Date("2026-08-01T00:00:00.000Z"),
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Payroll period start must be before payroll period end",
        statusCode: 400,
      });

      expect(branchFindFirst).not.toHaveBeenCalled();
      expect(payrollPeriodCreate).not.toHaveBeenCalled();
    });

    it("rejects a branch that does not belong to the business", async () => {
      branchFindFirst.mockResolvedValue(null);

      await expect(
        createPayrollPeriod({
          businessId: "business-1",
          branchId: "branch-other",
          periodStart: new Date("2026-08-01T00:00:00.000Z"),
          periodEnd: new Date("2026-08-31T23:59:59.999Z"),
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Branch not found in this business",
        statusCode: 404,
      });

      expect(payrollPeriodCreate).not.toHaveBeenCalled();
    });

    it("rejects a duplicate payroll period", async () => {
      branchFindFirst.mockResolvedValue({
        id: "branch-1",
      } as never);

      payrollPeriodFindFirst.mockResolvedValue({
        id: "existing-period",
      } as never);

      await expect(
        createPayrollPeriod({
          businessId: "business-1",
          branchId: "branch-1",
          periodStart: new Date("2026-08-01T00:00:00.000Z"),
          periodEnd: new Date("2026-08-31T23:59:59.999Z"),
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "A payroll period already exists for this branch and date range",
        statusCode: 409,
      });

      expect(payrollPeriodCreate).not.toHaveBeenCalled();
    });
  });

  describe("getPayrollPeriod", () => {
    it("returns a payroll period scoped by business and branch", async () => {
      const period = {
        id: "period-1",
        businessId: "business-1",
        branchId: "branch-1",
        status: "OPEN",
        payrollRecords: [],
      };

      payrollPeriodFindFirst.mockResolvedValue(period as never);

      const result = await getPayrollPeriod({
        businessId: "business-1",
        branchId: "branch-1",
        id: "period-1",
      });

      expect(result).toEqual(period);

      expect(payrollPeriodFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "period-1",
            businessId: "business-1",
            branchId: "branch-1",
          },
        }),
      );
    });

    it("rejects a payroll period outside the business/branch scope", async () => {
      payrollPeriodFindFirst.mockResolvedValue(null);

      await expect(
        getPayrollPeriod({
          businessId: "business-1",
          branchId: "branch-1",
          id: "period-other",
        }),
      ).rejects.toMatchObject({
        message: "Payroll period not found",
        statusCode: 404,
      });
    });
  });

  describe("listPayrollPeriods", () => {
    it("lists only payroll periods for the current business and branch", async () => {
      const periods = [
        {
          id: "period-1",
          businessId: "business-1",
          branchId: "branch-1",
        },
      ];

      payrollPeriodFindMany.mockResolvedValue(periods as never);

      const result = await listPayrollPeriods({
        businessId: "business-1",
        branchId: "branch-1",
      });

      expect(result).toEqual(periods);

      expect(payrollPeriodFindMany).toHaveBeenCalledWith({
        where: {
          businessId: "business-1",
          branchId: "branch-1",
        },
        orderBy: [
          {
            periodStart: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
      });
    });
  });

  describe("finalizePayroll", () => {
    const processingPeriod = {
      id: "period-1",
      businessId: "business-1",
      branchId: "branch-1",
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-31T23:59:59.999Z"),
      status: "PROCESSING",
      approvalStatus: "APPROVED",
    };

    const validRecord = {
      id: "record-1",
      businessId: "business-1",
      branchId: "branch-1",
      payrollPeriodId: "period-1",
      employeeId: "employee-1",
      basicSalary: 150000,
      allowances: 10000,
      bonuses: 5000,
      grossPay: 165000,
      totalDeductions: 15000,
      netPay: 150000,
    };

    function mockFinalizeTransaction(
      period: typeof processingPeriod | null = processingPeriod,
      records = [validRecord],
      updateCount = 1,
    ) {
      const txPayrollPeriodFindFirst = vi.fn().mockResolvedValue(period);
      const txPayrollRecordFindMany = vi.fn().mockResolvedValue(records);
      const txPayrollPeriodUpdateMany = vi
        .fn()
        .mockResolvedValue({ count: updateCount });

      transaction.mockImplementation(async (callback) =>
        callback({
          payrollPeriod: {
            findFirst: txPayrollPeriodFindFirst,
            updateMany: txPayrollPeriodUpdateMany,
          },
          payrollRecord: {
            findMany: txPayrollRecordFindMany,
          },
        } as never),
      );

      return {
        txPayrollPeriodFindFirst,
        txPayrollRecordFindMany,
        txPayrollPeriodUpdateMany,
      };
    }

    it("finalizes a valid processing payroll period", async () => {
      const tx = mockFinalizeTransaction();

      const result = await finalizePayroll({
        businessId: "business-1",
        branchId: "branch-1",
        payrollPeriodId: "period-1",
        actorUserId: "user-1",
      });

      expect(result).toEqual({
        payrollPeriodId: "period-1",
        status: "FINALIZED",
        recordCount: 1,
      });

      expect(tx.txPayrollPeriodFindFirst).toHaveBeenCalledWith({
        where: {
          id: "period-1",
          businessId: "business-1",
          branchId: "branch-1",
        },
      });

      expect(tx.txPayrollRecordFindMany).toHaveBeenCalledWith({
        where: {
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-1",
        },
        orderBy: {
          employeeId: "asc",
        },
      });

      expect(tx.txPayrollPeriodUpdateMany).toHaveBeenCalledWith({
        where: {
          id: "period-1",
          businessId: "business-1",
          branchId: "branch-1",
          status: "PROCESSING",
          approvalStatus: "APPROVED",
        },
        data: {
          status: "FINALIZED",
        },
      });

      expect(mockedRecordAuditEvent).toHaveBeenCalledWith({
        businessId: "business-1",
        branchId: "branch-1",
        actorUserId: "user-1",
        action: "payroll_period.finalized",
        entityType: "PAYROLL_PERIOD",
        entityId: "period-1",
        metadata: {
          payrollPeriodId: "period-1",
          recordCount: 1,
        },
      });
    });

    it("rejects finalization outside the business and branch scope", async () => {
      mockFinalizeTransaction(null, []);

      await expect(
        finalizePayroll({
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-other",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Payroll period not found",
        statusCode: 404,
      });

      expect(mockedRecordAuditEvent).not.toHaveBeenCalled();
    });

    it("rejects finalization unless the period is processing", async () => {
      mockFinalizeTransaction({
        ...processingPeriod,
        status: "OPEN",
      });

      await expect(
        finalizePayroll({
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-1",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Only a processing payroll period can be finalized",
        statusCode: 400,
      });
    });

    it("rejects finalization when no payroll records exist", async () => {
      mockFinalizeTransaction(processingPeriod, []);

      await expect(
        finalizePayroll({
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-1",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "No payroll records exist for this payroll period",
        statusCode: 400,
      });
    });

    it("rejects deductions that exceed gross pay", async () => {
      mockFinalizeTransaction(processingPeriod, [
        {
          ...validRecord,
          grossPay: 100000,
          totalDeductions: 120000,
          netPay: 0,
        },
      ]);

      await expect(
        finalizePayroll({
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-1",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Payroll deductions exceed gross pay for employee employee-1",
        statusCode: 400,
      });
    });

    it("rejects an inconsistent net pay calculation", async () => {
      mockFinalizeTransaction(processingPeriod, [
        {
          ...validRecord,
          grossPay: 165000,
          totalDeductions: 15000,
          netPay: 149000,
        },
      ]);

      await expect(
        finalizePayroll({
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-1",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Payroll net pay is inconsistent for employee employee-1",
        statusCode: 400,
      });
    });

    it("rejects negative payroll totals", async () => {
      mockFinalizeTransaction(processingPeriod, [
        {
          ...validRecord,
          netPay: -1,
        },
      ]);

      await expect(
        finalizePayroll({
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-1",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Invalid payroll totals for employee employee-1",
        statusCode: 400,
      });
    });

    it("does not finalize when the processing status changed concurrently", async () => {
      const tx = mockFinalizeTransaction(processingPeriod, [validRecord], 0);

      await expect(
        finalizePayroll({
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-1",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message:
          "Payroll period could not be finalized because its status changed",
        statusCode: 409,
      });

      expect(tx.txPayrollPeriodUpdateMany).toHaveBeenCalled();
      expect(mockedRecordAuditEvent).not.toHaveBeenCalled();
    });
  });

  describe("generatePayroll", () => {
    const period = {
      id: "period-1",
      businessId: "business-1",
      branchId: "branch-1",
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-31T23:59:59.999Z"),
      status: "OPEN",
    };

    it("generates payroll using compensation effective at the period end", async () => {
      payrollPeriodFindFirst.mockResolvedValue(period as never);

      userFindMany.mockResolvedValue([
        {
          id: "employee-1",
          fullName: "John Staff",
          role: "STAFF",
        },
      ] as never);

      payrollRecordFindMany.mockResolvedValue([]);

      employeeCompensationFindFirst.mockResolvedValue({
        id: "comp-1",
        basicSalary: 150000,
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        effectiveTo: null,
      } as never);

      const txPayrollPeriodUpdate = vi.fn().mockResolvedValue({});
      const txPayrollRecordCreate = vi.fn().mockResolvedValue({
        id: "record-1",
        businessId: "business-1",
        branchId: "branch-1",
        payrollPeriodId: "period-1",
        employeeId: "employee-1",
        basicSalary: 150000,
        allowances: 0,
        bonuses: 0,
        grossPay: 150000,
        totalDeductions: 0,
        netPay: 150000,
      });

      transaction.mockImplementation(async (callback) =>
        callback({
          payrollPeriod: {
            update: txPayrollPeriodUpdate,
          },
          payrollRecord: {
            create: txPayrollRecordCreate,
          },
        } as never),
      );

      branchResourceShareFindMany.mockResolvedValue([
        { ownerBranchId: "branch-owner", resourceId: null, accessLevel: "READ" },
      ] as never);

      const result = await generatePayroll({
        businessId: "business-1",
        branchId: "branch-1",
        payrollPeriodId: "period-1",
        actorUserId: "user-1",
      });

      expect(employeeCompensationFindFirst).toHaveBeenCalledTimes(1);
      expect(employeeCompensationFindFirst).toHaveBeenCalledWith({
        where: {
          businessId: "business-1",
          employeeId: "employee-1",
          OR: [
            { branchId: { in: ["branch-1", "branch-owner"] } },
            { id: { in: [] } },
          ],
          effectiveFrom: {
            lte: period.periodEnd,
          },
          OR: [
            {
              effectiveTo: null,
            },
            {
              effectiveTo: {
                gt: period.periodEnd,
              },
            },
          ],
        },
        orderBy: {
          effectiveFrom: "desc",
        },
      });

      expect(txPayrollPeriodUpdate).toHaveBeenCalledWith({
        where: {
          id: "period-1",
        },
        data: {
          status: "PROCESSING",
        },
      });

      expect(txPayrollRecordCreate).toHaveBeenCalledWith({
        data: {
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-1",
          employeeId: "employee-1",
          basicSalary: 150000,
          allowances: 0,
          bonuses: 0,
          grossPay: 150000,
          totalDeductions: 0,
          netPay: 150000,
        },
      });

      expect(result).toMatchObject({
        payrollPeriodId: "period-1",
        status: "PROCESSING",
        records: [
          expect.objectContaining({
            employeeId: "employee-1",
            basicSalary: 150000,
            grossPay: 150000,
            totalDeductions: 0,
            netPay: 150000,
          }),
        ],
      });

      expect(mockedRecordAuditEvent).toHaveBeenCalledWith({
        businessId: "business-1",
        branchId: "branch-1",
        actorUserId: "user-1",
        action: "payroll_records.generated",
        entityType: "PAYROLL_PERIOD",
        entityId: "period-1",
        metadata: {
          recordCount: 1,
          payrollPeriodId: "period-1",
        },
      });
    });

    it("rejects generation for a payroll period outside the business and branch scope", async () => {
      payrollPeriodFindFirst.mockResolvedValue(null);

      await expect(
        generatePayroll({
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-other",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Payroll period not found",
        statusCode: 404,
      });

      expect(userFindMany).not.toHaveBeenCalled();
    });

    it("rejects generation when the period is not open", async () => {
      payrollPeriodFindFirst.mockResolvedValue({
        ...period,
        status: "PROCESSING",
      } as never);

      await expect(
        generatePayroll({
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-1",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Payroll can only be generated for an open payroll period",
        statusCode: 400,
      });

      expect(userFindMany).not.toHaveBeenCalled();
    });

    it("rejects generation when there are no active employees assigned to the branch", async () => {
      payrollPeriodFindFirst.mockResolvedValue(period as never);
      userFindMany.mockResolvedValue([]);

      await expect(
        generatePayroll({
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-1",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "No active employees are assigned to this branch",
        statusCode: 400,
      });

      expect(employeeCompensationFindFirst).not.toHaveBeenCalled();
    });

    it("rejects generation when an employee has no compensation record", async () => {
      payrollPeriodFindFirst.mockResolvedValue(period as never);

      userFindMany.mockResolvedValue([
        {
          id: "employee-1",
          fullName: "John Staff",
          role: "STAFF",
        },
      ] as never);

      payrollRecordFindMany.mockResolvedValue([]);
      employeeCompensationFindFirst.mockResolvedValue(null);

      await expect(
        generatePayroll({
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-1",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message:
          "No compensation record found for employee John Staff as of the payroll period end",
        statusCode: 400,
      });

      expect(transaction).not.toHaveBeenCalled();
    });

    it("rejects generation when all payroll records already exist", async () => {
      payrollPeriodFindFirst.mockResolvedValue(period as never);

      userFindMany.mockResolvedValue([
        {
          id: "employee-1",
          fullName: "John Staff",
          role: "STAFF",
        },
      ] as never);

      payrollRecordFindMany.mockResolvedValue([
        {
          employeeId: "employee-1",
        },
      ] as never);

      await expect(
        generatePayroll({
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-1",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "Payroll records have already been generated for this period",
        statusCode: 409,
      });

      expect(employeeCompensationFindFirst).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    });

    it("queries employees using the current business and branch assignment", async () => {
      payrollPeriodFindFirst.mockResolvedValue(period as never);
      userFindMany.mockResolvedValue([]);

      await expect(
        generatePayroll({
          businessId: "business-1",
          branchId: "branch-1",
          payrollPeriodId: "period-1",
          actorUserId: "user-1",
        }),
      ).rejects.toMatchObject({
        message: "No active employees are assigned to this branch",
      });

      expect(userFindMany).toHaveBeenCalledWith({
        where: {
          businessId: "business-1",
          isActive: true,
          branches: {
            some: {
              branchId: "branch-1",
            },
          },
        },
        select: {
          id: true,
          fullName: true,
          role: true,
        },
        orderBy: {
          id: "asc",
        },
      });
    });
  });
});
