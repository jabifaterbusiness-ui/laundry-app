import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
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
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
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
    expense: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import { createApp } from "../../src/app.js";

const subscriptionFindUnique = vi.mocked(prisma.subscription.findUnique);
const businessFindFirst = vi.mocked(prisma.business.findFirst);
const branchFindFirst = vi.mocked(prisma.branch.findFirst);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);

const expenseFindFirst = vi.mocked(prisma.expense.findFirst);
const expenseFindMany = vi.mocked(prisma.expense.findMany);
const expenseCreate = vi.mocked(prisma.expense.create);
const expenseUpdate = vi.mocked(prisma.expense.update);

const auditEvent = vi.mocked(recordAuditEvent);
const findUserOverride = vi.mocked(prisma.userPermissionOverride.findUnique);

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

const BRANCH_A = "33333333-3333-3333-3333-333333333333";
const BRANCH_B = "44444444-4444-4444-4444-444444444444";

const EXPENSE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const app = createApp();

const expenseFixture = {
  id: EXPENSE_A,
  businessId: "biz-A",
  branchId: BRANCH_A,
  category: "UTILITIES",
  status: "PENDING",
  description: "Electricity bill",
  amount: 75000,
  incurredAt: new Date("2026-09-10T00:00:00.000Z"),
  recognizedAt: null,
  recognizedById: null,
  createdById: "user-owner-a",
  approvedById: null,
  approvedAt: null,
  reference: "NEPA-SEP-001",
  note: "September electricity",
  createdAt: new Date("2026-09-10T10:00:00.000Z"),
  updatedAt: new Date("2026-09-10T10:00:00.000Z"),
};

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
      isActive: true,
    },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
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

  allowBranch("user-owner-a", BRANCH_A, "biz-A");
});

describe("Expenses routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/expenses");

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .get("/api/v1/expenses")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });

  it("requires branch context", async () => {
    const res = await request(app)
      .get("/api/v1/expenses")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
  });
});

describe("Expenses routes - branch isolation", () => {
  it("rejects a branch the authenticated user is not a member of", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/expenses")
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
        isActive: true,
      },
    } as never);

    const res = await request(app)
      .get("/api/v1/expenses")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
  });
});

describe("Expenses routes - authorization", () => {
  it("BUSINESS_OWNER can create an expense", async () => {
    expenseCreate.mockResolvedValue(expenseFixture as never);

    const res = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        category: "UTILITIES",
        description: "Electricity bill",
        amount: 75000,
        incurredAt: "2026-09-10T00:00:00.000Z",
        reference: "NEPA-SEP-001",
        note: "September electricity",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(EXPENSE_A);

    expect(expenseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          category: "UTILITIES",
          status: "PENDING",
          amount: 75000,
          createdById: "user-owner-a",
        }),
      }),
    );

    expect(auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "expense.created",
        entityType: "Expense",
        entityId: EXPENSE_A,
      }),
    );
  });

  it("BRANCH_MANAGER can create an expense through expenses.manage", async () => {
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    expenseCreate.mockResolvedValue({
      ...expenseFixture,
      createdById: "user-manager-a",
    } as never);

    const res = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        category: "TRANSPORT",
        description: "Fuel",
        amount: 30000,
        incurredAt: "2026-09-12T00:00:00.000Z",
      });

    expect(res.status).toBe(201);
  });

  it("STAFF cannot manage expenses by default", async () => {
    const res = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        category: "MISCELLANEOUS",
        description: "Small expense",
        amount: 5000,
        incurredAt: "2026-09-12T00:00:00.000Z",
      });

    expect(res.status).toBe(403);
  });

  it("STAFF cannot approve expenses by default", async () => {
    const res = await request(app)
      .post(`/api/v1/expenses/${EXPENSE_A}/approve`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });
});

describe("Expenses routes - creation and listing", () => {
  it("rejects invalid expense data", async () => {
    const res = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        category: "UTILITIES",
        description: "",
        amount: -100,
        incurredAt: "not-a-date",
      });

    expect(res.status).toBe(400);
    expect(expenseCreate).not.toHaveBeenCalled();
  });

  it("lists expenses within the active business and branch", async () => {
    expenseFindMany.mockResolvedValue([expenseFixture] as never);

    const res = await request(app)
      .get("/api/v1/expenses")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(EXPENSE_A);

    expect(expenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
        }),
      }),
    );
  });

  it("filters expenses by category and status", async () => {
    expenseFindMany.mockResolvedValue([expenseFixture] as never);

    const res = await request(app)
      .get("/api/v1/expenses")
      .query({
        category: "UTILITIES",
        status: "PENDING",
      })
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(expenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          category: "UTILITIES",
          status: "PENDING",
        }),
      }),
    );
  });

  it("gets a single expense only within the current business and branch", async () => {
    expenseFindFirst.mockResolvedValue(expenseFixture as never);

    const res = await request(app)
      .get(`/api/v1/expenses/${EXPENSE_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(EXPENSE_A);

    expect(expenseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: EXPENSE_A,
          businessId: "biz-A",
          branchId: BRANCH_A,
        },
      }),
    );
  });

  it("does not expose another business expense", async () => {
    expenseFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/expenses/${EXPENSE_A}`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
  });
});

