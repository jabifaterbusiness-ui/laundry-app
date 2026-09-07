import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    order: {
      count: vi.fn(),
    },
    invoice: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    payment: {
      aggregate: vi.fn(),
    },
    customer: {
      count: vi.fn(),
    },
    inventoryStock: {
      count: vi.fn(),
    },
    inventoryMovement: {
      count: vi.fn(),
    },
    userBranch: {
      findUnique: vi.fn(),
    },
    permission: {
      findUnique: vi.fn(),
    },
    businessRolePermission: {
      findUnique: vi.fn(),
    },
    userPermissionOverride: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import { createApp } from "../../src/app.js";

const orderCount = vi.mocked(prisma.order.count);
const invoiceCount = vi.mocked(prisma.invoice.count);
const invoiceAggregate = vi.mocked(prisma.invoice.aggregate);
const paymentAggregate = vi.mocked(prisma.payment.aggregate);
const customerCount = vi.mocked(prisma.customer.count);
const inventoryStockCount = vi.mocked(prisma.inventoryStock.count);
const inventoryMovementCount = vi.mocked(prisma.inventoryMovement.count);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
const findPermission = vi.mocked(prisma.permission.findUnique);
const findRoleOverride = vi.mocked(prisma.businessRolePermission.findUnique);
const findUserOverride = vi.mocked(prisma.userPermissionOverride.findUnique);

function tokenFor(
  role: string,
  businessId: string | null,
  userId = "user-1",
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
const STAFF_A = tokenFor("STAFF", "biz-A", "user-staff-a");
const MANAGER_A = tokenFor("BRANCH_MANAGER", "biz-A", "user-mgr-a");
const OWNER_B = tokenFor("BUSINESS_OWNER", "biz-B", "user-owner-b");
const PLATFORM_ADMIN = tokenFor("PLATFORM_ADMIN", null, "user-admin");

const BRANCH_A = "33333333-3333-3333-3333-333333333333";
const BRANCH_B = "44444444-4444-4444-4444-444444444444";

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

function mockReportData() {
  orderCount.mockResolvedValue(12);
  invoiceCount.mockResolvedValue(10);
  invoiceAggregate.mockResolvedValue({
    _sum: {
      totalAmount: 500000,
    },
  } as never);

  paymentAggregate
    .mockResolvedValueOnce({
      _sum: {
        amount: 350000,
      },
    } as never)
    .mockResolvedValueOnce({
      _sum: {
        amount: 25000,
      },
    } as never);

  customerCount.mockResolvedValue(40);
  inventoryStockCount.mockResolvedValue(8);
  inventoryMovementCount.mockResolvedValue(20);
}

beforeEach(() => {
  vi.clearAllMocks();

  findPermission.mockImplementation(((args: { where: { code?: string } }) => {
    const code = args.where.code ?? "";
    const [module, action] = code.split(".");

    return Promise.resolve({
      id: `permission-${code}`,
      code,
      module,
      action,
      description: null,
      createdAt: new Date(),
    });
  }) as never);

  findRoleOverride.mockResolvedValue(null);
  findUserOverride.mockResolvedValue(null);
});

describe("Reports routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/reports/dashboard");

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .get("/api/v1/reports/dashboard")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });
});

describe("Reports routes - branch context", () => {
  it("rejects a request without X-Branch-Id", async () => {
    const res = await request(app)
      .get("/api/v1/reports/dashboard")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
  });

  it("rejects a branch the authenticated user is not a member of", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/reports/dashboard")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });

  it("rejects a branch belonging to another business", async () => {
    userBranchFindUnique.mockResolvedValue({
      userId: "user-1",
      branchId: BRANCH_B,
      branch: {
        id: BRANCH_B,
        businessId: "biz-B",
        name: "Other Business Branch",
      },
    } as never);

    const res = await request(app)
      .get("/api/v1/reports/dashboard")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
  });
});

describe("Reports routes - authorization", () => {
  it("STAFF cannot view reports without reports.view permission", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .get("/api/v1/reports/dashboard")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });

  it("BRANCH_MANAGER can view reports", async () => {
    allowBranch("user-mgr-a", BRANCH_A, "biz-A");
    mockReportData();

    const res = await request(app)
      .get("/api/v1/reports/dashboard")
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
  });

  it("BUSINESS_OWNER can view reports", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    mockReportData();

    const res = await request(app)
      .get("/api/v1/reports/dashboard")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
  });

  it("rejects the request when reports.view is explicitly denied", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    findRoleOverride.mockResolvedValue({
      id: "override-1",
      businessId: "biz-A",
      role: "STAFF",
      permissionId: "permission-reports.view",
      allowed: false,
    } as never);

    const res = await request(app)
      .get("/api/v1/reports/dashboard")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });
});

describe("Reports routes - filtering and isolation", () => {
  it("passes the requested date range to the report service", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    mockReportData();

    const res = await request(app)
      .get("/api/v1/reports/dashboard")
      .query({
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-07T23:59:59.999Z",
      })
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(orderCount).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        branchId: BRANCH_A,
        createdAt: {
          gte: new Date("2026-09-01T00:00:00.000Z"),
          lte: new Date("2026-09-07T23:59:59.999Z"),
        },
      },
    });
  });

  it("keeps every report query scoped to the authenticated business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    mockReportData();

    const res = await request(app)
      .get("/api/v1/reports/dashboard")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(invoiceCount).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        branchId: BRANCH_A,
      },
    });

    expect(paymentAggregate).toHaveBeenNthCalledWith(1, {
      where: {
        businessId: "biz-A",
        branchId: BRANCH_A,
        status: "POSTED",
        type: "PAYMENT",
      },
      _sum: {
        amount: true,
      },
    });

    expect(inventoryMovementCount).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        branchId: BRANCH_A,
      },
    });
  });

  it("rejects an invalid date range", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .get("/api/v1/reports/dashboard")
      .query({
        from: "2026-09-07T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
      })
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(422);
  });
});
