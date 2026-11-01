import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    business: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    branch: {
      findMany: vi.fn(),
    },
    customer: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    order: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    subscription: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    payment: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    subscriptionPayment: {
      aggregate: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    platformConfig: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    subscriptionPlanPrice: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import { createApp } from "../../src/app.js";

const app = createApp();

const PLATFORM_ADMIN = jwt.sign(
  {
    sub: "55555555-5555-4555-8555-555555555555",
    email: "platform@example.com",
    role: "PLATFORM_ADMIN",
    securityRole: "PLATFORM_ADMIN",
    businessId: null,
  },
  process.env.JWT_ACCESS_SECRET as string,
  { expiresIn: "15m" },
);

const OWNER_A = jwt.sign(
  {
    sub: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.com",
    role: "BUSINESS_OWNER",
    securityRole: "BUSINESS_OWNER",
    businessId: "biz-A",
  },
  process.env.JWT_ACCESS_SECRET as string,
  { expiresIn: "15m" },
);

const STAFF_A = jwt.sign(
  {
    sub: "33333333-3333-4333-8333-333333333333",
    email: "staff@example.com",
    role: "STAFF",
    securityRole: "STAFF",
    businessId: "biz-A",
  },
  process.env.JWT_ACCESS_SECRET as string,
  { expiresIn: "15m" },
);

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ ok: 1 }] as never);

  vi.mocked(prisma.business.count)
    .mockResolvedValueOnce(3)
    .mockResolvedValueOnce(2);

  vi.mocked(prisma.user.count).mockResolvedValue(12);
  vi.mocked(prisma.customer.count).mockResolvedValue(40);
  vi.mocked(prisma.order.count).mockResolvedValue(75);

  vi.mocked(prisma.subscription.findMany).mockResolvedValue([
    {
      status: "ACTIVE",
      endsAt: new Date("2099-01-01T00:00:00.000Z"),
    },
    {
      status: "EXPIRED",
      endsAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      status: "ACTIVE",
      endsAt: new Date("2020-01-01T00:00:00.000Z"),
    },
  ] as never);

  vi.mocked(prisma.subscriptionPayment.aggregate).mockResolvedValue({
    _sum: { amount: 150000 },
    _count: { _all: 25 },
  } as never);

  vi.mocked(prisma.business.findMany).mockResolvedValue([
    {
      id: "biz-A",
      name: "Laundry A",
      slug: "laundry-a",
      phone: null,
      email: "a@example.com",
      website: null,
      address: null,
      logoUrl: null,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      subscription: {
        id: "sub-A",
        plan: "MONTHLY",
        status: "ACTIVE",
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: new Date("2099-01-01T00:00:00.000Z"),
      },
      users: [{ fullName: "Owner A", email: "owner@a.example" }],
      _count: {
        users: 5,
        customers: 20,
        orders: 40,
        branches: 2,
      },
    },
  ] as never);

  vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);

  vi.mocked(prisma.platformConfig.upsert).mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
    allowNewBusinessRegistration: true,
    maintenanceMode: false,
    whatsappMessagingEnabled: true,
    automatedNotificationsEnabled: true,
    offlineSyncEnabled: true,
    version: 1,
    createdAt: new Date("2026-09-15T00:00:00.000Z"),
    updatedAt: new Date("2026-09-15T00:00:00.000Z"),
  } as never);

  vi.mocked(prisma.platformConfig.update).mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
    allowNewBusinessRegistration: false,
    maintenanceMode: true,
    whatsappMessagingEnabled: true,
    automatedNotificationsEnabled: false,
    offlineSyncEnabled: true,
    version: 2,
    createdAt: new Date("2026-09-15T00:00:00.000Z"),
    updatedAt: new Date("2026-09-15T00:01:00.000Z"),
  } as never);
});

