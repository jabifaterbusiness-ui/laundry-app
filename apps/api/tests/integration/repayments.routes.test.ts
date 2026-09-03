import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      findFirst: vi.fn(),
    },
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
    $transaction: vi.fn(),
  financialRepayment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    userBranch: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import { createApp } from "../../src/app.js";

const businessFindFirst = vi.mocked(prisma.business.findFirst);
const userFindFirst = vi.mocked(prisma.user.findFirst);
const branchFindFirst = vi.mocked(prisma.branch.findFirst);
const iouFindFirst = vi.mocked(prisma.iOU.findFirst);
const iouUpdate = vi.mocked(prisma.iOU.update);
const loanFindFirst = vi.mocked(prisma.loan.findFirst);
const loanUpdate = vi.mocked(prisma.loan.update);
const repaymentFindFirst = vi.mocked(prisma.financialRepayment.findFirst);
const repaymentFindMany = vi.mocked(prisma.financialRepayment.findMany);
const repaymentCreate = vi.mocked(prisma.financialRepayment.create);
const repaymentUpdate = vi.mocked(prisma.financialRepayment.update);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);

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

const BRANCH_A = "33333333-3333-3333-3333-333333333333";
const BRANCH_B = "44444444-4444-4444-4444-444444444444";
const EMPLOYEE_A = "55555555-5555-5555-5555-555555555555";
const IOU_A = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const LOAN_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const REPAYMENT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const app = createApp();

function allowBranch(
  userId: string,
  branchId: string,
  businessId: string,
) {
  userBranchFindUnique.mockResolvedValue({
    userId,
    branchId,
    branch: {
      id: branchId,
      businessId,
      name: "Main Branch",
    },
  } as never);
}

const employeeFixture = {
  id: EMPLOYEE_A,
  fullName: "John Employee",
  role: "STAFF",
  businessId: "biz-A",
  isActive: true,
};

const branchFixture = {
  id: BRANCH_A,
  businessId: "biz-A",
  isActive: true,
};

const iouFixture = {
  id: IOU_A,
  businessId: "biz-A",
  branchId: BRANCH_A,
  employeeId: EMPLOYEE_A,
  amount: 10000,
  outstandingAmount: 10000,
  status: "APPROVED",
};

const loanFixture = {
  id: LOAN_A,
  businessId: "biz-A",
  branchId: BRANCH_A,
  employeeId: EMPLOYEE_A,
  principalAmount: 50000,
  outstandingAmount: 50000,
  status: "ACTIVE",
};

const repaymentFixture = {
  id: REPAYMENT_A,
  businessId: "biz-A",
  branchId: BRANCH_A,
  employeeId: EMPLOYEE_A,
  type: "IOU",
  iouId: IOU_A,
  loanId: null,
  amount: 4000,
  method: "CASH",
  reference: null,
  note: null,
  status: "POSTED",
  createdById: "user-manager-a",
  createdAt: new Date("2026-09-03T10:00:00.000Z"),
  updatedAt: new Date("2026-09-03T10:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();

  (prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (callback: any) => callback(prisma),
  );

  businessFindFirst.mockResolvedValue({
    id: "biz-A",
    name: "Test Business",
    isActive: true,
  } as never);
});

describe("Financial Repayments routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/payroll/repayments");

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .get("/api/v1/payroll/repayments")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });
});

describe("Financial Repayments routes - branch context", () => {
  it("rejects a request without X-Branch-Id", async () => {
    const res = await request(app)
      .get("/api/v1/payroll/repayments")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
  });

  it("rejects a branch the authenticated user is not a member of", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/payroll/repayments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });

  it("rejects a branch belonging to another business", async () => {
    userBranchFindUnique.mockResolvedValue({
      userId: "user-owner-a",
      branchId: BRANCH_B,
      branch: {
        id: BRANCH_B,
        businessId: "biz-B",
        name: "Other Business Branch",
      },
    } as never);

    const res = await request(app)
      .get("/api/v1/payroll/repayments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
  });
});

