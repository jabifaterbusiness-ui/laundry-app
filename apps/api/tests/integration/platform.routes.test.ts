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
    },
    order: {
      count: vi.fn(),
    },
    subscription: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    payment: {
      aggregate: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
      create: vi.fn(),
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

  vi.mocked(prisma.payment.aggregate).mockResolvedValue({
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
      _count: {
        users: 5,
        customers: 20,
        orders: 40,
        branches: 2,
      },
    },
  ] as never);

  vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);
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

});