describe("Platform Owner routes - subscription pricing", () => {
  it("lists subscription prices for PLATFORM_ADMIN", async () => {
    vi.mocked(prisma.subscriptionPlanPrice.findMany).mockResolvedValue([
      {
        id: "price-weekly-ngn",
        platformConfigId: "00000000-0000-4000-8000-000000000001",
        plan: "WEEKLY",
        countryCode: "NG",
        currencyCode: "NGN",
        amount: 1500,
        isActive: true,
        createdAt: new Date("2026-09-17T00:00:00.000Z"),
        updatedAt: new Date("2026-09-17T00:00:00.000Z"),
      },
    ] as never);

    const response = await request(app)
      .get("/api/v1/platform/subscription-prices")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        plan: "WEEKLY",
        countryCode: "NG",
        currencyCode: "NGN",
        amount: 1500,
        isActive: true,
      }),
    );

    expect(prisma.subscriptionPlanPrice.findMany).toHaveBeenCalledWith({
      where: {
        platformConfigId: "00000000-0000-4000-8000-000000000001",
      },
      orderBy: [
        { countryCode: "asc" },
        { currencyCode: "asc" },
        { plan: "asc" },
      ],
    });
  });

  it("creates or updates a subscription price for PLATFORM_ADMIN", async () => {
    const price = {
      id: "price-monthly-ngn",
      platformConfigId: "00000000-0000-4000-8000-000000000001",
      plan: "MONTHLY",
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 5000,
      isActive: true,
      createdAt: new Date("2026-09-17T00:00:00.000Z"),
      updatedAt: new Date("2026-09-17T00:00:00.000Z"),
    };

    vi.mocked(prisma.subscriptionPlanPrice.upsert).mockResolvedValue(
      price as never,
    );

    const response = await request(app)
      .post("/api/v1/platform/subscription-prices")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .send({
        plan: "MONTHLY",
        countryCode: " ng ",
        currencyCode: "ngn",
        amount: 5000,
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        plan: "MONTHLY",
        countryCode: "NG",
        currencyCode: "NGN",
        amount: 5000,
        isActive: true,
      }),
    );

    expect(prisma.subscriptionPlanPrice.upsert).toHaveBeenCalledWith({
      where: {
        plan_countryCode_currencyCode: {
          plan: "MONTHLY",
          countryCode: "NG",
          currencyCode: "NGN",
        },
      },
      create: {
        platformConfigId: "00000000-0000-4000-8000-000000000001",
        plan: "MONTHLY",
        countryCode: "NG",
        currencyCode: "NGN",
        amount: 5000,
        isActive: true,
      },
      update: {
        amount: 5000,
        isActive: true,
      },
    });
  });

  it("enables or disables an existing subscription price", async () => {
    const existing = {
      id: "price-yearly-ngn",
      platformConfigId: "00000000-0000-4000-8000-000000000001",
      plan: "YEARLY",
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 50000,
      isActive: true,
    };

    const updated = {
      ...existing,
      isActive: false,
    };

    vi.mocked(prisma.subscriptionPlanPrice.findUnique).mockResolvedValue(
      existing as never,
    );
    vi.mocked(prisma.subscriptionPlanPrice.update).mockResolvedValue(
      updated as never,
    );

    const response = await request(app)
      .patch("/api/v1/platform/subscription-prices/price-yearly-ngn/status")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .send({ isActive: false });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: "price-yearly-ngn",
        isActive: false,
      }),
    );

    expect(prisma.subscriptionPlanPrice.update).toHaveBeenCalledWith({
      where: { id: "price-yearly-ngn" },
      data: { isActive: false },
    });
  });

  it("deletes an inactive subscription price for PLATFORM_ADMIN", async () => {
    const existing = {
      id: "price-old-ngn",
      platformConfigId: "00000000-0000-4000-8000-000000000001",
      plan: "MONTHLY",
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 5000,
      isActive: false,
    };

    vi.mocked(prisma.subscriptionPlanPrice.findUnique).mockResolvedValue(
      existing as never,
    );
    vi.mocked(prisma.subscriptionPlanPrice.delete).mockResolvedValue(
      existing as never,
    );

    const response = await request(app)
      .delete("/api/v1/platform/subscription-prices/price-old-ngn")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: "price-old-ngn",
      deleted: true,
    });

    expect(prisma.subscriptionPlanPrice.delete).toHaveBeenCalledWith({
      where: { id: "price-old-ngn" },
    });
  });

  it("rejects deleting an active subscription price", async () => {
    const existing = {
      id: "price-active-ngn",
      platformConfigId: "00000000-0000-4000-8000-000000000001",
      plan: "MONTHLY",
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 5000,
      isActive: true,
    };

    vi.mocked(prisma.subscriptionPlanPrice.findUnique).mockResolvedValue(
      existing as never,
    );

    const response = await request(app)
      .delete("/api/v1/platform/subscription-prices/price-active-ngn")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message: "Deactivate the subscription price before deleting it",
        }),
      }),
    );
    expect(prisma.subscriptionPlanPrice.delete).not.toHaveBeenCalled();
  });

  it("rejects deleting a subscription price outside the platform configuration", async () => {
    const existing = {
      id: "price-other-platform",
      platformConfigId: "another-platform-config",
      plan: "MONTHLY",
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 5000,
      isActive: false,
    };

    vi.mocked(prisma.subscriptionPlanPrice.findUnique).mockResolvedValue(
      existing as never,
    );

    const response = await request(app)
      .delete("/api/v1/platform/subscription-prices/price-other-platform")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message: "Subscription price not found",
        }),
      }),
    );
    expect(prisma.subscriptionPlanPrice.delete).not.toHaveBeenCalled();
  });

  it("rejects BUSINESS_OWNER from subscription pricing administration", async () => {
    const response = await request(app)
      .get("/api/v1/platform/subscription-prices")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(response.status).toBe(403);
    expect(prisma.subscriptionPlanPrice.findMany).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated subscription pricing administration", async () => {
    const response = await request(app).get(
      "/api/v1/platform/subscription-prices",
    );

    expect(response.status).toBe(401);
    expect(prisma.subscriptionPlanPrice.findMany).not.toHaveBeenCalled();
  });
});

