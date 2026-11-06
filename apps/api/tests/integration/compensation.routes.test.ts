import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

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
    },
    userBranch: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { userId_branchId: { userId: string; branchId: string } } }) => {
        const { userId, branchId } = where.userId_branchId;
        const businessId = userId === "user-owner-b" ? "biz-B" : "biz-A";
        return {
          id: `membership-${userId}-${branchId}`,
          userId,
          branchId,
          branch: { id: branchId, businessId, name: "Main", address: null, isActive: true },
        };
      }),
    },
    branchResourceShare: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    employeeCompensation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
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
import { recordAuditEvent } from "../../src/lib/audit.js";
import { createApp } from "../../src/app.js";

const businessFindFirst = vi.mocked(prisma.business.findFirst);
const userFindFirst = vi.mocked(prisma.user.findFirst);
const compensationFindFirst = vi.mocked(prisma.employeeCompensation.findFirst);
const compensationFindMany = vi.mocked(prisma.employeeCompensation.findMany);
const compensationCreate = vi.mocked(prisma.employeeCompensation.create);
const compensationUpdate = vi.mocked(prisma.employeeCompensation.update);
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

const EMPLOYEE_A = "55555555-5555-5555-5555-555555555555";
const COMPENSATION_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const app = createApp();

const employeeFixture = {
  id: EMPLOYEE_A,
  fullName: "John Employee",
  role: "STAFF",
};

const compensationFixture = {
  id: COMPENSATION_A,
  businessId: "biz-A",
  employeeId: EMPLOYEE_A,
  branchId: "branch-A",
  basicSalary: 150000,
  effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
  effectiveTo: null,
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  updatedAt: new Date("2026-09-01T10:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();

  businessFindFirst.mockResolvedValue({
    id: "biz-A",
    name: "Test Business",
    isActive: true,
  } as never);
  findUserOverride.mockResolvedValue(null);
});

describe("Compensation routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/payroll/compensation");

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .get("/api/v1/payroll/compensation")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .set("x-branch-id", "branch-A");

    expect(res.status).toBe(403);
  });

  it("rejects requests without branch context", async () => {
    const res = await request(app)
      .get("/api/v1/payroll/compensation")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
    expect(compensationFindMany).not.toHaveBeenCalled();
  });
});

describe("Compensation routes - authorization", () => {
  it("BUSINESS_OWNER can create compensation", async () => {
    userFindFirst.mockResolvedValue(employeeFixture as never);

    const tx = {
      employeeCompensation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(compensationFixture),
        update: vi.fn(),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) => callback(tx),
    );

    const res = await request(app)
      .post("/api/v1/payroll/compensation")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("x-branch-id", "branch-A")
      .send({
        employeeId: EMPLOYEE_A,
        basicSalary: 150000,
        effectiveFrom: "2026-09-01",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(COMPENSATION_A);
  });

  it("BRANCH_MANAGER can create compensation", async () => {
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    userFindFirst.mockResolvedValue(employeeFixture as never);

    const tx = {
      employeeCompensation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(compensationFixture),
        update: vi.fn(),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) => callback(tx),
    );

    const res = await request(app)
      .post("/api/v1/payroll/compensation")
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("x-branch-id", "branch-A")
      .send({
        employeeId: EMPLOYEE_A,
        basicSalary: 150000,
        effectiveFrom: "2026-09-01",
      });

    expect(res.status).toBe(201);
  });

  it("STAFF cannot access compensation management", async () => {
    const res = await request(app)
      .get("/api/v1/payroll/compensation")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("x-branch-id", "branch-A");

    expect(res.status).toBe(403);
  });
});

describe("Compensation routes - creation validation", () => {
  it("rejects a missing employeeId", async () => {
    const res = await request(app)
      .post("/api/v1/payroll/compensation")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("x-branch-id", "branch-A")
      .send({
        basicSalary: 150000,
        effectiveFrom: "2026-09-01",
      });

    expect(res.status).toBe(400);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("rejects an invalid employeeId", async () => {
    const res = await request(app)
      .post("/api/v1/payroll/compensation")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("x-branch-id", "branch-A")
      .send({
        employeeId: "not-a-uuid",
        basicSalary: 150000,
        effectiveFrom: "2026-09-01",
      });

    expect(res.status).toBe(400);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a zero salary", async () => {
    const res = await request(app)
      .post("/api/v1/payroll/compensation")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("x-branch-id", "branch-A")
      .send({
        employeeId: EMPLOYEE_A,
        basicSalary: 0,
        effectiveFrom: "2026-09-01",
      });

    expect(res.status).toBe(400);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("rejects an invalid effective date", async () => {
    const res = await request(app)
      .post("/api/v1/payroll/compensation")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("x-branch-id", "branch-A")
      .send({
        employeeId: EMPLOYEE_A,
        basicSalary: 150000,
        effectiveFrom: "not-a-date",
      });

    expect(res.status).toBe(400);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("does not allow a client-supplied businessId to override tenant scope", async () => {
    userFindFirst.mockResolvedValue(employeeFixture as never);

    const tx = {
      employeeCompensation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(compensationFixture),
        update: vi.fn(),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) => callback(tx),
    );

    const res = await request(app)
      .post("/api/v1/payroll/compensation")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("x-branch-id", "branch-A")
      .send({
        businessId: "biz-B",
        employeeId: EMPLOYEE_A,
        basicSalary: 150000,
        effectiveFrom: "2026-09-01",
      });

    expect(res.status).toBe(201);

    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
        }),
      }),
    );

    expect(tx.employeeCompensation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
        }),
      }),
    );
  });
});

