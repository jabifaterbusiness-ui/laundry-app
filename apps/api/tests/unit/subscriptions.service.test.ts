
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import {
  createOrRenewSubscription,
  getSubscriptionStatus,
  getBusinessSubscription,
  requireActiveSubscription,
} from "../../src/modules/subscriptions/subscriptions.service.js";

const findUnique = vi.mocked(prisma.subscription.findUnique);
const update = vi.mocked(prisma.subscription.update);
const upsert = vi.mocked(prisma.subscription.upsert);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("subscription service", () => {
  it("marks a subscription active before its end date", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const endsAt = new Date("2026-10-01T00:00:00.000Z");

    expect(getSubscriptionStatus(endsAt, "ACTIVE", now)).toBe("ACTIVE");
  });

  it("marks a subscription expired at its end date", () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    const endsAt = new Date("2026-10-01T00:00:00.000Z");

    expect(getSubscriptionStatus(endsAt, "ACTIVE", now)).toBe("EXPIRED");
  });

  it("preserves an explicitly expired status", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const endsAt = new Date("2027-01-01T00:00:00.000Z");

    expect(getSubscriptionStatus(endsAt, "EXPIRED", now)).toBe("EXPIRED");
  });

  it("creates a monthly subscription for one month", async () => {
    const startsAt = new Date("2026-09-15T00:00:00.000Z");
    const subscription = {
      id: "sub-1",
      businessId: "biz-1",
      plan: "MONTHLY",
      status: "ACTIVE",
      startsAt,
      endsAt: new Date("2026-10-15T00:00:00.000Z"),
    };

    upsert.mockResolvedValue(subscription as never);

    await createOrRenewSubscription("biz-1", {
      plan: "MONTHLY",
      startsAt,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: "biz-1" },
        create: expect.objectContaining({
          businessId: "biz-1",
          plan: "MONTHLY",
          status: "ACTIVE",
          startsAt,
          endsAt: new Date("2026-10-15T00:00:00.000Z"),
        }),
      }),
    );
  });

  it("creates a yearly subscription for one year", async () => {
    const startsAt = new Date("2026-09-15T00:00:00.000Z");

    upsert.mockResolvedValue({} as never);

    await createOrRenewSubscription("biz-1", {
      plan: "YEARLY",
      startsAt,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          plan: "YEARLY",
          endsAt: new Date("2027-09-15T00:00:00.000Z"),
        }),
      }),
    );
  });

  it("extends an active subscription from its existing end date", async () => {
    const existing = {
      id: "sub-1",
      businessId: "biz-1",
      plan: "MONTHLY",
      status: "ACTIVE",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      endsAt: new Date("2026-10-01T00:00:00.000Z"),
    };

    findUnique.mockResolvedValue(existing as never);
    upsert.mockResolvedValue({} as never);

    await createOrRenewSubscription("biz-1", {
      plan: "YEARLY",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: "biz-1" },
        update: expect.objectContaining({
          plan: "YEARLY",
          status: "ACTIVE",
          startsAt: new Date("2026-10-01T00:00:00.000Z"),
          endsAt: new Date("2027-10-01T00:00:00.000Z"),
        }),
      }),
    );
  });

  it("starts an expired subscription from the requested future start date", async () => {
    const existing = {
      id: "sub-1",
      businessId: "biz-1",
      plan: "MONTHLY",
      status: "EXPIRED",
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date("2026-08-01T00:00:00.000Z"),
    };
    const requestedStart = new Date("2026-09-20T00:00:00.000Z");

    findUnique.mockResolvedValue(existing as never);
    upsert.mockResolvedValue({} as never);

    await createOrRenewSubscription("biz-1", {
      plan: "MONTHLY",
      startsAt: requestedStart,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          plan: "MONTHLY",
          status: "ACTIVE",
          startsAt: requestedStart,
          endsAt: new Date("2026-10-20T00:00:00.000Z"),
        }),
      }),
    );
  });

  it("refreshes an expired database status when the end date has passed", async () => {
    const expired = {
      id: "sub-1",
      businessId: "biz-1",
      plan: "MONTHLY",
      status: "ACTIVE",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      endsAt: new Date("2026-09-01T00:00:00.000Z"),
    };

    findUnique.mockResolvedValue(expired as never);
    update.mockResolvedValue({ ...expired, status: "EXPIRED" } as never);

    await getBusinessSubscription("biz-1");

    expect(update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { status: "EXPIRED" },
    });
  });

  it("rejects access when the subscription has expired", async () => {
    findUnique.mockResolvedValue({
      id: "sub-1",
      businessId: "biz-1",
      plan: "MONTHLY",
      status: "ACTIVE",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      endsAt: new Date("2026-09-01T00:00:00.000Z"),
    } as never);

    update.mockResolvedValue({
      id: "sub-1",
      businessId: "biz-1",
      plan: "MONTHLY",
      status: "EXPIRED",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      endsAt: new Date("2026-09-01T00:00:00.000Z"),
    } as never);

    await expect(requireActiveSubscription("biz-1")).rejects.toMatchObject({
      statusCode: 402,
    });
  });

  it("rejects access when no subscription exists", async () => {
    findUnique.mockResolvedValue(null);

    await expect(requireActiveSubscription("biz-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