describe("Platform Owner routes - health", () => {
  it("returns healthy platform status to PLATFORM_ADMIN", async () => {
    const response = await request(app)
      .get("/api/v1/platform/health")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: "healthy",
        api: "healthy",
        database: "healthy",
        env: "test",
      }),
    );
    expect(response.body.checkedAt).toEqual(expect.any(String));
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it("returns degraded status when the database health check fails", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const response = await request(app)
      .get("/api/v1/platform/health")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(503);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: "degraded",
        api: "healthy",
        database: "unhealthy",
        env: "test",
      }),
    );
  });

  it("rejects tenant users from platform health", async () => {
    const response = await request(app)
      .get("/api/v1/platform/health")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(response.status).toBe(403);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("Platform Owner routes - security boundary", () => {
  it("rejects unauthenticated platform access", async () => {
    const response = await request(app).get("/api/v1/platform/overview");

    expect(response.status).toBe(401);
  });

  it("allows PLATFORM_ADMIN without business context", async () => {
    const response = await request(app)
      .get("/api/v1/platform/overview")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(200);
    expect(response.body.totals.businesses).toBe(3);
    expect(response.body.totals.activeBusinesses).toBe(2);
    expect(response.body.subscriptions.expired).toBe(2);
    expect(response.body.revenue).toEqual(
      expect.objectContaining({
        paymentCount: 25,
        totalCollected: 150000,
      }),
    );

    expect(prisma.subscriptionPayment.aggregate).toHaveBeenCalledWith({
      where: { status: "SUCCESSFUL" },
      _sum: { amount: true },
      _count: { _all: true },
    });
  });

  it("rejects BUSINESS_OWNER from platform access", async () => {
    const response = await request(app)
      .get("/api/v1/platform/overview")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(response.status).toBe(403);
    expect(prisma.business.count).not.toHaveBeenCalled();
  });

  it("rejects STAFF from platform access", async () => {
    const response = await request(app)
      .get("/api/v1/platform/overview")
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(response.status).toBe(403);
    expect(prisma.business.count).not.toHaveBeenCalled();
  });
});

describe("Platform Owner routes - revenue analytics", () => {
  it("returns platform-wide posted payment, refund, net, and method analytics", async () => {
    vi.mocked(prisma.payment.groupBy)
      .mockResolvedValueOnce([
        {
          type: "PAYMENT",
          _sum: { amount: 250000 },
          _count: { _all: 30 },
        },
        {
          type: "REFUND",
          _sum: { amount: 40000 },
          _count: { _all: 5 },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          method: "CASH",
          type: "PAYMENT",
          _sum: { amount: 100000 },
          _count: { _all: 12 },
        },
        {
          method: "CASH",
          type: "REFUND",
          _sum: { amount: 10000 },
          _count: { _all: 2 },
        },
        {
          method: "TRANSFER",
          type: "PAYMENT",
          _sum: { amount: 90000 },
          _count: { _all: 10 },
        },
        {
          method: "TRANSFER",
          type: "REFUND",
          _sum: { amount: 20000 },
          _count: { _all: 2 },
        },
        {
          method: "POS",
          type: "PAYMENT",
          _sum: { amount: 60000 },
          _count: { _all: 8 },
        },
        {
          method: "POS",
          type: "REFUND",
          _sum: { amount: 10000 },
          _count: { _all: 1 },
        },
      ] as never);

    vi.mocked(prisma.subscriptionPayment.aggregate).mockResolvedValue({
      _sum: { amount: 100 },
      _count: { _all: 1 },
    } as never);

    const response = await request(app)
      .get("/api/v1/platform/revenue")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        grossPayments: 250100,
        refunds: 40000,
        netCollected: 210100,
        paymentCount: 31,
        refundCount: 5,
        subscriptionPayments: {
          amount: 100,
          count: 1,
        },
        methodBreakdown: {
          CASH: {
            payments: 100000,
            refunds: 10000,
            net: 90000,
          },
          TRANSFER: {
            payments: 90000,
            refunds: 20000,
            net: 70000,
          },
          POS: {
            payments: 60000,
            refunds: 10000,
            net: 50000,
          },
          PAY_FROM_ACCOUNT: {
            payments: 0,
            refunds: 0,
            net: 0,
          },
        },
      }),
    );

    expect(response.body.generatedAt).toEqual(expect.any(String));
    expect(prisma.payment.groupBy).toHaveBeenCalledTimes(2);

    expect(prisma.payment.groupBy).toHaveBeenNthCalledWith(1, {
      by: ["type"],
      where: { status: "POSTED" },
      _sum: { amount: true },
      _count: { _all: true },
    });

    expect(prisma.payment.groupBy).toHaveBeenNthCalledWith(2, {
      by: ["method", "type"],
      where: { status: "POSTED" },
      _sum: { amount: true },
      _count: { _all: true },
    });

    expect(prisma.subscriptionPayment.aggregate).toHaveBeenCalledWith({
      where: { status: "SUCCESSFUL" },
      _sum: { amount: true },
      _count: { _all: true },
    });
  });

  it("rejects tenant users from platform revenue analytics", async () => {
    const response = await request(app)
      .get("/api/v1/platform/revenue")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(response.status).toBe(403);
    expect(prisma.payment.groupBy).not.toHaveBeenCalled();
    expect(prisma.subscriptionPayment.aggregate).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated revenue analytics access", async () => {
    const response = await request(app).get("/api/v1/platform/revenue");

    expect(response.status).toBe(401);
    expect(prisma.payment.groupBy).not.toHaveBeenCalled();
    expect(prisma.subscriptionPayment.aggregate).not.toHaveBeenCalled();
  });
});

