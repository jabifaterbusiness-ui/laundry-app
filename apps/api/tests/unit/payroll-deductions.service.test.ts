import {
  IOUStatus,
  LoanStatus,
  PayrollDeductionType,
  Prisma,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  payrollPeriodFindFirst: vi.fn(),
  payrollRecordFindMany: vi.fn(),
  payrollDeductionFindMany: vi.fn(),
  payrollDeductionCreate: vi.fn(),
  iouFindMany: vi.fn(),
  iouUpdate: vi.fn(),
  loanFindMany: vi.fn(),
  loanUpdate: vi.fn(),
  payrollRecordUpdate: vi.fn(),
  transaction: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    payrollPeriod: {
      findFirst: mocks.payrollPeriodFindFirst,
    },
    payrollRecord: {
      findMany: mocks.payrollRecordFindMany,
    },
    payrollDeduction: {
      findMany: mocks.payrollDeductionFindMany,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

import { processPayrollDeductions } from "../../src/modules/payroll/payroll-deductions.service.js";

describe("payroll deductions service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }

    mocks.recordAuditEvent.mockResolvedValue(undefined);

    mocks.payrollPeriodFindFirst.mockResolvedValue({
      id: "period-1",
      businessId: "business-1",
      branchId: "branch-1",
      status: "PROCESSING",
    });

    mocks.payrollRecordFindMany.mockResolvedValue([
      {
        id: "record-1",
        businessId: "business-1",
        branchId: "branch-1",
        payrollPeriodId: "period-1",
        employeeId: "employee-1",
        grossPay: 100_000,
        totalDeductions: 0,
        netPay: 100_000,
      },
    ]);

    mocks.payrollDeductionFindMany.mockResolvedValue([]);

    mocks.payrollDeductionCreate.mockImplementation(async ({ data }) => ({
      id: `deduction-${data.iouId ?? data.loanId}`,
      ...data,
    }));

    mocks.iouFindMany.mockResolvedValue([]);
    mocks.loanFindMany.mockResolvedValue([]);

    mocks.iouUpdate.mockImplementation(async ({ data }) => ({
      id: "iou-1",
      ...data,
    }));

    mocks.loanUpdate.mockImplementation(async ({ data }) => ({
      id: "loan-1",
      ...data,
    }));

    mocks.payrollRecordUpdate.mockImplementation(async ({ data }) => ({
      id: "record-1",
      ...data,
    }));

    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        payrollPeriod: {
          findFirst: mocks.payrollPeriodFindFirst,
        },
        payrollDeduction: {
          findMany: mocks.payrollDeductionFindMany,
          create: mocks.payrollDeductionCreate,
        },
        iOU: {
          findMany: mocks.iouFindMany,
          update: mocks.iouUpdate,
        },
        loan: {
          findMany: mocks.loanFindMany,
          update: mocks.loanUpdate,
        },
        payrollRecord: {
          findMany: mocks.payrollRecordFindMany,
          update: mocks.payrollRecordUpdate,
        },
      }),
    );
  });

  it("deducts an IOU before a loan and never makes net pay negative", async () => {
    mocks.iouFindMany.mockResolvedValue([
      {
        id: "iou-1",
        employeeId: "employee-1",
        outstandingAmount: 30_000,
        status: IOUStatus.APPROVED,
        createdAt: new Date("2026-08-01"),
      },
    ]);

    mocks.loanFindMany.mockResolvedValue([
      {
        id: "loan-1",
        employeeId: "employee-1",
        outstandingAmount: 120_000,
        status: LoanStatus.APPROVED,
        createdAt: new Date("2026-08-02"),
      },
    ]);

    await processPayrollDeductions({
      businessId: "business-1",
      branchId: "branch-1",
      payrollPeriodId: "period-1",
      actorUserId: "manager-1",
    });

    expect(mocks.payrollDeductionCreate).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        businessId: "business-1",
        branchId: "branch-1",
        payrollRecordId: "record-1",
        type: PayrollDeductionType.IOU,
        iouId: "iou-1",
        amount: 30_000,
      }),
    });

    expect(mocks.payrollDeductionCreate).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        businessId: "business-1",
        branchId: "branch-1",
        payrollRecordId: "record-1",
        type: PayrollDeductionType.LOAN,
        loanId: "loan-1",
        amount: 70_000,
      }),
    });

    expect(mocks.iouUpdate).toHaveBeenCalledWith({
      where: { id: "iou-1" },
      data: {
        outstandingAmount: 0,
        status: IOUStatus.FULLY_DEDUCTED,
      },
    });

    expect(mocks.loanUpdate).toHaveBeenCalledWith({
      where: { id: "loan-1" },
      data: {
        outstandingAmount: 50_000,
        status: LoanStatus.PARTIALLY_REPAID,
      },
    });

    expect(mocks.payrollRecordUpdate).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: {
        totalDeductions: 100_000,
        netPay: 0,
      },
    });
  });

  it("partially deducts an IOU when available payroll is insufficient", async () => {
    mocks.payrollRecordFindMany.mockResolvedValue([
      {
        id: "record-1",
        businessId: "business-1",
        branchId: "branch-1",
        payrollPeriodId: "period-1",
        employeeId: "employee-1",
        grossPay: 50_000,
        totalDeductions: 0,
        netPay: 50_000,
      },
    ]);

    mocks.iouFindMany.mockResolvedValue([
      {
        id: "iou-1",
        employeeId: "employee-1",
        outstandingAmount: 80_000,
        status: IOUStatus.APPROVED,
        createdAt: new Date("2026-08-01"),
      },
    ]);

    await processPayrollDeductions({
      businessId: "business-1",
      branchId: "branch-1",
      payrollPeriodId: "period-1",
      actorUserId: "manager-1",
    });

    expect(mocks.payrollDeductionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: PayrollDeductionType.IOU,
        iouId: "iou-1",
        amount: 50_000,
      }),
    });

    expect(mocks.iouUpdate).toHaveBeenCalledWith({
      where: { id: "iou-1" },
      data: {
        outstandingAmount: 30_000,
        status: IOUStatus.PARTIALLY_DEDUCTED,
      },
    });

    expect(mocks.payrollRecordUpdate).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: {
        totalDeductions: 50_000,
        netPay: 0,
      },
    });
  });

  it("processes multiple IOUs oldest first", async () => {
    mocks.iouFindMany.mockResolvedValue([
      {
        id: "iou-old",
        employeeId: "employee-1",
        outstandingAmount: 20_000,
        status: IOUStatus.APPROVED,
        createdAt: new Date("2026-07-01"),
      },
      {
        id: "iou-new",
        employeeId: "employee-1",
        outstandingAmount: 30_000,
        status: IOUStatus.APPROVED,
        createdAt: new Date("2026-08-01"),
      },
    ]);

    await processPayrollDeductions({
      businessId: "business-1",
      branchId: "branch-1",
      payrollPeriodId: "period-1",
      actorUserId: "manager-1",
    });

    expect(mocks.payrollDeductionCreate).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        type: PayrollDeductionType.IOU,
        iouId: "iou-old",
        amount: 20_000,
      }),
    });

    expect(mocks.payrollDeductionCreate).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        type: PayrollDeductionType.IOU,
        iouId: "iou-new",
        amount: 30_000,
      }),
    });
  });

  it("does not deduct an IOU already recorded against the payroll record", async () => {
    mocks.payrollDeductionFindMany.mockResolvedValue([
      {
        iouId: "iou-1",
        loanId: null,
      },
    ]);

    mocks.iouFindMany.mockResolvedValue([
      {
        id: "iou-1",
        employeeId: "employee-1",
        outstandingAmount: 30_000,
        status: IOUStatus.PARTIALLY_DEDUCTED,
        createdAt: new Date("2026-08-01"),
      },
    ]);

    await processPayrollDeductions({
      businessId: "business-1",
      branchId: "branch-1",
      payrollPeriodId: "period-1",
      actorUserId: "manager-1",
    });

    expect(mocks.payrollDeductionCreate).not.toHaveBeenCalled();
    expect(mocks.iouUpdate).not.toHaveBeenCalled();
    expect(mocks.payrollRecordUpdate).not.toHaveBeenCalled();
  });

  it("does not deduct a loan already recorded against the payroll record", async () => {
    mocks.payrollDeductionFindMany.mockResolvedValue([
      {
        iouId: null,
        loanId: "loan-1",
      },
    ]);

    mocks.loanFindMany.mockResolvedValue([
      {
        id: "loan-1",
        employeeId: "employee-1",
        outstandingAmount: 30_000,
        status: LoanStatus.PARTIALLY_REPAID,
        createdAt: new Date("2026-08-01"),
      },
    ]);

    await processPayrollDeductions({
      businessId: "business-1",
      branchId: "branch-1",
      payrollPeriodId: "period-1",
      actorUserId: "manager-1",
    });

    expect(mocks.payrollDeductionCreate).not.toHaveBeenCalled();
    expect(mocks.loanUpdate).not.toHaveBeenCalled();
    expect(mocks.payrollRecordUpdate).not.toHaveBeenCalled();
  });

  it("enforces business and branch scope when loading the payroll period and records", async () => {
    await processPayrollDeductions({
      businessId: "business-1",
      branchId: "branch-1",
      payrollPeriodId: "period-1",
      actorUserId: "manager-1",
    });

    expect(mocks.payrollPeriodFindFirst).toHaveBeenCalledWith({
      where: {
        id: "period-1",
        businessId: "business-1",
        branchId: "branch-1",
      },
    });

    expect(mocks.payrollRecordFindMany).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        branchId: "branch-1",
        payrollPeriodId: "period-1",
      },
      orderBy: {
        employeeId: "asc",
      },
    });
  });

  it("rejects a payroll period outside the business and branch scope", async () => {
    mocks.payrollPeriodFindFirst.mockResolvedValue(null);

    await expect(
      processPayrollDeductions({
        businessId: "business-1",
        branchId: "branch-2",
        payrollPeriodId: "period-1",
        actorUserId: "manager-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Payroll period not found",
    });

    expect(mocks.payrollRecordFindMany).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects payroll deduction processing unless the period is PROCESSING", async () => {
    mocks.payrollPeriodFindFirst.mockResolvedValue({
      id: "period-1",
      businessId: "business-1",
      branchId: "branch-1",
      status: "OPEN",
    });

    await expect(
      processPayrollDeductions({
        businessId: "business-1",
        branchId: "branch-1",
        payrollPeriodId: "period-1",
        actorUserId: "manager-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message:
        "Payroll deductions can only be processed for a processing payroll period",
    });

    expect(mocks.payrollRecordFindMany).not.toHaveBeenCalled();
  });

  it("rejects a payroll period with no payroll records", async () => {
    mocks.payrollRecordFindMany.mockResolvedValue([]);

    await expect(
      processPayrollDeductions({
        businessId: "business-1",
        branchId: "branch-1",
        payrollPeriodId: "period-1",
        actorUserId: "manager-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "No payroll records exist for this payroll period",
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("audits successful payroll deduction processing", async () => {
    await processPayrollDeductions({
      businessId: "business-1",
      branchId: "branch-1",
      payrollPeriodId: "period-1",
      actorUserId: "manager-1",
    });

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith({
      businessId: "business-1",
      branchId: "branch-1",
      actorUserId: "manager-1",
      action: "payroll_deductions.processed",
      entityType: "PAYROLL_PERIOD",
      entityId: "period-1",
      metadata: {
        payrollPeriodId: "period-1",
        recordCount: 1,
      },
    });
  });

  it("retries a serialization conflict and audits only after a successful transaction", async () => {
    mocks.transaction.mockImplementationOnce(async () => {
      throw new Prisma.PrismaClientKnownRequestError(
        "serialization conflict",
        {
          code: "P2034",
          clientVersion: "test",
        },
      );
    });

    await processPayrollDeductions({
      businessId: "business-1",
      branchId: "branch-1",
      payrollPeriodId: "period-1",
      actorUserId: "manager-1",
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.mock.calls[1]?.[1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payroll_deductions.processed",
        entityId: "period-1",
      }),
    );
  });

});