describe("Expenses routes - approval and rejection", () => {
  it("approves a pending expense", async () => {
    expenseFindFirst.mockResolvedValue(expenseFixture as never);

    expenseUpdate.mockResolvedValue({
      ...expenseFixture,
      status: "APPROVED",
      approvedById: "user-owner-a",
      approvedAt: new Date("2026-09-11T10:00:00.000Z"),
    } as never);

    const res = await request(app)
      .post(`/api/v1/expenses/${EXPENSE_A}/approve`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");

    expect(expenseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_A },
        data: expect.objectContaining({
          status: "APPROVED",
          approvedById: "user-owner-a",
        }),
      }),
    );

    expect(auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "expense.approved",
        entityId: EXPENSE_A,
      }),
    );
  });

  it("rejects a pending expense", async () => {
    expenseFindFirst.mockResolvedValue(expenseFixture as never);

    expenseUpdate.mockResolvedValue({
      ...expenseFixture,
      status: "REJECTED",
      note: "September electricity\nRejection reason: Duplicate bill",
    } as never);

    const res = await request(app)
      .post(`/api/v1/expenses/${EXPENSE_A}/reject`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        reason: "Duplicate bill",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");

    expect(expenseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_A },
        data: expect.objectContaining({
          status: "REJECTED",
          note: expect.stringContaining("Duplicate bill"),
        }),
      }),
    );

    expect(auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "expense.rejected",
        entityId: EXPENSE_A,
      }),
    );
  });

  it("does not approve an already approved expense", async () => {
    expenseFindFirst.mockResolvedValue({
      ...expenseFixture,
      status: "APPROVED",
    } as never);

    const res = await request(app)
      .post(`/api/v1/expenses/${EXPENSE_A}/approve`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(400);
    expect(expenseUpdate).not.toHaveBeenCalled();
  });
});

describe("Expenses routes - recognition", () => {
  it("recognizes an approved expense", async () => {
    expenseFindFirst.mockResolvedValue({
      ...expenseFixture,
      status: "APPROVED",
    } as never);

    expenseUpdate.mockResolvedValue({
      ...expenseFixture,
      status: "APPROVED",
      recognizedAt: new Date("2026-09-15T10:00:00.000Z"),
      recognizedById: "user-owner-a",
    } as never);

    const res = await request(app)
      .post(`/api/v1/expenses/${EXPENSE_A}/recognize`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
    expect(res.body.recognizedById).toBe("user-owner-a");

    expect(expenseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_A },
        data: expect.objectContaining({
          recognizedById: "user-owner-a",
        }),
      }),
    );

    expect(auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "expense.recognized",
        entityId: EXPENSE_A,
      }),
    );
  });

  it("does not recognize a pending expense", async () => {
    expenseFindFirst.mockResolvedValue(expenseFixture as never);

    const res = await request(app)
      .post(`/api/v1/expenses/${EXPENSE_A}/recognize`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(400);
    expect(expenseUpdate).not.toHaveBeenCalled();
  });

  it("does not recognize an already recognized expense", async () => {
    expenseFindFirst.mockResolvedValue({
      ...expenseFixture,
      status: "APPROVED",
      recognizedAt: new Date("2026-09-15T10:00:00.000Z"),
    } as never);

    const res = await request(app)
      .post(`/api/v1/expenses/${EXPENSE_A}/recognize`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(409);
    expect(expenseUpdate).not.toHaveBeenCalled();
  });
});

describe("Expenses routes - voiding", () => {
  it("can void an approved expense", async () => {
    expenseFindFirst.mockResolvedValue({
      ...expenseFixture,
      status: "APPROVED",
      recognizedAt: new Date("2026-09-15T10:00:00.000Z"),
    } as never);

    expenseUpdate.mockResolvedValue({
      ...expenseFixture,
      status: "VOID",
      recognizedAt: new Date("2026-09-15T10:00:00.000Z"),
    } as never);

    const res = await request(app)
      .post(`/api/v1/expenses/${EXPENSE_A}/void`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ reason: "Routine expense void test" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("VOID");

    expect(expenseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_A },
        data: expect.objectContaining({
          status: "VOID",
        }),
      }),
    );

    expect(auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "expense.voided",
        entityId: EXPENSE_A,
      }),
    );
  });

  it("does not void an already voided expense", async () => {
    expenseFindFirst.mockResolvedValue({
      ...expenseFixture,
      status: "VOID",
    } as never);

    const res = await request(app)
      .post(`/api/v1/expenses/${EXPENSE_A}/void`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ reason: "Routine expense void test" });

    expect(res.status).toBe(400);
    expect(expenseUpdate).not.toHaveBeenCalled();
  });
});