describe("Platform Owner routes - growth analytics", () => {
  it("returns platform-wide monthly growth analytics", async () => {
    vi.mocked(prisma.business.findMany).mockResolvedValueOnce([
      { createdAt: new Date("2026-01-10T00:00:00.000Z") },
      { createdAt: new Date("2026-01-20T00:00:00.000Z") },
      { createdAt: new Date("2026-03-05T00:00:00.000Z") },
    ] as never);

    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { createdAt: new Date("2026-01-15T00:00:00.000Z") },
      { createdAt: new Date("2026-02-15T00:00:00.000Z") },
    ] as never);

    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      { createdAt: new Date("2026-02-01T00:00:00.000Z") },
      { createdAt: new Date("2026-02-20T00:00:00.000Z") },
    ] as never);

    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { createdAt: new Date("2026-03-01T00:00:00.000Z") },
      { createdAt: new Date("2026-03-02T00:00:00.000Z") },
      { createdAt: new Date("2026-03-03T00:00:00.000Z") },
    ] as never);

    const response = await request(app)
      .get("/api/v1/platform/growth")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(200);
    expect(response.body.businesses).toEqual({
      total: 3,
      monthly: [
        { month: "2026-01", count: 2 },
        { month: "2026-03", count: 1 },
      ],
    });
    expect(response.body.users).toEqual({
      total: 2,
      monthly: [
        { month: "2026-01", count: 1 },
        { month: "2026-02", count: 1 },
      ],
    });
    expect(response.body.customers).toEqual({
      total: 2,
      monthly: [{ month: "2026-02", count: 2 }],
    });
    expect(response.body.orders).toEqual({
      total: 3,
      monthly: [{ month: "2026-03", count: 3 }],
    });
    expect(response.body.generatedAt).toEqual(expect.any(String));
  });

  it("rejects tenant users from platform growth analytics", async () => {
    const response = await request(app)
      .get("/api/v1/platform/growth")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(response.status).toBe(403);
    expect(prisma.business.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});

describe("Platform Owner routes - global statistics", () => {
  it("returns platform-wide and country-level statistics", async () => {
    vi.mocked(prisma.business.findMany).mockResolvedValueOnce([
      {
        countryCode: "NG",
        isActive: true,
        _count: {
          users: 5,
          customers: 20,
          orders: 40,
          branches: 2,
        },
      },
      {
        countryCode: "NG",
        isActive: false,
        _count: {
          users: 2,
          customers: 8,
          orders: 12,
          branches: 1,
        },
      },
      {
        countryCode: "GB",
        isActive: true,
        _count: {
          users: 3,
          customers: 10,
          orders: 18,
          branches: 2,
        },
      },
    ] as never);

    const response = await request(app)
      .get("/api/v1/platform/global-statistics")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        totals: {
          businesses: 3,
          activeBusinesses: 2,
          inactiveBusinesses: 1,
          users: 10,
          customers: 38,
          orders: 70,
          branches: 5,
          countries: 2,
        },
        countries: [
          {
            countryCode: "NG",
            businesses: 2,
            activeBusinesses: 1,
            inactiveBusinesses: 1,
            users: 7,
            customers: 28,
            orders: 52,
            branches: 3,
          },
          {
            countryCode: "GB",
            businesses: 1,
            activeBusinesses: 1,
            inactiveBusinesses: 0,
            users: 3,
            customers: 10,
            orders: 18,
            branches: 2,
          },
        ],
        generatedAt: expect.any(String),
      }),
    );

    expect(prisma.business.findMany).toHaveBeenCalledWith({
      select: {
        countryCode: true,
        isActive: true,
        _count: {
          select: {
            users: true,
            customers: true,
            orders: true,
            branches: true,
          },
        },
      },
    });
  });

  it("rejects tenant users from global statistics", async () => {
    const response = await request(app)
      .get("/api/v1/platform/global-statistics")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(response.status).toBe(403);
    expect(prisma.business.findMany).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated global statistics access", async () => {
    const response = await request(app).get(
      "/api/v1/platform/global-statistics",
    );

    expect(response.status).toBe(401);
    expect(prisma.business.findMany).not.toHaveBeenCalled();
  });
});

