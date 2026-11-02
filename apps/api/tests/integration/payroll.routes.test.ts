import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { sensitiveAuthorizationMock } = vi.hoisted(() => ({
  sensitiveAuthorizationMock: vi.fn(),
}));

vi.mock("../../src/modules/auth/sensitive-authorization.service.js", () => ({
  requireSensitiveAuthorization: sensitiveAuthorizationMock,
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    platformConfig: {
      upsert: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        allowNewBusinessRegistration: true,
        maintenanceMode: false,
        whatsappMessagingEnabled: true,
        automatedNotificationsEnabled: true,
        offlineSyncEnabled: true,
        version: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        cancellationReason: null,
      }),
    },
    permission: {
      findUnique: vi.fn().mockImplementation(
        async ({ where }: { where: { code: string } }) => ({
          id: `permission-${where.code}`,
        }),
      ),
    },
    userPermissionOverride: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    businessRolePermission: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue({
        id: "sub-test",
        businessId: "biz-A",
        plan: "MONTHLY",
        status: "ACTIVE",
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: new Date("2099-01-01T00:00:00.000Z"),
      }),
    },
    business: {
      findFirst: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    userBranch: {
      findUnique: vi.fn(),
    },
    payrollPeriod: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    payrollRecord: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    payrollDeduction: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    iOU: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    loan: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    employeeCompensation: {
      findFirst: vi.fn(),
    },
    payrollPayment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../src/lib/prisma.js";
import { createApp } from "../../src/app.js";

const subscriptionFindUnique = vi.mocked(prisma.subscription.findUnique);
const findUserOverride = vi.mocked(prisma.userPermissionOverride.findUnique);
const businessFindFirst = vi.mocked(prisma.business.findFirst);
const branchFindFirst = vi.mocked(prisma.branch.findFirst);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
const payrollPeriodFindFirst = vi.mocked(prisma.payrollPeriod.findFirst);
const payrollPeriodFindMany = vi.mocked(prisma.payrollPeriod.findMany);
const payrollPeriodCreate = vi.mocked(prisma.payrollPeriod.create);
const userFindMany = vi.mocked(prisma.user.findMany);
const payrollRecordFindMany = vi.mocked(prisma.payrollRecord.findMany);
const payrollDeductionFindMany = vi.mocked(prisma.payrollDeduction.findMany);
const employeeCompensationFindFirst = vi.mocked(
  prisma.employeeCompensation.findFirst,
);
const payrollPaymentFindFirst = vi.mocked(prisma.payrollPayment.findFirst);
const payrollPaymentFindMany = vi.mocked(prisma.payrollPayment.findMany);
const payrollPaymentCount = vi.mocked(prisma.payrollPayment.count);

function tokenFor(
  role: string,
  businessId: string | null,
  userId = "user-owner-a",
) {
  return jwt.sign(
    {
      sub: userId,
      email: "user@example.com",
      role,
      securityRole: role,
      businessId,
    },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: "15m" },
  );
}

const OWNER_A = tokenFor("BUSINESS_OWNER", "biz-A");
const MANAGER_A = tokenFor("BRANCH_MANAGER", "biz-A", "user-manager-a");
const STAFF_A = tokenFor("STAFF", "biz-A", "user-staff-a");
const OWNER_B = tokenFor("BUSINESS_OWNER", "biz-B", "user-owner-b");
const PLATFORM_ADMIN = tokenFor("PLATFORM_ADMIN", null, "user-admin");

const BRANCH_A = "branch-a";
const BRANCH_B = "branch-b";
const PERIOD_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PERIOD_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const EMPLOYEE_A = "55555555-5555-5555-5555-555555555555";

const app = createApp();

const periodFixture = {
  id: PERIOD_A,
  businessId: "biz-A",
  branchId: BRANCH_A,
  periodStart: new Date("2026-09-01T00:00:00.000Z"),
  periodEnd: new Date("2026-09-30T23:59:59.999Z"),
  status: "OPEN",
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  updatedAt: new Date("2026-09-01T10:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  sensitiveAuthorizationMock.mockResolvedValue({
    id: "sensitive-auth-payroll-test",
  });
  findUserOverride.mockResolvedValue(null);

  subscriptionFindUnique.mockResolvedValue({
    id: "sub-test",
    businessId: "biz-A",
    plan: "MONTHLY",
    status: "ACTIVE",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: new Date("2099-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        cancellationReason: null,
  });

  businessFindFirst.mockResolvedValue({
    id: "biz-A",
    name: "Test Business",
    isActive: true,
  } as never);

  branchFindFirst.mockResolvedValue({
    id: BRANCH_A,
    businessId: "biz-A",
    isActive: true,
  } as never);

  userBranchFindUnique.mockResolvedValue({
    userId: "user-owner-a",
    branchId: BRANCH_A,
    branch: {
      id: BRANCH_A,
      businessId: "biz-A",
      isActive: true,
    },
  } as never);
});

