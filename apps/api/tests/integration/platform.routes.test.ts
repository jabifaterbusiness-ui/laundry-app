import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      count: vi.fn(),
    },
    customer: {
      count: vi.fn(),
    },
    order: {
      count: vi.fn(),
    },
    subscription: {
      findMany: vi.fn(),
    },
    payment: {
      aggregate: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
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
});
