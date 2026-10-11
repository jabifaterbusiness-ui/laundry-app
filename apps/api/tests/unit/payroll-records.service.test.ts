import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  payrollRecordFindFirst: vi.fn(),
  payrollRecordUpdate: vi.fn(),
  payrollDeductionCreate: vi.fn(),
  transaction: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    payrollRecord: {
      findFirst: mocks.payrollRecordFindFirst,
      update: mocks.payrollRecordUpdate,
    },
    payrollDeduction: {
      create: mocks.payrollDeductionCreate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

import {
  createOtherPayrollDeduction,
  updatePayrollEarnings,
} from "../../src/modules/payroll/payroll-records.service.js";

const args = {
  businessId: "business-1",
  branchId: "branch-1",
  payrollRecordId: "record-1",
  actorUserId: "manager-1",
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "record-1",
    businessId: args.businessId,
    branchId: args.branchId,
    payrollPeriodId: "period-1",
    employeeId: "employee-1",
    basicSalary: 100_000,
    allowances: 10_000,
    bonuses: 5_000,
    grossPay: 115_000,
    totalDeductions: 15_000,
    netPay: 100_000,
    payrollPeriod: {
      id: "period-1",
      status: "PROCESSING",
      approvalStatus: "NOT_SUBMITTED",
    },
    payments: [],
    ...overrides,
  };
}

describe("payroll record editing service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.recordAuditEvent.mockResolvedValue(undefined);
    mocks.payrollRecordFindFirst.mockResolvedValue(record());
    mocks.payrollRecordUpdate.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...record(),
        ...data,
      }),
    );
    mocks.payrollDeductionCreate.mockResolvedValue({
      id: "deduction-1",
      type: "OTHER",
      amount: 20_000,
      description: "Uniform charge",
    });

    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          payrollRecord: {
            findFirst: mocks.payrollRecordFindFirst,
            update: mocks.payrollRecordUpdate,
          },
          payrollDeduction: {
            create: mocks.payrollDeductionCreate,
          },
        }),
    );
  });

  it("updates earnings and recalculates gross and net pay", async () => {
    await updatePayrollEarnings({
      ...args,
      basicSalary: 120_000,
      allowances: 15_000,
      bonuses: 5_000,
    });

    expect(mocks.payrollRecordUpdate).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: {
        basicSalary: 120_000,
        allowances: 15_000,
        bonuses: 5_000,
        grossPay: 140_000,
        netPay: 125_000,
      },
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalled();
  });

  it("rejects earnings below existing deductions", async () => {
    await expect(
      updatePayrollEarnings({
        ...args,
        basicSalary: 5_000,
        allowances: 2_000,
        bonuses: 1_000,
      }),
    ).rejects.toThrow(/gross pay cannot be less than existing deductions/i);

    expect(mocks.payrollRecordUpdate).not.toHaveBeenCalled();
  });

  it("rejects earnings edits after a posted payment", async () => {
    mocks.payrollRecordFindFirst.mockResolvedValue(
      record({ payments: [{ id: "payment-1" }] }),
    );

    await expect(
      updatePayrollEarnings({
        ...args,
        basicSalary: 120_000,
        allowances: 15_000,
        bonuses: 5_000,
      }),
    ).rejects.toThrow(/after a payroll payment has been posted/i);

    expect(mocks.payrollRecordUpdate).not.toHaveBeenCalled();
  });

  it("creates an OTHER deduction and recalculates total deductions and net pay", async () => {
    await createOtherPayrollDeduction({
      ...args,
      amount: 20_000,
      reason: "  Uniform charge  ",
    });

    expect(mocks.payrollDeductionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: args.businessId,
        branchId: args.branchId,
        payrollRecordId: args.payrollRecordId,
        type: "OTHER",
        amount: 20_000,
        description: "Uniform charge",
      }),
    });

    expect(mocks.payrollRecordUpdate).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: {
        totalDeductions: 35_000,
        netPay: 80_000,
      },
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalled();
  });

  it("rejects manual deductions after a posted payment", async () => {
    mocks.payrollRecordFindFirst.mockResolvedValue(
      record({ payments: [{ id: "payment-1" }] }),
    );

    await expect(
      createOtherPayrollDeduction({
        ...args,
        amount: 1_000,
        reason: "Uniform charge",
      }),
    ).rejects.toThrow(/after a payroll payment has been posted/i);

    expect(mocks.payrollDeductionCreate).not.toHaveBeenCalled();
    expect(mocks.payrollRecordUpdate).not.toHaveBeenCalled();
  });

  it("rejects a deduction greater than available pay", async () => {
    await expect(
      createOtherPayrollDeduction({
        ...args,
        amount: 100_001,
        reason: "Uniform charge",
      }),
    ).rejects.toThrow(/exceeds available pay/i);

    expect(mocks.payrollDeductionCreate).not.toHaveBeenCalled();
    expect(mocks.payrollRecordUpdate).not.toHaveBeenCalled();
  });

  it("rejects a blank deduction reason", async () => {
    await expect(
      createOtherPayrollDeduction({
        ...args,
        amount: 1_000,
        reason: "   ",
      }),
    ).rejects.toThrow(/deduction reason/i);

    expect(mocks.payrollRecordUpdate).not.toHaveBeenCalled();
  });
});
