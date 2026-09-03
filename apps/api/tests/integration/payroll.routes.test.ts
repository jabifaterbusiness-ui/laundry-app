import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
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
    },
    employeeCompensation: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../src/lib/prisma.js";
import { createApp } from "../../src/app.js";

const businessFindFirst = vi.mocked(prisma.business.findFirst);
const branchFindFirst = vi.mocked(prisma.branch.findFirst);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
const payrollPeriodFindFirst = vi.mocked(prisma.payrollPeriod.findFirst);
const payrollPeriodFindMany = vi.mocked(prisma.payrollPeriod.findMany);
const payrollPeriodCreate = vi.mocked(prisma.payrollPeriod.create);
const userFindMany = vi.mocked(prisma.user.findMany);
const payrollRecordFindMany = vi.mocked(prisma.payrollRecord.findMany);
const employeeCompensationFindFirst = vi.mocked(
  prisma.employeeCompensation.findFirst,
);

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
  vi.resetAllMocks();

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
      .set("X-Branch-Id", BRANCH_A);

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
      .set("X-Branch-Id", BRANCH_A);

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
      .set("X-Branch-Id", BRANCH_A);

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
      .set("X-Branch-Id", BRANCH_A);

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
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(PERIOD_A);
    expect(res.body.payrollRecords).toEqual([]);
  });
});

describe("Payroll generation routes", () => {
  it("generates payroll records for an open period", async () => {
    payrollPeriodFindFirst.mockResolvedValue(periodFixture as never);

    userFindMany.mockResolvedValue([
      {
        id: EMPLOYEE_A,
        fullName: "John Employee",
        role: "STAFF",
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

    const tx = {
      payrollPeriod: {
        update: vi.fn().mockResolvedValue({
          ...periodFixture,
          status: "PROCESSING",
        }),
      },
      payrollRecord: {
        create: vi.fn().mockResolvedValue(createdRecord),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) => callback(tx),
    );

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/generate`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

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
      .set("X-Branch-Id", BRANCH_A);

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
      .set("X-Branch-Id", BRANCH_A);

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
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
