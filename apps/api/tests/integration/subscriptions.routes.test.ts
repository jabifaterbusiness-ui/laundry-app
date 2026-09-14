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

  it("renews the authenticated business subscription as the owner", async () => {
    const subscription = {
      id: "sub-1",
      businessId: "biz-A",
      plan: "YEARLY",
      status: "ACTIVE",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      endsAt: new Date("2027-09-01T00:00:00.000Z"),
    };

    upsert.mockResolvedValue(subscription as never);

    const response = await request(app)
      .post("/api/v1/subscriptions")
      .set("x-test-business-id", "biz-A")
      .send({
        plan: "YEARLY",
        startsAt: "2026-09-01T00:00:00.000Z",
      });

    expect(response.status).toBe(200);
    expect(response.body.plan).toBe("YEARLY");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: "biz-A" },
        create: expect.objectContaining({
          businessId: "biz-A",
          plan: "YEARLY",
          status: "ACTIVE",
        }),
        update: expect.objectContaining({
          plan: "YEARLY",
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("rejects subscription changes from non-owners", async () => {
    const response = await request(app)
      .post("/api/v1/subscriptions")
      .set("x-test-role", "STAFF")
      .set("x-test-business-id", "biz-A")
      .send({ plan: "MONTHLY" });

    expect(response.status).toBe(403);
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