describe("Financial Repayments routes - authorization", () => {
  it("BUSINESS_OWNER can create an IOU repayment", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    userFindFirst.mockResolvedValue(employeeFixture as never);
    branchFindFirst.mockResolvedValue(branchFixture as never);
    iouFindFirst.mockResolvedValue(iouFixture as never);
    iouUpdate.mockResolvedValue({
      ...iouFixture,
      outstandingAmount: 6000,
      status: "PARTIALLY_DEDUCTED",
    } as never);
    repaymentCreate.mockResolvedValue(repaymentFixture as never);

    const res = await request(app)
      .post("/api/v1/payroll/repayments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        employeeId: EMPLOYEE_A,
        type: "IOU",
        iouId: IOU_A,
        amount: 4000,
        method: "CASH",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(REPAYMENT_A);

    expect(repaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          employeeId: EMPLOYEE_A,
          type: "IOU",
          iouId: IOU_A,
          amount: 4000,
          method: "CASH",
          status: "POSTED",
          createdById: "user-owner-a",
        }),
      }),
    );
  });

  it("BRANCH_MANAGER can create a repayment", async () => {
    allowBranch("user-manager-a", BRANCH_A, "biz-A");

    userFindFirst.mockResolvedValue(employeeFixture as never);
    branchFindFirst.mockResolvedValue(branchFixture as never);
    iouFindFirst.mockResolvedValue(iouFixture as never);
    iouUpdate.mockResolvedValue({
      ...iouFixture,
      outstandingAmount: 6000,
      status: "PARTIALLY_DEDUCTED",
    } as never);
    repaymentCreate.mockResolvedValue(repaymentFixture as never);

    const res = await request(app)
      .post("/api/v1/payroll/repayments")
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        employeeId: EMPLOYEE_A,
        type: "IOU",
        iouId: IOU_A,
        amount: 4000,
        method: "CASH",
      });

    expect(res.status).toBe(201);
  });

  it("STAFF cannot manage financial repayments", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .get("/api/v1/payroll/repayments")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });

  it("BRANCH_MANAGER cannot void a repayment", async () => {
    allowBranch("user-manager-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .post(`/api/v1/payroll/repayments/${REPAYMENT_A}/void`)
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });

  it("BUSINESS_OWNER can void a repayment", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    repaymentFindFirst.mockResolvedValue(repaymentFixture as never);
    iouFindFirst.mockResolvedValue({
      ...iouFixture,
      outstandingAmount: 6000,
      status: "PARTIALLY_DEDUCTED",
    } as never);
    iouUpdate.mockResolvedValue({
      ...iouFixture,
      outstandingAmount: 10000,
      status: "APPROVED",
    } as never);
    repaymentUpdate.mockResolvedValue({
      ...repaymentFixture,
      status: "VOID",
    } as never);

    const res = await request(app)
      .post(`/api/v1/payroll/repayments/${REPAYMENT_A}/void`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("VOID");
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "financial_repayment.voided",
        entityType: "FINANCIAL_REPAYMENT",
        entityId: REPAYMENT_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-owner-a",
      }),
    );
  });
});

