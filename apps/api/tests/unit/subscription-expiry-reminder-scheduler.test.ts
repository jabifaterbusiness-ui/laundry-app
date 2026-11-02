import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { processSubscriptionExpiryReminders } from "../../src/modules/subscriptions/subscription-expiry-reminder-scheduler.service.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    subscription: { findMany: vi.fn() },
    businessInboxMessage: { createMany: vi.fn() },
  },
}));

const subscriptionFindMany = vi.mocked(prisma.subscription.findMany);
const messageCreateMany = vi.mocked(prisma.businessInboxMessage.createMany);

describe("processSubscriptionExpiryReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageCreateMany.mockResolvedValue({ count: 1 } as never);
  });

  it("creates a durable, one-time inbox notice when a subscription has already expired", async () => {
    const now = new Date("2026-11-02T12:00:00.000Z");
    const endsAt = new Date("2026-10-30T12:00:00.000Z");
    subscriptionFindMany.mockResolvedValue([{
      id: "subscription-1",
      businessId: "business-1",
      endsAt,
      business: {
        name: "Ada Laundry",
        timezone: "Africa/Lagos",
        users: [{ id: "owner-1" }],
      },
    }] as never);

    const result = await processSubscriptionExpiryReminders(now);

    expect(subscriptionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { status: "ACTIVE", cancelAtPeriodEnd: false, endsAt: { lte: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000) } },
          { status: "EXPIRED", endsAt: { lte: now } },
        ],
      }),
    }));
    expect(messageCreateMany).toHaveBeenCalledOnce();
    const payload = vi.mocked(messageCreateMany).mock.calls[0]?.[0] as {
      data: Array<{ title: string; body: string; notificationKey: string; expiresAt: Date }>;
    };
    expect(payload.data[0]).toMatchObject({
      title: "Your LaundryAngel subscription has expired",
      notificationKey: "subscription-expired:subscription-1:owner-1",
    });
    expect(payload.data[0]?.body).toContain("expired on");
    expect(payload.data[0]?.body).toContain("Renew now");
    expect(payload.data[0]?.expiresAt.getTime()).toBeGreaterThan(endsAt.getTime());
    expect(result).toEqual({ subscriptionsScanned: 1, remindersCreated: 1 });
  });

  it("selects already-EXPIRED subscriptions so their owners receive the expiry notice", async () => {
    const now = new Date("2026-11-02T12:00:00.000Z");
    const endsAt = new Date("2026-10-30T12:00:00.000Z");
    subscriptionFindMany.mockResolvedValue([{
      id: "subscription-expired",
      businessId: "business-1",
      endsAt,
      business: { name: "Ada Laundry", timezone: "Africa/Lagos", users: [{ id: "owner-1" }] },
    }] as never);

    await processSubscriptionExpiryReminders(now);

    const query = vi.mocked(subscriptionFindMany).mock.calls[0]?.[0] as {
      where: { OR: Array<Record<string, unknown>> };
    };
    expect(query.where.OR).toContainEqual({ status: "EXPIRED", endsAt: { lte: now } });
    const payload = vi.mocked(messageCreateMany).mock.calls[0]?.[0] as {
      data: Array<{ title: string; notificationKey: string; expiresAt: Date }>;
    };
    expect(payload.data[0]).toMatchObject({
      title: "Your LaundryAngel subscription has expired",
      notificationKey: "subscription-expired:subscription-expired:owner-1",
    });
    expect(payload.data[0]?.expiresAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("keeps the pre-expiry reminder for subscriptions ending within five days", async () => {
    const now = new Date("2026-11-02T12:00:00.000Z");
    const endsAt = new Date("2026-11-04T12:00:00.000Z");
    subscriptionFindMany.mockResolvedValue([{
      id: "subscription-2",
      businessId: "business-1",
      endsAt,
      business: {
        name: "Ada Laundry",
        timezone: "Africa/Lagos",
        users: [{ id: "owner-1" }],
      },
    }] as never);

    await processSubscriptionExpiryReminders(now);

    const payload = vi.mocked(messageCreateMany).mock.calls[0]?.[0] as {
      data: Array<{ title: string; notificationKey: string }>;
    };
    expect(payload.data[0]?.title).toBe("Your LaundryAngel subscription is expiring soon");
    expect(payload.data[0]?.notificationKey).toContain("subscription-expiry:subscription-2:owner-1:");
  });
});
