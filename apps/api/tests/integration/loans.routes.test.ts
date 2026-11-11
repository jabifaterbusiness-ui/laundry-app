import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    refreshToken: { findFirst: vi.fn().mockResolvedValue({ id: "session-test" }) },
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
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({ isActive: true, deletedAt: null }),
    },
    branch: {
      findFirst: vi.fn(),
    },
    loan: {
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
const loanFindFirst = vi.mocked(prisma.loan.findFirst);
const loanFindMany = vi.mocked(prisma.loan.findMany);
const loanCreate = vi.mocked(prisma.loan.create);
const loanUpdate = vi.mocked(prisma.loan.update);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
const userPermissionOverrideFindUnique = vi.mocked(
  prisma.userPermissionOverride.findUnique,
);

function tokenFor(
  role: string,
  businessId: string | null,
  userId = "user-owner-a",
) {
  return jwt.sign(
    {
      sub: userId,
    sid: "session-test",
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

const BRANCH_A = "33333333-3333-3333-3333-333333333333";
const BRANCH_B = "44444444-4444-4444-4444-444444444444";
const EMPLOYEE_A = "55555555-5555-5555-5555-555555555555";
const LOAN_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

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
};

const loanFixture = {
  id: LOAN_A,
  businessId: "biz-A",
  branchId: BRANCH_A,
  employeeId: EMPLOYEE_A,
  principalAmount: 50000,
  outstandingAmount: 50000,
  reason: "Emergency assistance",
  status: "PENDING",
  approvedAt: null,
  approvedById: null,
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  updatedAt: new Date("2026-09-01T10:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();

  userPermissionOverrideFindUnique.mockResolvedValue(null);

  businessFindFirst.mockResolvedValue({
    id: "biz-A",
    name: "Test Business",
    isActive: true,
  } as never);
});

describe("Loans routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/payroll/loans");

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .get("/api/v1/payroll/loans")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });
});

describe("Loans routes - branch context", () => {
  it("rejects a request without X-Branch-Id", async () => {
    const res = await request(app)
      .get("/api/v1/payroll/loans")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
  });

  it("rejects a branch the authenticated user is not a member of", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/payroll/loans")
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
      .get("/api/v1/payroll/loans")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
  });
});

describe("Loans routes - authorization", () => {
  it("BUSINESS_OWNER can create a loan", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    userFindFirst.mockResolvedValue(employeeFixture as never);
    branchFindFirst.mockResolvedValue({
      id: BRANCH_A,
    } as never);
    loanCreate.mockResolvedValue(loanFixture as never);

    const res = await request(app)
      .post("/api/v1/payroll/loans")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        employeeId: EMPLOYEE_A,
        principalAmount: 50000,
        reason: "Emergency assistance",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(LOAN_A);
  });

  it("BRANCH_MANAGER can create a loan", async () => {
    allowBranch("user-manager-a", BRANCH_A, "biz-A");
    userPermissionOverrideFindUnique.mockResolvedValue({ allowed: true } as never);

    userFindFirst.mockResolvedValue(employeeFixture as never);
    branchFindFirst.mockResolvedValue({
      id: BRANCH_A,
    } as never);
    loanCreate.mockResolvedValue(loanFixture as never);

    const res = await request(app)
      .post("/api/v1/payroll/loans")
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        employeeId: EMPLOYEE_A,
        principalAmount: 50000,
      });

    expect(res.status).toBe(201);
  });

  it("STAFF cannot access loan management", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .get("/api/v1/payroll/loans")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });

  it("BRANCH_MANAGER cannot approve a loan", async () => {
    allowBranch("user-manager-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .post(`/api/v1/payroll/loans/${LOAN_A}/approve`)
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });

  it("BUSINESS_OWNER can approve a loan", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    loanFindFirst.mockResolvedValue(loanFixture as never);
    loanUpdate.mockResolvedValue({
      ...loanFixture,
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: "user-owner-a",
    } as never);

    const res = await request(app)
      .post(`/api/v1/payroll/loans/${LOAN_A}/approve`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "loan.approved",
        entityType: "LOAN",
        entityId: LOAN_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-owner-a",
      }),
    );
  });

  it("BUSINESS_OWNER can reject a loan", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    loanFindFirst.mockResolvedValue(loanFixture as never);
    loanUpdate.mockResolvedValue({
      ...loanFixture,
      status: "REJECTED",
    } as never);

    const res = await request(app)
      .post(`/api/v1/payroll/loans/${LOAN_A}/reject`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        reason: "Not approved at this time",
      });

    expect(res.status).toBe(200);
  });

  it("BUSINESS_OWNER can cancel a loan", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    loanFindFirst.mockResolvedValue({
      ...loanFixture,
      status: "APPROVED",
    } as never);
    loanUpdate.mockResolvedValue({
      ...loanFixture,
      status: "CANCELLED",
    } as never);

    const res = await request(app)
      .post(`/api/v1/payroll/loans/${LOAN_A}/cancel`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
  });
});

