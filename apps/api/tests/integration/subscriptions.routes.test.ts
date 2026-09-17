import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    subscriptionPlanPrice: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../src/modules/auth/auth.middleware.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      id: "owner-1",
      email: "owner@example.com",
      role: req.headers["x-test-role"] ?? "BUSINESS_OWNER",
      businessId: req.headers["x-test-business-id"] ?? "biz-A",
    };
    next();
  },
  requireBusinessContext: (_req: any, _res: any, next: any) => next(),
}));

const app = createApp();

const findUnique = vi.mocked(prisma.subscription.findUnique);
const update = vi.mocked(prisma.subscription.update);
const upsert = vi.mocked(prisma.subscription.upsert);
const businessFindUnique = vi.mocked(prisma.business.findUnique);
const subscriptionPlanPriceFindMany = vi.mocked(
  prisma.subscriptionPlanPrice.findMany,
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("subscriptions routes", () => {
  it("returns the authenticated business subscription", async () => {
    const subscription = {
      id: "sub-1",
      businessId: "biz-A",
      plan: "MONTHLY",
      status: "ACTIVE",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      endsAt: new Date("2026-10-01T00:00:00.000Z"),
    };

    findUnique.mockResolvedValue(subscription as never);

    const response = await request(app)
      .get("/api/v1/subscriptions")
      .set("x-test-business-id", "biz-A");

    expect(response.status).toBe(200);
    expect(response.body.businessId).toBe("biz-A");
    expect(findUnique).toHaveBeenCalledWith({
      where: { businessId: "biz-A" },
    });
  });

  it("returns subscription prices for the authenticated business owner", async () => {
    businessFindUnique.mockResolvedValue({
      countryCode: "NG",
      currencyCode: "NGN",
    } as never);

    subscriptionPlanPriceFindMany.mockResolvedValue([
      {
        id: "price-monthly-ngn",
        plan: "MONTHLY",
        countryCode: "NG",
        currencyCode: "NGN",
        amount: 5000,
        isActive: true,
      },
      {
        id: "price-yearly-ngn",
        plan: "YEARLY",
        countryCode: "NG",
        currencyCode: "NGN",
        amount: 50000,
        isActive: true,
      },
    ] as never);

    const response = await request(app)
      .get("/api/v1/subscriptions/prices")
      .set("x-test-business-id", "biz-A");

    expect(response.status).toBe(200);
    expect(response.body.countryCode).toBe("NG");
    expect(response.body.currencyCode).toBe("NGN");
    expect(response.body.prices).toHaveLength(2);

    expect(businessFindUnique).toHaveBeenCalledWith({
      where: { id: "biz-A" },
      select: {
        countryCode: true,
        currencyCode: true,
      },
    });

    expect(subscriptionPlanPriceFindMany).toHaveBeenCalledWith({
      where: {
        platformConfigId:
          "00000000-0000-4000-8000-000000000001",
        countryCode: "NG",
        currencyCode: "NGN",
        isActive: true,
      },
      orderBy: { plan: "asc" },
    });
  });

  it("rejects subscription prices for non-owners", async () => {
    const response = await request(app)
      .get("/api/v1/subscriptions/prices")
      .set("x-test-role", "STAFF")
      .set("x-test-business-id", "biz-A");

    expect(response.status).toBe(403);
    expect(businessFindUnique).not.toHaveBeenCalled();
    expect(subscriptionPlanPriceFindMany).not.toHaveBeenCalled();
  });

  it("does not expose direct subscription activation to business owners", async () => {
    const response = await request(app)
      .post("/api/v1/subscriptions")
      .set("x-test-business-id", "biz-A")
      .send({
        plan: "YEARLY",
      });

    expect(response.status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("does not expose direct subscription activation to non-owners", async () => {
    const response = await request(app)
      .post("/api/v1/subscriptions")
      .set("x-test-role", "STAFF")
      .set("x-test-business-id", "biz-A")
      .send({ plan: "MONTHLY" });

    expect(response.status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("cannot access subscriptions without a business context", async () => {
    const response = await request(app)
      .get("/api/v1/subscriptions")
      .set("x-test-business-id", "");

    expect(response.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
