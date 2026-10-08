import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approvePayroll,
  declinePayroll,
  submitPayrollForApproval,
} from "../../src/modules/payroll/payroll.service.js";

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    payrollPeriod: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    payrollRecord: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn(),
}));

const tx = () => ({
  payrollPeriod: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  payrollRecord: {
    findFirst: vi.fn(),
  },
});

const period = {
  id: "period-1",
  businessId: "business-1",
  branchId: "branch-1",
  status: "PROCESSING",
  approvalStatus: "NOT_SUBMITTED",
  approvalSubmittedAt: null,
  approvalSubmittedById: null,
  approvalDecidedAt: null,
  approvalDecidedById: null,
  approvalReason: null,
};

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
    callback(tx() as never),
  );

  vi.mocked(recordAuditEvent).mockResolvedValue(undefined);
});

describe("payroll approval workflow", () => {
  it("submits processing payroll for approval", async () => {
    const transaction = tx();

    transaction.payrollPeriod.findFirst
      .mockResolvedValueOnce(period)
      .mockResolvedValueOnce({
        ...period,
        approvalStatus: "PENDING",
        approvalSubmittedAt: new Date("2026-10-08T10:00:00.000Z"),
        approvalSubmittedById: "submitter-1",
      });

    transaction.payrollRecord.findFirst.mockResolvedValue({
      id: "record-1",
    });

    transaction.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(transaction as never),
    );

    const result = await submitPayrollForApproval({
      businessId: "business-1",
      branchId: "branch-1",
      payrollPeriodId: "period-1",
      actorUserId: "submitter-1",
    });

    expect(result?.approvalStatus).toBe("PENDING");
    expect(transaction.payrollPeriod.updateMany).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payroll_period.submitted_for_approval",
      }),
    );
  });

  it("prevents the submitter from approving their own payroll", async () => {
    const transaction = tx();

    transaction.payrollPeriod.findFirst.mockResolvedValue({
      ...period,
      approvalStatus: "PENDING",
      approvalSubmittedById: "user-1",
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(transaction as never),
    );

    await expect(
      approvePayroll({
        businessId: "business-1",
        branchId: "branch-1",
        payrollPeriodId: "period-1",
        actorUserId: "user-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("declines with a required reason and preserves the reason", async () => {
    const transaction = tx();

    transaction.payrollPeriod.findFirst
      .mockResolvedValueOnce({
        ...period,
        approvalStatus: "PENDING",
        approvalSubmittedById: "submitter-1",
      })
      .mockResolvedValueOnce({
        ...period,
        approvalStatus: "DECLINED",
        approvalSubmittedById: "submitter-1",
        approvalDecidedById: "approver-1",
        approvalReason: "Please correct the salary figure",
      });

    transaction.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(transaction as never),
    );

    const result = await declinePayroll({
      businessId: "business-1",
      branchId: "branch-1",
      payrollPeriodId: "period-1",
      actorUserId: "approver-1",
      reason: "  Please correct the salary figure  ",
    });

    expect(result?.approvalStatus).toBe("DECLINED");
    expect(result?.approvalReason).toBe("Please correct the salary figure");
    expect(transaction.payrollPeriod.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvalStatus: "DECLINED",
          approvalReason: "Please correct the salary figure",
        }),
      }),
    );
  });

  it("rejects blank decline reasons", async () => {
    await expect(
      declinePayroll({
        businessId: "business-1",
        branchId: "branch-1",
        payrollPeriodId: "period-1",
        actorUserId: "approver-1",
        reason: "   ",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