describe("Payroll period routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/payroll/periods");

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .get("/api/v1/payroll/periods")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(403);
  });

  it("requires branch context", async () => {
    const res = await request(app)
      .get("/api/v1/payroll/periods")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
  });
});

describe("Payroll period routes - authorization", () => {
  it("BUSINESS_OWNER can create a payroll period", async () => {
    payrollPeriodFindFirst.mockResolvedValue(null);
    payrollPeriodCreate.mockResolvedValue(periodFixture as never);

    const res = await request(app)
      .post("/api/v1/payroll/periods")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(PERIOD_A);

    expect(payrollPeriodCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
        }),
      }),
    );
  });

  it("BRANCH_MANAGER can create a payroll period", async () => {
    findUserOverride.mockResolvedValue({ allowed: true } as never);
    payrollPeriodFindFirst.mockResolvedValue(null);
    payrollPeriodCreate.mockResolvedValue(periodFixture as never);

    const res = await request(app)
      .post("/api/v1/payroll/periods")
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
      });

    expect(res.status).toBe(201);
  });

  it("STAFF cannot manage payroll periods", async () => {
    const res = await request(app)
      .get("/api/v1/payroll/periods")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(403);
  });
});

describe("Payroll period routes - validation", () => {
  it("rejects a missing periodStart", async () => {
    const res = await request(app)
      .post("/api/v1/payroll/periods")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        periodEnd: "2026-09-30",
      });

    expect(res.status).toBe(400);
    expect(payrollPeriodCreate).not.toHaveBeenCalled();
  });

  it("rejects an invalid periodStart", async () => {
    const res = await request(app)
      .post("/api/v1/payroll/periods")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        periodStart: "not-a-date",
        periodEnd: "2026-09-30",
      });

    expect(res.status).toBe(400);
    expect(payrollPeriodCreate).not.toHaveBeenCalled();
  });

  it("rejects a period where start is after end", async () => {
    const res = await request(app)
      .post("/api/v1/payroll/periods")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        periodStart: "2026-10-01",
        periodEnd: "2026-09-30",
      });

    expect(res.status).toBe(400);
    expect(payrollPeriodCreate).not.toHaveBeenCalled();
  });

  it("does not allow client businessId or branchId to override scope", async () => {
    payrollPeriodFindFirst.mockResolvedValue(null);
    payrollPeriodCreate.mockResolvedValue(periodFixture as never);

    const res = await request(app)
      .post("/api/v1/payroll/periods")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        businessId: "biz-B",
        branchId: BRANCH_B,
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
      });

    expect(res.status).toBe(201);

    expect(payrollPeriodCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
        }),
      }),
    );
  });
});

describe("Payroll period routes - creation and isolation", () => {
  it("rejects a duplicate payroll period", async () => {
    payrollPeriodFindFirst.mockResolvedValue({
      id: PERIOD_A,
    } as never);

    const res = await request(app)
      .post("/api/v1/payroll/periods")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
      });

    expect(res.status).toBe(409);
    expect(payrollPeriodCreate).not.toHaveBeenCalled();
  });

  it("rejects a branch outside the authenticated business", async () => {
    branchFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/payroll/periods")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B)
      .send({
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
      });

    expect(res.status).toBe(404);
    expect(payrollPeriodCreate).not.toHaveBeenCalled();
  });

  it("does not expose another business's payroll period", async () => {
    payrollPeriodFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payroll/periods/${PERIOD_A}`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(403);
    expect(payrollPeriodFindFirst).not.toHaveBeenCalled();
  });

  it("does not expose another branch's payroll period", async () => {
    userBranchFindUnique.mockResolvedValue(null);
    payrollPeriodFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payroll/periods/${PERIOD_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);

    expect(payrollPeriodFindFirst).not.toHaveBeenCalled();
  });

  it("lists payroll periods for the selected business and branch", async () => {
    payrollPeriodFindMany.mockResolvedValue([periodFixture] as never);

    const res = await request(app)
      .get("/api/v1/payroll/periods")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(PERIOD_A);

    expect(payrollPeriodFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
        },
      }),
    );
  });

  it("gets a payroll period with its records", async () => {
    payrollPeriodFindFirst.mockResolvedValue({
      ...periodFixture,
      payrollRecords: [],
    } as never);

    const res = await request(app)
      .get(`/api/v1/payroll/periods/${PERIOD_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(PERIOD_A);
    expect(res.body.payrollRecords).toEqual([]);
  });
});

