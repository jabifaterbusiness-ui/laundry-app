import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/modules/reports/annual-report.service.js", () => ({
  getAnnualReport: vi.fn().mockResolvedValue({
    period: {
      year: 2026,
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-12-31T23:59:59.999Z"),
    },
    currencyCode: "NGN",
    revenue: {
      grossInvoiced: 1000000,
      refunds: 50000,
      netRevenue: 950000,
    },
    expenses: {
      explicit: 200000,
      salary: 300000,
      total: 500000,
      byCategory: {
        RENT: 200000,
        SALARY: 300000,
      },
    },
    profitOrLoss: {
      amount: 450000,
      type: "PROFIT",
    },
    collection: {
      annualInvoiceCount: 10,
      annualInvoiceAmount: 1000000,
      annualCollectedAmount: 800000,
      annualOutstandingAmount: 200000,
      collectionRate: 80,
      yearEndOutstandingAmount: 200000,
    },
    outstandingByYearMonth: {},
    monthlyTrend: [],
    branchSummary: {},
    managementInsights: ["Collection performance was 80.0%."],
  }),
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
      }),
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
    order: {
      count: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
    },
    payment: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    customer: {
      count: vi.fn(),
    },
    branchResourceShare: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    inventoryStock: {
      count: vi.fn(),
    },
    inventoryMovement: {
      count: vi.fn(),
    },
    garment: {
      findMany: vi.fn(),
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
const invoiceFindMany = vi.mocked(prisma.invoice.findMany);
const paymentFindMany = vi.mocked(prisma.payment.findMany);
const paymentAggregate = vi.mocked(prisma.payment.aggregate);
const customerCount = vi.mocked(prisma.customer.count);
const inventoryStockCount = vi.mocked(prisma.inventoryStock.count);
const inventoryMovementCount = vi.mocked(prisma.inventoryMovement.count);
const garmentFindMany = vi.mocked(prisma.garment.findMany);
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
      securityRole: role,
      businessId,
    },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: "15m" },
  );
}

const OWNER_A = tokenFor("BUSINESS_OWNER", "biz-A");
const STAFF_A = tokenFor("STAFF", "biz-A", "user-staff-a");
const MANAGER_A = tokenFor("BRANCH_MANAGER", "biz-A", "user-mgr-a");
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

  invoiceFindMany.mockResolvedValue([
    {
      id: "invoice-1",
      invoiceNumber: "000001",
      totalAmount: 500000,
      createdAt: new Date("2026-09-05T10:00:00.000Z"),
      status: "ISSUED",
      orderId: "order-1",
    },
  ] as never);

  paymentFindMany.mockResolvedValue([
    {
      invoiceId: "invoice-1",
      amount: 350000,
      type: "PAYMENT",
    },
  ] as never);

  paymentAggregate.mockResolvedValue({
    _sum: {
      amount: 25000,
    },
  } as never);

  customerCount.mockResolvedValue(40);
  inventoryStockCount.mockResolvedValue(8);
  inventoryMovementCount.mockResolvedValue(20);

  garmentFindMany.mockResolvedValue([
    {
      id: "garment-1",
      status: "PICKED_UP",
      orderId: "order-1",
      pickedUpAt: new Date("2026-09-06T10:00:00.000Z"),
      createdAt: new Date("2026-09-05T10:00:00.000Z"),
    },
  ] as never);
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
  vi.mocked(prisma.branchResourceShare.findMany).mockResolvedValue([] as never);
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

describe("Reports routes - annual report", () => {
  it("BUSINESS_OWNER can access the annual report for the active branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    const res = await request(app)
      .get("/api/v1/reports/annual?year=2026")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.period.year).toBe(2026);
    expect(res.body.revenue.netRevenue).toBe(950000);
    expect(res.body.collection.collectionRate).toBe(80);
  });

  it("STAFF cannot access the annual report without reports.view permission", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");
    const res = await request(app)
      .get("/api/v1/reports/annual?year=2026")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });

  it("rejects an invalid annual report year", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    const res = await request(app)
      .get("/api/v1/reports/annual?year=abc")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(422);
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
    findUserOverride.mockResolvedValue({ allowed: true } as never);
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
  it("passes the requested date range to the current report queries", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    mockReportData();

    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-07T23:59:59.999Z");

    const res = await request(app)
      .get("/api/v1/reports/dashboard")
      .query({
        from: from.toISOString(),
        to: to.toISOString(),
      })
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(orderCount).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        branchId: BRANCH_A,
        createdAt: {
          gte: from,
          lte: to,
        },
      },
    });

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
          status: "ISSUED",
          createdAt: {
            gte: from,
            lte: to,
          },
        },
      }),
    );
  });

  it("keeps report queries scoped to the authenticated business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    mockReportData();

    const res = await request(app)
      .get("/api/v1/reports/dashboard")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          status: "ISSUED",
        }),
      }),
    );

    expect(paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          status: "POSTED",
          invoiceId: { in: ["invoice-1"] },
        }),
      }),
    );

    expect(paymentAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          status: "POSTED",
          type: "REFUND",
        }),
      }),
    );

    expect(customerCount).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        isActive: true,
        OR: [
          { ownerBranchId: null },
          { ownerBranchId: { in: [BRANCH_A] } },
          { id: { in: [] } },
        ],
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

describe("Reports routes - collection statement", () => {
  it("allows an authorized user to access the collection statement", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    mockReportData();

    const res = await request(app)
      .get("/api/v1/reports/collection-statement")
      .query({
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-30T23:59:59.999Z",
      })
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.invoices).toBeDefined();
    expect(res.body.pickup).toBeDefined();
    expect(res.body.managementInsights).toBeDefined();
  });

  it("protects the collection statement with reports.view", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .get("/api/v1/reports/collection-statement")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });
});