describe("Loans routes - creation validation", () => {
  it("rejects a missing employeeId", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/payroll/loans")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        principalAmount: 50000,
      });

    expect(res.status).toBe(400);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("rejects an invalid employeeId", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/payroll/loans")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        employeeId: "not-a-uuid",
        principalAmount: 50000,
      });

    expect(res.status).toBe(400);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a zero principal amount", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/payroll/loans")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        employeeId: EMPLOYEE_A,
        principalAmount: 0,
      });

    expect(res.status).toBe(400);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("ignores unknown fields instead of allowing them to override server-controlled scope", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    userFindFirst.mockResolvedValue(employeeFixture as never);
    branchFindFirst.mockResolvedValue({
      id: BRANCH_A,
    } as never);
    loanCreate.mockResolvedValue(loanFixture as never);

    const res = await request(app)
      .post("/api/v1/payroll/loans")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        employeeId: EMPLOYEE_A,
        principalAmount: 50000,
        businessId: "biz-B",
      });

    expect(res.status).toBe(201);
    expect(loanCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
        }),
      }),
    );
  });
});

describe("Loans routes - scope and retrieval", () => {
  it("gets a loan within the authenticated business and branch", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    loanFindFirst.mockResolvedValue(loanFixture as never);

    const res = await request(app)
      .get(`/api/v1/payroll/loans/${LOAN_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(LOAN_A);

    expect(loanFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: LOAN_A,
          businessId: "biz-A",
          branchId: BRANCH_A,
        },
      }),
    );
  });

  it("does not expose a loan from another business or branch", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    loanFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payroll/loans/${LOAN_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(404);
  });

  it("lists only the authenticated business and branch scope", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    loanFindMany.mockResolvedValue([loanFixture] as never);

    const res = await request(app)
      .get("/api/v1/payroll/loans")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(loanFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
        },
      }),
    );
  });

  it("supports employee and status filters", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    loanFindMany.mockResolvedValue([loanFixture] as never);

    const res = await request(app)
      .get("/api/v1/payroll/loans")
      .query({
        employeeId: EMPLOYEE_A,
        status: "APPROVED",
      })
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(loanFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
          employeeId: EMPLOYEE_A,
          status: "APPROVED",
        },
      }),
    );
  });

  it("does not allow the request body to override business or branch scope", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    userFindFirst.mockResolvedValue(employeeFixture as never);
    branchFindFirst.mockResolvedValue({
      id: BRANCH_A,
    } as never);
    loanCreate.mockResolvedValue(loanFixture as never);

    const res = await request(app)
      .post("/api/v1/payroll/loans")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        employeeId: EMPLOYEE_A,
        principalAmount: 50000,
        businessId: "biz-B",
        branchId: BRANCH_B,
      });

    expect(res.status).toBe(201);
    expect(loanCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
        }),
      }),
    );
  });
});

describe("Loans routes - status transitions", () => {
  it("rejects approval of an already approved loan", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    loanFindFirst.mockResolvedValue({
      ...loanFixture,
      status: "APPROVED",
    } as never);

    const res = await request(app)
      .post(`/api/v1/payroll/loans/${LOAN_A}/approve`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(400);
    expect(loanUpdate).not.toHaveBeenCalled();
  });

  it("rejects rejection of an already approved loan", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    loanFindFirst.mockResolvedValue({
      ...loanFixture,
      status: "APPROVED",
    } as never);

    const res = await request(app)
      .post(`/api/v1/payroll/loans/${LOAN_A}/reject`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        reason: "Too late",
      });

    expect(res.status).toBe(400);
    expect(loanUpdate).not.toHaveBeenCalled();
  });

  it("rejects cancellation of a partially repaid loan", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    loanFindFirst.mockResolvedValue({
      ...loanFixture,
      status: "PARTIALLY_REPAID",
    } as never);

    const res = await request(app)
      .post(`/api/v1/payroll/loans/${LOAN_A}/cancel`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(400);
    expect(loanUpdate).not.toHaveBeenCalled();
  });

  it("does not approve a loan from another branch", async () => {
    allowBranch("user-owner-a", BRANCH_A, "biz-A");

    loanFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/payroll/loans/${LOAN_A}/approve`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(404);
    expect(loanUpdate).not.toHaveBeenCalled();
  });
});

describe("Loans routes - business isolation", () => {
  it("does not allow a business B owner to access business A loans", async () => {
    allowBranch("user-owner-b", BRANCH_B, "biz-B");

    loanFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payroll/loans/${LOAN_A}`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(404);

    expect(loanFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: LOAN_A,
          businessId: "biz-B",
          branchId: BRANCH_B,
        },
      }),
    );
  });
});