describe("Payroll deduction routes", () => {
  const processingPeriodFixture = {
    ...periodFixture,
    status: "PROCESSING",
  };

  it("processes IOUs before loans and updates payroll totals", async () => {
    payrollPeriodFindFirst.mockResolvedValue(processingPeriodFixture as never);

    payrollRecordFindMany.mockResolvedValue([
      {
        id: "record-a",
        businessId: "biz-A",
        branchId: BRANCH_A,
        payrollPeriodId: PERIOD_A,
        employeeId: EMPLOYEE_A,
        basicSalary: 100000,
        allowances: 0,
        bonuses: 0,
        grossPay: 100000,
        totalDeductions: 0,
        netPay: 100000,
      },
    ] as never);

    payrollDeductionFindMany.mockResolvedValue([]);
    vi.mocked(prisma.iOU.findMany).mockResolvedValue([
      {
        id: "iou-a",
        businessId: "biz-A",
        branchId: BRANCH_A,
        employeeId: EMPLOYEE_A,
        outstandingAmount: 30000,
        status: "APPROVED",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ] as never);

    vi.mocked(prisma.loan.findMany).mockResolvedValue([
      {
        id: "loan-a",
        businessId: "biz-A",
        branchId: BRANCH_A,
        employeeId: EMPLOYEE_A,
        outstandingAmount: 120000,
        status: "APPROVED",
        createdAt: new Date("2026-08-02T00:00:00.000Z"),
      },
    ] as never);

    const tx = {
      payrollPeriod: {
        findFirst: vi.fn().mockResolvedValue(processingPeriodFixture),
      },
      payrollDeduction: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
      },
      iOU: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "iou-a",
            businessId: "biz-A",
            branchId: BRANCH_A,
            employeeId: EMPLOYEE_A,
            outstandingAmount: 30000,
            status: "APPROVED",
            createdAt: new Date("2026-08-01T00:00:00.000Z"),
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      loan: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "loan-a",
            businessId: "biz-A",
            branchId: BRANCH_A,
            employeeId: EMPLOYEE_A,
            outstandingAmount: 120000,
            status: "APPROVED",
            createdAt: new Date("2026-08-02T00:00:00.000Z"),
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      payrollRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "record-a",
            businessId: "biz-A",
            branchId: BRANCH_A,
            payrollPeriodId: PERIOD_A,
            employeeId: EMPLOYEE_A,
            basicSalary: 100000,
            allowances: 0,
            bonuses: 0,
            grossPay: 100000,
            totalDeductions: 0,
            netPay: 100000,
          },
        ]),
        update: vi.fn().mockResolvedValue({
          id: "record-a",
          businessId: "biz-A",
          branchId: BRANCH_A,
          payrollPeriodId: PERIOD_A,
          employeeId: EMPLOYEE_A,
          basicSalary: 100000,
          allowances: 0,
          bonuses: 0,
          grossPay: 100000,
          totalDeductions: 100000,
          netPay: 0,
        }),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) => callback(tx),
    );

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/deductions/process`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(200);
    expect(res.body.payrollPeriodId).toBe(PERIOD_A);
    expect(res.body.records).toHaveLength(1);

    expect(tx.payrollDeduction.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          payrollRecordId: "record-a",
          type: "IOU",
          iouId: "iou-a",
          amount: 30000,
        }),
      }),
    );

    expect(tx.payrollDeduction.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          type: "LOAN",
          loanId: "loan-a",
          amount: 70000,
        }),
      }),
    );

    expect(tx.iOU.update).toHaveBeenCalledWith({
      where: { id: "iou-a" },
      data: {
        outstandingAmount: 0,
        status: "FULLY_DEDUCTED",
      },
    });

    expect(tx.loan.update).toHaveBeenCalledWith({
      where: { id: "loan-a" },
      data: {
        outstandingAmount: 50000,
        status: "PARTIALLY_REPAID",
      },
    });

    expect(tx.payrollRecord.update).toHaveBeenCalledWith({
      where: { id: "record-a" },
      data: {
        totalDeductions: 100000,
        netPay: 0,
      },
    });
  });

  it("rejects deduction processing for a non-processing period", async () => {
    payrollPeriodFindFirst.mockResolvedValue(periodFixture as never);

    const tx = {
      payrollPeriod: {
        findFirst: vi.fn().mockResolvedValue(periodFixture),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) => callback(tx),
    );

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/deductions/process`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(400);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("rejects deduction processing for a payroll period outside the branch scope", async () => {
    userBranchFindUnique.mockResolvedValue(null);
    payrollPeriodFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/deductions/process`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
    expect(payrollRecordFindMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects deduction processing for STAFF", async () => {
    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/deductions/process`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(403);
    expect(payrollPeriodFindFirst).not.toHaveBeenCalled();
  });

  it("rejects deduction processing without branch context", async () => {
    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/deductions/process`)
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
    expect(payrollPeriodFindFirst).not.toHaveBeenCalled();
  });

  it("does not create duplicate deductions for obligations already recorded on the payroll record", async () => {
    payrollPeriodFindFirst.mockResolvedValue(processingPeriodFixture as never);

    payrollRecordFindMany.mockResolvedValue([
      {
        id: "record-a",
        businessId: "biz-A",
        branchId: BRANCH_A,
        payrollPeriodId: PERIOD_A,
        employeeId: EMPLOYEE_A,
        basicSalary: 100000,
        allowances: 0,
        bonuses: 0,
        grossPay: 100000,
        totalDeductions: 30000,
        netPay: 70000,
      },
    ] as never);

    const tx = {
      payrollPeriod: {
        findFirst: vi.fn().mockResolvedValue(processingPeriodFixture),
      },
      payrollDeduction: {
        findMany: vi.fn().mockResolvedValue([
          {
            iouId: "iou-a",
            loanId: null,
          },
          {
            iouId: null,
            loanId: "loan-a",
          },
        ]),
        create: vi.fn(),
      },
      iOU: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "iou-a",
            businessId: "biz-A",
            branchId: BRANCH_A,
            employeeId: EMPLOYEE_A,
            outstandingAmount: 20000,
            status: "APPROVED",
            createdAt: new Date("2026-08-01T00:00:00.000Z"),
          },
        ]),
        update: vi.fn(),
      },
      loan: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "loan-a",
            businessId: "biz-A",
            branchId: BRANCH_A,
            employeeId: EMPLOYEE_A,
            outstandingAmount: 50000,
            status: "APPROVED",
            createdAt: new Date("2026-08-02T00:00:00.000Z"),
          },
        ]),
        update: vi.fn(),
      },
      payrollRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "record-a",
            businessId: "biz-A",
            branchId: BRANCH_A,
            payrollPeriodId: PERIOD_A,
            employeeId: EMPLOYEE_A,
            basicSalary: 100000,
            allowances: 0,
            bonuses: 0,
            grossPay: 100000,
            totalDeductions: 30000,
            netPay: 70000,
          },
        ]),
        update: vi.fn(),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) => callback(tx),
    );

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/deductions/process`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(200);
    expect(tx.payrollDeduction.create).not.toHaveBeenCalled();
    expect(tx.iOU.update).not.toHaveBeenCalled();
    expect(tx.loan.update).not.toHaveBeenCalled();
    expect(tx.payrollRecord.update).not.toHaveBeenCalled();
  });

  it("does not process a payroll period from another business", async () => {
    payrollPeriodFindFirst.mockResolvedValue(null);

    const tx = {
      payrollPeriod: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) => callback(tx),
    );

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_B}/deductions/process`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(404);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});


describe("Payroll finalization routes", () => {
  const processingPeriodFixture = {
    ...periodFixture,
    status: "PROCESSING",
      approvalStatus: "APPROVED",
  };

  const validPayrollRecord = {
    id: "record-a",
    businessId: "biz-A",
    branchId: BRANCH_A,
    payrollPeriodId: PERIOD_A,
    employeeId: EMPLOYEE_A,
    basicSalary: 150000,
    allowances: 10000,
    bonuses: 5000,
    grossPay: 165000,
    totalDeductions: 15000,
    netPay: 150000,
  };

  function mockFinalizeTransaction(
    period = processingPeriodFixture,
    records = [validPayrollRecord],
    updateCount = 1,
  ) {
    const tx = {
      payrollPeriod: {
        findFirst: vi.fn().mockResolvedValue(period),
        updateMany: vi.fn().mockResolvedValue({ count: updateCount }),
      },
      payrollRecord: {
        findMany: vi.fn().mockResolvedValue(records),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) => callback(tx),
    );

    return tx;
  }

  it("finalizes a valid processing payroll period", async () => {
    const tx = mockFinalizeTransaction();

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/finalize`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      payrollPeriodId: PERIOD_A,
      status: "FINALIZED",
      recordCount: 1,
    });

    expect(tx.payrollPeriod.findFirst).toHaveBeenCalledWith({
      where: {
        id: PERIOD_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
      },
    });

    expect(tx.payrollRecord.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        branchId: BRANCH_A,
        payrollPeriodId: PERIOD_A,
      },
      orderBy: {
        employeeId: "asc",
      },
    });

    expect(tx.payrollPeriod.updateMany).toHaveBeenCalledWith({
      where: {
        id: PERIOD_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        status: "PROCESSING",
      approvalStatus: "APPROVED",
      },
      data: {
        status: "FINALIZED",
      },
    });
  });

  it("rejects finalization for a non-processing period", async () => {
    mockFinalizeTransaction({
      ...periodFixture,
      status: "OPEN",
        approvalStatus: "APPROVED",
    });

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/finalize`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(400);
  });

  it("rejects finalization when payroll records are missing", async () => {
    mockFinalizeTransaction(processingPeriodFixture, []);

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/finalize`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(400);
  });

  it("rejects finalization when payroll totals are inconsistent", async () => {
    mockFinalizeTransaction(processingPeriodFixture, [
      {
        ...validPayrollRecord,
        netPay: 149000,
      },
    ]);

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/finalize`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(400);
  });

  it("rejects finalization for a payroll period outside the business and branch scope", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/finalize`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects STAFF from finalizing payroll", async () => {
    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/finalize`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects finalization when the processing status changed concurrently", async () => {
    const tx = mockFinalizeTransaction(
      processingPeriodFixture,
      [validPayrollRecord],
      0,
    );

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/finalize`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(409);
    expect(tx.payrollPeriod.updateMany).toHaveBeenCalled();
  });
});


