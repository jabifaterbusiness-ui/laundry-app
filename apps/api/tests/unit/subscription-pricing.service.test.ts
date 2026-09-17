import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    subscriptionPlanPrice: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn(),
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import {
  getSubscriptionPrice,
  listSubscriptionPrices,
  setSubscriptionPriceActive,
  upsertSubscriptionPrice,
} from "../../src/modules/subscriptions/subscription-pricing.service.js";

const findFirst = vi.mocked(prisma.subscriptionPlanPrice.findFirst);
const findMany = vi.mocked(prisma.subscriptionPlanPrice.findMany);
const upsert = vi.mocked(prisma.subscriptionPlanPrice.upsert);
const findUnique = vi.mocked(prisma.subscriptionPlanPrice.findUnique);
const update = vi.mocked(prisma.subscriptionPlanPrice.update);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("subscription pricing service", () => {
  it("returns the active price for a normalized country and currency", async () => {
    const price = {
      id: "price-1",
      platformConfigId: "00000000-0000-4000-8000-000000000001",
      plan: "MONTHLY",
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 5000,
      isActive: true,
    };

    findFirst.mockResolvedValue(price as never);

    await expect(
      getSubscriptionPrice("MONTHLY", " ng ", "ngn"),
    ).resolves.toEqual(price);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        platformConfigId: "00000000-0000-4000-8000-000000000001",
        plan: "MONTHLY",
        countryCode: "NG",
        currencyCode: "NGN",
        isActive: true,
      },
    });
  });

  it("rejects when no active price is configured", async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      getSubscriptionPrice("YEARLY", "NG", "NGN"),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("lists all prices owned by the LaundryAngel platform config", async () => {
    findMany.mockResolvedValue([] as never);

    await listSubscriptionPrices();

    expect(findMany).toHaveBeenCalledWith({
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

  it("upserts a normalized price and records an audit event", async () => {
    const price = {
      id: "price-1",
      platformConfigId: "00000000-0000-4000-8000-000000000001",
      plan: "WEEKLY",
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 1500,
      isActive: true,
    };

    upsert.mockResolvedValue(price as never);

    await expect(
      upsertSubscriptionPrice(
        {
          plan: "WEEKLY",
          countryCode: " ng ",
          currencyCode: "ngn",
          amount: 1500,
        },
        "owner-1",
        "corr-1",
      ),
    ).resolves.toEqual(price);

    expect(upsert).toHaveBeenCalledWith({
      where: {
        plan_countryCode_currencyCode: {
          plan: "WEEKLY",
          countryCode: "NG",
          currencyCode: "NGN",
        },
      },
      create: {
        platformConfigId: "00000000-0000-4000-8000-000000000001",
        plan: "WEEKLY",
        countryCode: "NG",
        currencyCode: "NGN",
        amount: 1500,
        isActive: true,
      },
      update: {
        amount: 1500,
        isActive: true,
      },
    });

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "subscription.pricing.updated",
        entityType: "SubscriptionPlanPrice",
        entityId: "price-1",
        actorUserId: "owner-1",
        correlationId: "corr-1",
      }),
    );
  });

  it("rejects zero or negative prices", async () => {
    await expect(
      upsertSubscriptionPrice(
        {
          plan: "MONTHLY",
          countryCode: "NG",
          currencyCode: "NGN",
          amount: 0,
        },
        "owner-1",
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(upsert).not.toHaveBeenCalled();
  });

  it("updates price activation status and audits the change", async () => {
    const existing = {
      id: "price-1",
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

    findUnique.mockResolvedValue(existing as never);
    update.mockResolvedValue(updated as never);

    await expect(
      setSubscriptionPriceActive("price-1", false, "owner-1"),
    ).resolves.toEqual(updated);

    expect(update).toHaveBeenCalledWith({
      where: { id: "price-1" },
      data: { isActive: false },
    });

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "subscription.pricing.status_updated",
        entityId: "price-1",
        actorUserId: "owner-1",
      }),
    );
  });
});