describe("Financial Repayments routes - validation", () => {
  it("rejects an IOU repayment without iouId", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/payroll/repayments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        employeeId: EMPLOYEE_A,
        type: "IOU",
        amount: 4000,
        method: "CASH",
      });

    expect(res.status).toBe(400);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a Loan repayment with an iouId", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/payroll/repayments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        employeeId: EMPLOYEE_A,
        type: "LOAN",
        loanId: LOAN_A,
        iouId: IOU_A,
        amount: 4000,
        method: "CASH",
      });

    expect(res.status).toBe(400);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a zero repayment amount", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/payroll/repayments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        employeeId: EMPLOYEE_A,
        type: "IOU",
        iouId: IOU_A,
        amount: 0,
        method: "CASH",
      });

    expect(res.status).toBe(400);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("does not allow request data to override business or branch scope", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    userFindFirst.mockResolvedValue(employeeFixture as never);
    branchFindFirst.mockResolvedValue(branchFixture as never);
    iouFindFirst.mockResolvedValue(iouFixture as never);
    iouUpdate.mockResolvedValue(iouFixture as never);
    repaymentCreate.mockResolvedValue(repaymentFixture as never);

    const res = await request(app)
      .post("/api/v1/payroll/repayments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        employeeId: EMPLOYEE_A,
        type: "IOU",
        iouId: IOU_A,
        amount: 4000,
        method: "CASH",
        businessId: "biz-B",
        branchId: BRANCH_B,
      });

    expect(res.status).toBe(201);
    expect(repaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
        }),
      }),
    );
  });
});

describe("Financial Repayments routes - retrieval and scope", () => {
  it("gets a repayment within the authenticated business and branch", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    repaymentFindFirst.mockResolvedValue(repaymentFixture as never);

    const res = await request(app)
      .get(`/api/v1/payroll/repayments/${REPAYMENT_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(REPAYMENT_A);

    expect(repaymentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: REPAYMENT_A,
          businessId: "biz-A",
          branchId: BRANCH_A,
        },
      }),
    );
  });

  it("does not expose a repayment from another business or branch", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    repaymentFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payroll/repayments/${REPAYMENT_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(404);
  });

  it("lists only the authenticated business and branch scope", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    repaymentFindMany.mockResolvedValue([repaymentFixture] as never);

    const res = await request(app)
      .get("/api/v1/payroll/repayments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(repaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
        },
      }),
    );
  });

  it("supports employee, type, and status filters", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    repaymentFindMany.mockResolvedValue([repaymentFixture] as never);

    const res = await request(app)
      .get("/api/v1/payroll/repayments")
      .query({
        employeeId: EMPLOYEE_A,
        type: "IOU",
        status: "POSTED",
      })
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(repaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
          employeeId: EMPLOYEE_A,
          type: "IOU",
          status: "POSTED",
        },
      }),
    );
  });
});

describe("Financial Repayments routes - business isolation", () => {
  it("does not allow a business B owner to access business A repayments", async () => {
    allowBranch("user-owner-b", BRANCH_B, "biz-B");

    repaymentFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payroll/repayments/${REPAYMENT_A}`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(404);

    expect(repaymentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: REPAYMENT_A,
          businessId: "biz-B",
          branchId: BRANCH_B,
        },
      }),
    );
  });
});

describe("Financial Repayments routes - void safety", () => {
  it("rejects an already VOID repayment", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    repaymentFindFirst.mockResolvedValue({
      ...repaymentFixture,
      status: "VOID",
    } as never);

    const res = await request(app)
      .post(`/api/v1/payroll/repayments/${REPAYMENT_A}/void`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(400);
    expect(repaymentUpdate).not.toHaveBeenCalled();
  });

  it("preserves the historical repayment row when voiding", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    repaymentFindFirst.mockResolvedValue(repaymentFixture as never);
    iouFindFirst.mockResolvedValue({
      ...iouFixture,
      outstandingAmount: 6000,
      status: "PARTIALLY_DEDUCTED",
    } as never);
    iouUpdate.mockResolvedValue({
      ...iouFixture,
      outstandingAmount: 10000,
      status: "APPROVED",
    } as never);
    repaymentUpdate.mockResolvedValue({
      ...repaymentFixture,
      status: "VOID",
    } as never);

    const res = await request(app)
      .post(`/api/v1/payroll/repayments/${REPAYMENT_A}/void`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(repaymentUpdate).toHaveBeenCalledWith({
      where: {
        id: REPAYMENT_A,
      },
      data: {
        status: "VOID",
      },
    });
  });
});
