import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    payrollPeriod: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import { getPayrollStatus } from "../../src/modules/payroll/payroll-status.service.js";

const PERIOD_A = "88888888-8888-8888-8888-888888888888";

const PERIOD_FIXTURE = {
  id: PERIOD_A,
  businessId: "biz-A",
  branchId: "branch-A",
  periodStart: new Date("2026-09-01"),
  periodEnd: new Date("2026-09-30"),
  status: "FINALIZED",
};

function makeRecord({
  id,
  employeeId,
  netPay,
  payments = [],
}: {
  id: string;
  employeeId: string;
  netPay: number;
  payments?: Array<{
    id: string;
    amount: number;
    status: "POSTED" | "VOID";
    createdAt: Date;
  }>;
}) {
  return {
    id,
    employeeId,
    basicSalary: netPay,
    allowances: 0,
    bonuses: 0,
    grossPay: netPay,
    totalDeductions: 0,
    netPay,
    employee: {
      id: employeeId,
      fullName: `Employee ${employeeId}`,
      email: `${employeeId}@example.com`,
      role: "STAFF",
    },
    deductions: [],
    payments,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("payroll-status.service", () => {
  it("calculates unpaid, partially paid, and paid employees using POSTED payments only", async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValue({
      ...PERIOD_FIXTURE,
      payrollRecords: [
        makeRecord({
          id: "record-unpaid",
          employeeId: "employee-unpaid",
          netPay: 100000,
        }),
        makeRecord({
          id: "record-partial",
          employeeId: "employee-partial",
          netPay: 100000,
          payments: [
            {
              id: "payment-partial",
              amount: 40000,
              status: "POSTED",
              createdAt: new Date("2026-09-02"),
            },
          ],
        }),
        makeRecord({
          id: "record-paid",
          employeeId: "employee-paid",
          netPay: 100000,
          payments: [
            {
              id: "payment-paid-1",
              amount: 60000,
              status: "POSTED",
              createdAt: new Date("2026-09-02"),
            },
            {
              id: "payment-paid-2",
              amount: 40000,
              status: "POSTED",
              createdAt: new Date("2026-09-03"),
            },
          ],
        }),
        makeRecord({
          id: "record-void",
          employeeId: "employee-void",
          netPay: 100000,
          payments: [
            {
              id: "payment-void",
              amount: 100000,
              status: "VOID",
              createdAt: new Date("2026-09-03"),
            },
          ],
        }),
      ],
    });

    const result = await getPayrollStatus({
      businessId: "biz-A",
      branchId: "branch-A",
      payrollPeriodId: PERIOD_A,
    });

    expect(result.summary.employeeCount).toBe(4);
    expect(result.summary.paidCount).toBe(1);
    expect(result.summary.partiallyPaidCount).toBe(1);
    expect(result.summary.unpaidCount).toBe(2);
    expect(result.summary.totalNetPay).toBe(400000);
    expect(result.summary.totalPaid).toBe(140000);
    expect(result.summary.totalBalance).toBe(260000);

    const unpaid = result.records.find(
      (record) => record.payrollRecordId === "record-unpaid",
    );
    expect(unpaid?.amountPaid).toBe(0);
    expect(unpaid?.balance).toBe(100000);
    expect(unpaid?.paymentStatus).toBe("UNPAID");

    const partial = result.records.find(
      (record) => record.payrollRecordId === "record-partial",
    );
    expect(partial?.amountPaid).toBe(40000);
    expect(partial?.balance).toBe(60000);
    expect(partial?.paymentStatus).toBe("PARTIALLY_PAID");

    const paid = result.records.find(
      (record) => record.payrollRecordId === "record-paid",
    );
    expect(paid?.amountPaid).toBe(100000);
    expect(paid?.balance).toBe(0);
    expect(paid?.paymentStatus).toBe("PAID");

    const voided = result.records.find(
      (record) => record.payrollRecordId === "record-void",
    );
    expect(voided?.amountPaid).toBe(0);
    expect(voided?.balance).toBe(100000);
    expect(voided?.paymentStatus).toBe("UNPAID");
    expect(voided?.payments).toHaveLength(1);
    expect(voided!.payments[0]!.status).toBe("VOID");
  });

  it("enforces business and branch scope when loading the payroll period", async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValue(undefined);

    await expect(
      getPayrollStatus({
        businessId: "biz-A",
        branchId: "branch-A",
        payrollPeriodId: "period-other",
      }),
    ).rejects.toThrow("Payroll period not found");

    expect(prismaMock.payrollPeriod.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "period-other",
          businessId: "biz-A",
          branchId: "branch-A",
        },
      }),
    );
  });

  it("returns the payroll period details and preserves payment history", async () => {
    const paymentCreatedAt = new Date("2026-09-03");

    prismaMock.payrollPeriod.findFirst.mockResolvedValue({
      ...PERIOD_FIXTURE,
      payrollRecords: [
        makeRecord({
          id: "record-history",
          employeeId: "employee-history",
          netPay: 50000,
          payments: [
            {
              id: "payment-posted",
              amount: 30000,
              status: "POSTED",
              createdAt: paymentCreatedAt,
            },
            {
              id: "payment-void",
              amount: 20000,
              status: "VOID",
              createdAt: new Date("2026-09-04"),
            },
          ],
        }),
      ],
    });

    const result = await getPayrollStatus({
      businessId: "biz-A",
      branchId: "branch-A",
      payrollPeriodId: PERIOD_A,
    });

    expect(result.payrollPeriod).toEqual({
      id: PERIOD_A,
      businessId: "biz-A",
      branchId: "branch-A",
      periodStart: PERIOD_FIXTURE.periodStart,
      periodEnd: PERIOD_FIXTURE.periodEnd,
      status: "FINALIZED",
    });

    expect(result.records[0]!.payments).toHaveLength(2);
    expect(result.records[0]!.payments[0]!.id).toBe("payment-posted");
    expect(result.records[0]!.payments[1]!.id).toBe("payment-void");
    expect(result.records[0]!.amountPaid).toBe(30000);
    expect(result.records[0]!.balance).toBe(20000);
  });

  it("returns 404 when the payroll period does not exist in the requested scope", async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValue(null);

    await expect(
      getPayrollStatus({
        businessId: "biz-A",
        branchId: "branch-A",
        payrollPeriodId: PERIOD_A,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Payroll period not found",
    });
  });
});