describe("Compensation routes - history and isolation", () => {
  it("lists compensation history for the authenticated business", async () => {
    compensationFindMany.mockResolvedValue([compensationFixture] as never);

    const res = await request(app)
      .get("/api/v1/payroll/compensation")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("x-branch-id", "branch-A");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(COMPENSATION_A);

    expect(compensationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          OR: [
            { branchId: { in: ["branch-A"] } },
            { id: { in: [] } },
          ],
          employee: { is: { branches: { some: { branchId: "branch-A" } } } },
        },
      }),
    );
  });

  it("filters compensation history by employee", async () => {
    compensationFindMany.mockResolvedValue([compensationFixture] as never);

    const res = await request(app)
      .get(`/api/v1/payroll/compensation?employeeId=${EMPLOYEE_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("x-branch-id", "branch-A");

    expect(res.status).toBe(200);

    expect(compensationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          OR: [
            { branchId: { in: ["branch-A"] } },
            { id: { in: [] } },
          ],
          employee: { is: { branches: { some: { branchId: "branch-A" } } } },
          employeeId: EMPLOYEE_A,
        },
      }),
    );
  });

  it("does not expose another business's compensation record", async () => {
    compensationFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payroll/compensation/${COMPENSATION_A}`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("x-branch-id", "branch-B");

    expect(res.status).toBe(404);

    expect(compensationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: COMPENSATION_A,
          businessId: "biz-B",
          OR: [
            { branchId: { in: ["branch-B"] } },
            { id: { in: [] } },
          ],
          employee: { is: { branches: { some: { branchId: "branch-B" } } } },
        },
      }),
    );
  });

  it("gets a compensation record within the authenticated business", async () => {
    compensationFindFirst.mockResolvedValue({
      ...compensationFixture,
      employee: employeeFixture,
    } as never);

    const res = await request(app)
      .get(`/api/v1/payroll/compensation/${COMPENSATION_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("x-branch-id", "branch-A");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(COMPENSATION_A);
  });
});

describe("Compensation routes - effective salary lookup", () => {
  it("returns the compensation effective on the requested date", async () => {
    compensationFindFirst.mockResolvedValue(compensationFixture as never);

    const res = await request(app)
      .get(
        `/api/v1/payroll/compensation/current/${EMPLOYEE_A}?effectiveDate=2026-09-15`,
      )
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("x-branch-id", "branch-A");

    expect(res.status).toBe(200);
    expect(res.body.basicSalary).toBe(150000);

    expect(compensationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          employeeId: EMPLOYEE_A,
          AND: [
            {
              OR: [
                { branchId: { in: ["branch-A"] } },
                { id: { in: [] } },
              ],
            },
            {
              effectiveFrom: { lte: new Date("2026-09-15T00:00:00.000Z") },
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gt: new Date("2026-09-15T00:00:00.000Z") } },
              ],
            },
          ],
        }),
      }),
    );
  });

  it("uses the current date when effectiveDate is omitted", async () => {
    compensationFindFirst.mockResolvedValue(compensationFixture as never);

    const res = await request(app)
      .get(`/api/v1/payroll/compensation/current/${EMPLOYEE_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("x-branch-id", "branch-A");

    expect(res.status).toBe(200);
  });

  it("rejects an invalid effectiveDate query", async () => {
    const res = await request(app)
      .get(
        `/api/v1/payroll/compensation/current/${EMPLOYEE_A}?effectiveDate=invalid-date`,
      )
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("x-branch-id", "branch-A");

    expect(res.status).toBe(400);
    expect(compensationFindFirst).not.toHaveBeenCalled();
  });
});

describe("Compensation routes - salary history", () => {
  it("closes the previous compensation and creates the new historical record", async () => {
    userFindFirst.mockResolvedValue(employeeFixture as never);

    const previous = {
      ...compensationFixture,
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      basicSalary: 120000,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: null,
    };

    const tx = {
      employeeCompensation: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(previous)
          .mockResolvedValueOnce(null),
        create: vi.fn().mockResolvedValue({
          ...compensationFixture,
          basicSalary: 150000,
        }),
        update: vi.fn().mockResolvedValue({
          ...previous,
          effectiveTo: new Date("2026-09-01T00:00:00.000Z"),
        }),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: (transaction: any) => unknown) => callback(tx),
    );

    const res = await request(app)
      .post("/api/v1/payroll/compensation")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("x-branch-id", "branch-A")
      .send({
        employeeId: EMPLOYEE_A,
        basicSalary: 150000,
        effectiveFrom: "2026-09-01",
      });

    expect(res.status).toBe(201);

    expect(tx.employeeCompensation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: previous.id,
        },
        data: {
          effectiveTo: new Date("2026-09-01T00:00:00.000Z"),
        },
      }),
    );

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "employee_compensation.created",
        entityType: "EMPLOYEE_COMPENSATION",
        businessId: "biz-A",
        actorUserId: "user-owner-a",
      }),
    );
  });
});