describe("Payroll generation routes", () => {
  it("generates payroll records for an open period", async () => {
    payrollPeriodFindFirst
      .mockResolvedValueOnce(periodFixture as never)
      .mockResolvedValueOnce({
        ...periodFixture,
        status: "PROCESSING",
      } as never);

    userFindMany.mockResolvedValue([
      {
        id: EMPLOYEE_A,
        fullName: "John Employee",
        role: "Accountant",
      },
    ] as never);

    payrollRecordFindMany.mockResolvedValue([] as never);

    employeeCompensationFindFirst.mockResolvedValue({
      id: "comp-a",
      businessId: "biz-A",
      employeeId: EMPLOYEE_A,
      basicSalary: 150000,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: null,
    } as never);

    const createdRecord = {
      id: "record-a",
      businessId: "biz-A",
      branchId: BRANCH_A,
      payrollPeriodId: PERIOD_A,
      employeeId: EMPLOYEE_A,
      basicSalary: 150000,
      allowances: 0,
      bonuses: 0,
      grossPay: 150000,
      totalDeductions: 0,
      netPay: 150000,
    };

    payrollRecordFindMany
      .mockReset()
      .mockResolvedValueOnce([] as never);

    const tx = {
      payrollPeriod: {
        findFirst: vi.fn().mockResolvedValue({
          ...periodFixture,
          status: "PROCESSING",
        }),
        update: vi.fn().mockResolvedValue({
          ...periodFixture,
          status: "PROCESSING",
        }),
      },
      payrollRecord: {
        create: vi.fn().mockResolvedValue(createdRecord),
        findMany: vi.fn().mockResolvedValue([createdRecord]),
      },
      payrollDeduction: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
      iOU: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      loan: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) => callback(tx),
    );

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/generate`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(200);
    expect(res.body.payrollPeriodId).toBe(PERIOD_A);
    expect(res.body.status).toBe("PROCESSING");
    expect(res.body.records).toHaveLength(1);

    expect(tx.payrollPeriod.update).toHaveBeenCalledWith({
      where: {
        id: PERIOD_A,
      },
      data: {
        status: "PROCESSING",
      },
    });

    expect(tx.payrollRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          payrollPeriodId: PERIOD_A,
          employeeId: EMPLOYEE_A,
          basicSalary: 150000,
          grossPay: 150000,
          netPay: 150000,
        }),
      }),
    );
  });

  it("rejects generation for a non-open period", async () => {
    payrollPeriodFindFirst.mockResolvedValue({
      ...periodFixture,
      status: "PROCESSING",
    } as never);

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/generate`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(400);
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("rejects generation for a payroll period outside the branch scope", async () => {
    userBranchFindUnique.mockResolvedValue(null);
    payrollPeriodFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/generate`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("rejects generation when no active employees are assigned", async () => {
    payrollPeriodFindFirst.mockResolvedValue(periodFixture as never);
    userFindMany.mockResolvedValue([] as never);

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/generate`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(400);
  });

  it("rejects generation when an employee has no compensation", async () => {
    payrollPeriodFindFirst.mockResolvedValue(periodFixture as never);

    userFindMany.mockResolvedValue([
      {
        id: EMPLOYEE_A,
        fullName: "John Employee",
        role: "STAFF",
      },
    ] as never);

    payrollRecordFindMany.mockResolvedValue([] as never);
    employeeCompensationFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/generate`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});


describe("Payroll payment routes", () => {
  const FINALIZED_PERIOD = {
    ...periodFixture,
    status: "FINALIZED",
  };

  const PAYROLL_RECORD_ID = "66666666-6666-6666-6666-666666666666";
  const PAYMENT_ID = "77777777-7777-7777-7777-777777777777";

  const paymentFixture = {
    id: PAYMENT_ID,
    businessId: "biz-A",
    branchId: BRANCH_A,
    payrollRecordId: PAYROLL_RECORD_ID,
    employeeId: EMPLOYEE_A,
    amount: 50000,
    method: "TRANSFER",
    status: "POSTED",
    reference: "BANK-001",
    note: "September salary",
    createdAt: new Date("2026-09-30T10:00:00.000Z"),
    updatedAt: new Date("2026-09-30T10:00:00.000Z"),
  };

  const employeeFixture = {
    id: EMPLOYEE_A,
    fullName: "Employee A",
    email: "employee-a@example.com",
  };

  const payrollRecordFixture = {
    id: PAYROLL_RECORD_ID,
    businessId: "biz-A",
    branchId: BRANCH_A,
    payrollPeriodId: PERIOD_A,
    employeeId: EMPLOYEE_A,
    basicSalary: 100000,
    grossPay: 100000,
    totalDeductions: 0,
    netPay: 100000,
  };

  function finalizedPaymentTransaction(
    existingPayments: Array<{ amount: number }> = [],
    createdPayment = paymentFixture,
  ) {
    const tx = {
      payrollRecord: {
        findFirst: vi.fn().mockResolvedValue({
          ...payrollRecordFixture,
          payrollPeriod: {
            id: PERIOD_A,
            status: "FINALIZED",
          },
          payments: existingPayments,
        }),
        findMany: vi.fn().mockResolvedValue([
          {
            ...payrollRecordFixture,
            payments: [
              ...existingPayments,
              { amount: createdPayment.amount },
            ],
          },
        ]),
      },
      payrollPayment: {
        create: vi.fn().mockResolvedValue(createdPayment),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      payrollPeriod: {
        findFirst: vi.fn().mockResolvedValue(FINALIZED_PERIOD),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) =>
        callback(tx),
    );

    return tx;
  }

  it("requires authentication", async () => {
    const res = await request(app)
      .get("/api/v1/payroll/payments");

    expect(res.status).toBe(401);
  });

  it("requires finance authorization", async () => {
    const res = await request(app)
      .get("/api/v1/payroll/payments")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(403);
  });

  it("requires branch context", async () => {
    const res = await request(app)
      .get("/api/v1/payroll/payments")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
  });

  it("creates a payroll payment within the authenticated business and branch", async () => {
    const tx = finalizedPaymentTransaction();

    const res = await request(app)
      .post("/api/v1/payroll/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        payrollRecordId: PAYROLL_RECORD_ID,
        employeeId: EMPLOYEE_A,
        amount: 50000,
        method: "TRANSFER",
        reference: "BANK-001",
        note: "September salary",
      });

    expect(res.status).toBe(201);
    expect(res.body.payment.id).toBe(PAYMENT_ID);
    expect(res.body.amountPaid).toBe(50000);
    expect(res.body.balance).toBe(50000);

    expect(tx.payrollPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          payrollRecordId: PAYROLL_RECORD_ID,
          employeeId: EMPLOYEE_A,
          amount: 50000,
          method: "TRANSFER",
        }),
      }),
    );
  });

  it("automatically marks the payroll period PAID when the final payment settles the record", async () => {
    const tx = finalizedPaymentTransaction([{ amount: 50000 }], {
      ...paymentFixture,
      amount: 50000,
    });

    const res = await request(app)
      .post("/api/v1/payroll/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        payrollRecordId: PAYROLL_RECORD_ID,
        employeeId: EMPLOYEE_A,
        amount: 50000,
        method: "CASH",
      });

    expect(res.status).toBe(201);
    expect(res.body.payrollPeriodStatus).toBe("PAID");

    expect(tx.payrollPeriod.updateMany).toHaveBeenCalledWith({
      where: {
        id: PERIOD_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        status: "FINALIZED",
      },
      data: {
        status: "PAID",
      },
    });
  });

  it("rejects invalid payment amount", async () => {
    const res = await request(app)
      .post("/api/v1/payroll/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        payrollRecordId: PAYROLL_RECORD_ID,
        employeeId: EMPLOYEE_A,
        amount: 0,
        method: "CASH",
      });

    expect(res.status).toBe(400);
  });

  it("rejects an invalid payment method", async () => {
    const res = await request(app)
      .post("/api/v1/payroll/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        payrollRecordId: PAYROLL_RECORD_ID,
        employeeId: EMPLOYEE_A,
        amount: 50000,
        method: "CHEQUE",
      });

    expect(res.status).toBe(400);
  });

  it("rejects client-supplied businessId or branchId instead of accepting client scope", async () => {
    const tx = finalizedPaymentTransaction();

    const res = await request(app)
      .post("/api/v1/payroll/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        businessId: "biz-B",
        branchId: BRANCH_B,
        payrollRecordId: PAYROLL_RECORD_ID,
        employeeId: EMPLOYEE_A,
        amount: 50000,
        method: "TRANSFER",
      });

    expect(res.status).toBe(400);
    expect(tx.payrollRecord.findFirst).not.toHaveBeenCalled();
    expect(tx.payrollPayment.create).not.toHaveBeenCalled();
  });

  it("does not expose another business's payroll payment", async () => {
    const res = await request(app)
      .get(`/api/v1/payroll/payments/${PAYMENT_ID}`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(403);
    expect(payrollPaymentFindFirst).not.toHaveBeenCalled();
  });

  it("does not expose another branch's payroll payment", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payroll/payments/${PAYMENT_ID}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
    expect(payrollPaymentFindFirst).not.toHaveBeenCalled();
  });

  it("gets a payroll payment within the selected scope", async () => {
    payrollPaymentFindFirst.mockResolvedValue({
      ...paymentFixture,
      employee: employeeFixture,
      payrollRecord: {
        id: PAYROLL_RECORD_ID,
        payrollPeriodId: PERIOD_A,
        basicSalary: 100000,
        grossPay: 100000,
        totalDeductions: 0,
        netPay: 100000,
      },
    } as never);

    const res = await request(app)
      .get(`/api/v1/payroll/payments/${PAYMENT_ID}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(PAYMENT_ID);
  });

  it("returns 404 when a scoped payroll payment does not exist", async () => {
    payrollPaymentFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payroll/payments/${PAYMENT_ID}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(404);
  });

  it("lists payroll payments with business and branch scope", async () => {
    payrollPaymentFindMany.mockResolvedValue([
      {
        ...paymentFixture,
        employee: employeeFixture,
        payrollRecord: {
          id: PAYROLL_RECORD_ID,
          payrollPeriodId: PERIOD_A,
          netPay: 100000,
        },
      },
    ] as never);

    payrollPaymentCount.mockResolvedValue(1);

    const res = await request(app)
      .get("/api/v1/payroll/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);

    expect(payrollPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
        },
      }),
    );
  });

  it("supports payroll payment filters and pagination", async () => {
    payrollPaymentFindMany.mockResolvedValue([] as never);
    payrollPaymentCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/payroll/payments")
      .query({
        payrollRecordId: PAYROLL_RECORD_ID,
        employeeId: EMPLOYEE_A,
        status: "VOID",
        page: 2,
        pageSize: 10,
      })
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(200);

    expect(payrollPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
          payrollRecordId: PAYROLL_RECORD_ID,
          employeeId: EMPLOYEE_A,
          status: "VOID",
        },
        skip: 10,
        take: 10,
      }),
    );
  });

  it("voids a posted payroll payment and preserves the historical row", async () => {
    const tx = {
      payrollPayment: {
        findFirst: vi.fn().mockResolvedValue({
          ...paymentFixture,
          status: "POSTED",
          payrollRecord: {
            id: PAYROLL_RECORD_ID,
            payrollPeriodId: PERIOD_A,
          },
        }),
        update: vi.fn().mockResolvedValue({
          ...paymentFixture,
          status: "VOID",
        }),
      },
      payrollPeriod: {
        findFirst: vi.fn().mockResolvedValue({
          ...FINALIZED_PERIOD,
          status: "PAID",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      payrollRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...payrollRecordFixture,
            payments: [],
          },
        ]),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) => callback(tx),
    );

    const res = await request(app)
      .post(`/api/v1/payroll/payments/${PAYMENT_ID}/void`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ reason: "Routine payroll payment void test" });

    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe("VOID");
    expect(res.body.payrollPeriodStatus).toBe("FINALIZED");

    expect(tx.payrollPayment.update).toHaveBeenCalledWith({
      where: { id: PAYMENT_ID },
      data: { status: "VOID" },
    });

    expect(tx.payrollPeriod.updateMany).toHaveBeenCalledWith({
      where: {
        id: PERIOD_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        status: "PAID",
      },
      data: { status: "FINALIZED" },
    });
  });

  it("rejects an already void payroll payment", async () => {
    const tx = {
      payrollPayment: {
        findFirst: vi.fn().mockResolvedValue({
          ...paymentFixture,
          status: "VOID",
          payrollRecord: {
            id: PAYROLL_RECORD_ID,
            payrollPeriodId: PERIOD_A,
          },
        }),
        update: vi.fn(),
      },
      payrollPeriod: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      payrollRecord: {
        findMany: vi.fn(),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) => callback(tx),
    );

    const res = await request(app)
      .post(`/api/v1/payroll/payments/${PAYMENT_ID}/void`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(422);
    expect(tx.payrollPayment.update).not.toHaveBeenCalled();
  });
});