describe("Platform Owner routes - company visibility", () => {
  it("returns platform-wide company directory only to PLATFORM_ADMIN", async () => {
    const response = await request(app)
      .get("/api/v1/platform/businesses")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        id: "biz-A",
        name: "Laundry A",
        isActive: true,
        owner: { fullName: "Owner A", email: "owner@a.example" },
        subscription: expect.objectContaining({
          plan: "MONTHLY",
          status: "ACTIVE",
        }),
        _count: expect.objectContaining({
          users: 5,
          customers: 20,
          orders: 40,
          branches: 2,
        }),
      }),
    );

    expect(prisma.business.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});

describe("Platform Owner routes - company details", () => {
  it("returns detailed company information to PLATFORM_ADMIN", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz-A",
      name: "Laundry A",
      slug: "laundry-a",
      phone: "08000000000",
      email: "a@example.com",
      website: "https://laundry-a.example",
      address: "Enugu",
      logoUrl: null,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      subscription: {
        id: "sub-A",
        plan: "MONTHLY",
        status: "ACTIVE",
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: new Date("2099-01-01T00:00:00.000Z"),
      },
      _count: {
        users: 5,
        customers: 20,
        orders: 40,
        branches: 2,
        services: 12,
        invoices: 35,
        payments: 28,
      },
    } as never);

    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "user-A",
        fullName: "Owner A",
        email: "owner@example.com",
        role: "BUSINESS_OWNER",
        isActive: true,
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
      },
    ] as never);

    vi.mocked(prisma.branch.findMany).mockResolvedValue([
      {
        id: "branch-A",
        name: "Main Branch",
        isActive: true,
        createdAt: new Date("2026-01-04T00:00:00.000Z"),
        updatedAt: new Date("2026-01-05T00:00:00.000Z"),
      },
    ] as never);

    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      {
        id: new Date("2026-09-01T00:00:00.000Z"),
        timestamp: new Date("2026-09-01T00:00:00.000Z"),
        actorUserId: "user-A",
        action: "BUSINESS_BRANDING_UPDATED",
        entityType: "BUSINESS",
        entityId: "biz-A",
        metadata: { safe: true },
        correlationId: "request-A",
      },
    ] as never);

    const response = await request(app)
      .get("/api/v1/platform/businesses/biz-A")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: "biz-A",
        name: "Laundry A",
        isActive: true,
        subscription: expect.objectContaining({
          plan: "MONTHLY",
          status: "ACTIVE",
        }),
        _count: expect.objectContaining({
          users: 5,
          customers: 20,
          orders: 40,
          branches: 2,
          services: 12,
          invoices: 35,
          payments: 28,
        }),
        recentUsers: [
          expect.objectContaining({
            id: "user-A",
            fullName: "Owner A",
            role: "BUSINESS_OWNER",
          }),
        ],
        recentBranches: [
          expect.objectContaining({
            id: "branch-A",
            name: "Main Branch",
          }),
        ],
        recentAuditLogs: [
          expect.objectContaining({
            action: "BUSINESS_BRANDING_UPDATED",
            entityId: "biz-A",
          }),
        ],
      }),
    );

    expect(prisma.business.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "biz-A" },
      }),
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: "biz-A" },
        take: 10,
      }),
    );

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: "biz-A" },
        take: 10,
      }),
    );

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: "biz-A" },
        take: 20,
      }),
    );
  });

  it("returns 404 when the requested company does not exist", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const response = await request(app)
      .get("/api/v1/platform/businesses/missing-business")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe("Business not found");
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.branch.findMany).not.toHaveBeenCalled();
  });

  it("rejects tenant users from company details", async () => {
    const response = await request(app)
      .get("/api/v1/platform/businesses/biz-A")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(response.status).toBe(403);
    expect(prisma.business.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.branch.findMany).not.toHaveBeenCalled();
  });
});

describe("Platform Owner routes - company status controls", () => {
  it("deactivates an active company for PLATFORM_ADMIN and audits the action", async () => {
    vi.mocked(prisma.business.findUnique)
      .mockResolvedValueOnce({
        id: "biz-A",
        name: "Laundry A",
        isActive: true,
      } as never)
      .mockResolvedValueOnce({
        id: "biz-A",
        name: "Laundry A",
        slug: "laundry-a",
        phone: null,
        email: "a@example.com",
        website: null,
        address: null,
        logoUrl: null,
        isActive: false,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-15T00:00:00.000Z"),
      } as never);

    vi.mocked(prisma.business.update).mockResolvedValue({
      id: "biz-A",
      name: "Laundry A",
      isActive: false,
    } as never);

    const response = await request(app)
      .post("/api/v1/platform/businesses/biz-A/deactivate")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: "biz-A",
        name: "Laundry A",
        isActive: false,
      }),
    );

    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "biz-A" },
      data: { isActive: false },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "platform.business.deactivated",
        entityType: "Business",
        entityId: "biz-A",
        businessId: "biz-A",
        actorUserId: "55555555-5555-4555-8555-555555555555",
        metadata: expect.objectContaining({
          businessName: "Laundry A",
          isActive: false,
        }),
      }),
    });
  });

  it("activates an inactive company for PLATFORM_ADMIN and audits the action", async () => {
    vi.mocked(prisma.business.findUnique)
      .mockResolvedValueOnce({
        id: "biz-A",
        name: "Laundry A",
        isActive: false,
      } as never)
      .mockResolvedValueOnce({
        id: "biz-A",
        name: "Laundry A",
        slug: "laundry-a",
        phone: null,
        email: "a@example.com",
        website: null,
        address: null,
        logoUrl: null,
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-15T00:00:00.000Z"),
      } as never);

    vi.mocked(prisma.business.update).mockResolvedValue({
      id: "biz-A",
      name: "Laundry A",
      isActive: true,
    } as never);

    const response = await request(app)
      .post("/api/v1/platform/businesses/biz-A/activate")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: "biz-A",
        name: "Laundry A",
        isActive: true,
      }),
    );

    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "biz-A" },
      data: { isActive: true },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "platform.business.activated",
        entityType: "Business",
        entityId: "biz-A",
        businessId: "biz-A",
        actorUserId: "55555555-5555-4555-8555-555555555555",
        metadata: expect.objectContaining({
          businessName: "Laundry A",
          isActive: true,
        }),
      }),
    });
  });

  it("rejects redundant deactivation", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz-A",
      name: "Laundry A",
      isActive: false,
    } as never);

    const response = await request(app)
      .post("/api/v1/platform/businesses/biz-A/deactivate")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Business is already inactive");
    expect(prisma.business.update).not.toHaveBeenCalled();
  });

  it("rejects redundant activation", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz-A",
      name: "Laundry A",
      isActive: true,
    } as never);

    const response = await request(app)
      .post("/api/v1/platform/businesses/biz-A/activate")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Business is already active");
    expect(prisma.business.update).not.toHaveBeenCalled();
  });

  it("returns 404 when changing status of a nonexistent company", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const response = await request(app)
      .post("/api/v1/platform/businesses/missing-business/deactivate")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe("Business not found");
    expect(prisma.business.update).not.toHaveBeenCalled();
  });

  it("rejects tenant users from company status controls", async () => {
    const response = await request(app)
      .post("/api/v1/platform/businesses/biz-A/deactivate")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(response.status).toBe(403);
    expect(prisma.business.findUnique).not.toHaveBeenCalled();
    expect(prisma.business.update).not.toHaveBeenCalled();
  });
});