describe("Payroll status routes", () => {
  const STATUS_PERIOD_ID = "99999999-9999-9999-9999-999999999999";
  const STATUS_RECORD_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const STATUS_EMPLOYEE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  const statusPeriodFixture = {
    ...periodFixture,
    id: STATUS_PERIOD_ID,
    status: "FINALIZED",
  };

  const statusRecordFixture = {
    id: STATUS_RECORD_ID,
    businessId: "biz-A",
    branchId: BRANCH_A,
    payrollPeriodId: STATUS_PERIOD_ID,
    employeeId: STATUS_EMPLOYEE_ID,
    basicSalary: 150000,
    allowances: 10000,
    bonuses: 5000,
    grossPay: 165000,
    totalDeductions: 15000,
    netPay: 150000,
    employee: {
      id: STATUS_EMPLOYEE_ID,
      fullName: "Status Employee",
      email: "status-employee@example.com",
      role: "STAFF",
    },
    deductions: [],
    payments: [
      {
        id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        amount: 50000,
        status: "POSTED",
        createdAt: new Date("2026-09-30T10:00:00.000Z"),
      },
      {
        id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        amount: 25000,
        status: "VOID",
        createdAt: new Date("2026-09-30T11:00:00.000Z"),
      },
    ],
  };  it("returns payroll payment status for a finance user", async () => {
    payrollPeriodFindFirst.mockResolvedValue({
      ...statusPeriodFixture,
      payrollRecords: [statusRecordFixture],
    } as never);

    const res = await request(app)
      .get(`/api/v1/payroll/periods/${STATUS_PERIOD_ID}/status`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(200);
    expect(res.body.summary.employeeCount).toBe(1);
    expect(res.body.summary.paidCount).toBe(0);
    expect(res.body.summary.partiallyPaidCount).toBe(1);
    expect(res.body.summary.unpaidCount).toBe(0);
    expect(res.body.summary.totalNetPay).toBe(150000);
    expect(res.body.summary.totalPaid).toBe(50000);
    expect(res.body.summary.totalBalance).toBe(100000);

    expect(res.body.records[0].amountPaid).toBe(50000);
    expect(res.body.records[0].balance).toBe(100000);
    expect(res.body.records[0].paymentStatus).toBe("PARTIALLY_PAID");
    expect(res.body.records[0].payments).toHaveLength(2);
    expect(res.body.records[0].payments[1].status).toBe("VOID");
  });  it("rejects an unauthenticated request", async () => {
    const res = await request(app)
      .get(`/api/v1/payroll/periods/${STATUS_PERIOD_ID}/status`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(401);
    expect(payrollPeriodFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a staff user from payroll status", async () => {
    const res = await request(app)
      .get(`/api/v1/payroll/periods/${STATUS_PERIOD_ID}/status`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(403);
    expect(payrollPeriodFindFirst).not.toHaveBeenCalled();
  });

  it("requires branch context", async () => {
    const res = await request(app)
      .get(`/api/v1/payroll/periods/${STATUS_PERIOD_ID}/status`)
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
    expect(payrollPeriodFindFirst).not.toHaveBeenCalled();
  });  it("enforces business scope", async () => {
    businessFindFirst.mockResolvedValue({
      id: "biz-B",
      name: "Business B",
      isActive: true,
    } as never);

    branchFindFirst.mockResolvedValue({
      id: BRANCH_B,
      businessId: "biz-B",
      isActive: true,
    } as never);

    userBranchFindUnique.mockResolvedValue({
      userId: "user-owner-b",
      branchId: BRANCH_B,
      branch: {
        id: BRANCH_B,
        businessId: "biz-B",
        isActive: true,
      },
    } as never);

    payrollPeriodFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payroll/periods/${STATUS_PERIOD_ID}/status`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(404);
    expect(payrollPeriodFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: STATUS_PERIOD_ID,
          businessId: "biz-B",
          branchId: BRANCH_B,
        },
      }),
    );
  });

  it("enforces branch scope", async () => {
    payrollPeriodFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payroll/periods/${STATUS_PERIOD_ID}/status`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(404);
    expect(payrollPeriodFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: STATUS_PERIOD_ID,
          businessId: "biz-A",
          branchId: BRANCH_B,
        },
      }),
    );
  });
});