describe("Platform Owner routes - audit visibility", () => {
  it("returns platform-wide audit logs to PLATFORM_ADMIN", async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      {
        id: new Date("2026-09-01T00:00:00.000Z"),
        timestamp: new Date("2026-09-01T00:00:00.000Z"),
        businessId: null,
        branchId: null,
        actorUserId: "55555555-5555-4555-8555-555555555555",
        action: "PLATFORM_VIEW",
        entityType: "PLATFORM",
        entityId: null,
        metadata: { safe: true },
        correlationId: "request-1",
      },
    ] as never);

    const response = await request(app)
      .get("/api/v1/platform/audit-logs?limit=50")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        orderBy: { timestamp: "desc" },
      }),
    );
  });

  it("rejects tenant users from platform audit logs", async () => {
    const response = await request(app)
      .get("/api/v1/platform/audit-logs")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(response.status).toBe(403);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("renews a company subscription for PLATFORM_ADMIN and audits the action", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz-A",
      name: "Laundry A",
    } as never);

    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      id: "sub-A",
      businessId: "biz-A",
      plan: "MONTHLY",
      status: "ACTIVE",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      endsAt: new Date("2026-10-01T00:00:00.000Z"),
    } as never);

    vi.mocked(prisma.subscription.upsert).mockResolvedValue({
      id: "sub-A",
      businessId: "biz-A",
      plan: "YEARLY",
      status: "ACTIVE",
      startsAt: new Date("2026-10-01T00:00:00.000Z"),
      endsAt: new Date("2027-10-01T00:00:00.000Z"),
    } as never);

    const response = await request(app)
      .post("/api/v1/platform/businesses/biz-A/subscription")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .send({ plan: "YEARLY" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: "sub-A",
        businessId: "biz-A",
        plan: "YEARLY",
        status: "ACTIVE",
      }),
    );

    expect(prisma.business.findUnique).toHaveBeenCalledWith({
      where: { id: "biz-A" },
      select: {
        id: true,
        name: true,
      },
    });
    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: "biz-A" },
        update: expect.objectContaining({
          plan: "YEARLY",
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("returns 404 when a platform admin renews a nonexistent company", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const response = await request(app)
      .post("/api/v1/platform/businesses/missing-business/subscription")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .send({ plan: "MONTHLY" });

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe("Business not found");
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it("rejects tenant users from platform subscription controls", async () => {
    const response = await request(app)
      .post("/api/v1/platform/businesses/biz-A/subscription")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ plan: "MONTHLY" });

    expect(response.status).toBe(403);
    expect(prisma.business.findUnique).not.toHaveBeenCalled();
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });


describe("Platform Owner routes - configuration", () => {
  it("returns platform configuration to PLATFORM_ADMIN", async () => {
    const response = await request(app)
      .get("/api/v1/platform/configuration")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      allowNewBusinessRegistration: true,
      maintenanceMode: false,
      whatsappMessagingEnabled: true,
      automatedNotificationsEnabled: true,
      offlineSyncEnabled: true,
      version: 1,
    });

    expect(prisma.platformConfig.upsert).toHaveBeenCalledWith({
      where: {
        id: "00000000-0000-4000-8000-000000000001",
      },
      update: {},
      create: {
        id: "00000000-0000-4000-8000-000000000001",
      },
    });
  });

  it("updates platform configuration to PLATFORM_ADMIN", async () => {
    const response = await request(app)
      .patch("/api/v1/platform/configuration")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .send({
        maintenanceMode: true,
        automatedNotificationsEnabled: false,
        expectedVersion: 1,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      maintenanceMode: true,
      automatedNotificationsEnabled: false,
      version: 2,
    });

    expect(prisma.platformConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "00000000-0000-4000-8000-000000000001",
        },
        data: expect.objectContaining({
          maintenanceMode: true,
          automatedNotificationsEnabled: false,
          version: 2,
        }),
      }),
    );
  });

  it("rejects stale platform configuration updates", async () => {
    const response = await request(app)
      .patch("/api/v1/platform/configuration")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .send({
        maintenanceMode: true,
        expectedVersion: 99,
      });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe(
      "Platform configuration has changed. Refresh the configuration and try again.",
    );
    expect(prisma.platformConfig.update).not.toHaveBeenCalled();
  });

  it("rejects tenant users from platform configuration", async () => {
    const response = await request(app)
      .get("/api/v1/platform/configuration")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(response.status).toBe(403);
    expect(prisma.platformConfig.upsert).not.toHaveBeenCalled();
  });

  it("rejects an empty platform configuration update", async () => {
    const response = await request(app)
      .patch("/api/v1/platform/configuration")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .send({});

    expect(response.status).toBe(422);
    expect(response.body.error.message).toBe("Validation failed");
    expect(prisma.platformConfig.update).not.toHaveBeenCalled();
  });
});

});
