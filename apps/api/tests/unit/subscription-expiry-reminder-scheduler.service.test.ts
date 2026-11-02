import { beforeEach, describe, expect, it, vi } from "vitest";
const { prismaMock, loggerMock } = vi.hoisted(() => ({
  prismaMock: {
    subscription: { findMany: vi.fn() },
    businessInboxMessage: { createMany: vi.fn() },
  },
  loggerMock: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("../../src/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../../src/lib/logger.js", () => ({ logger: loggerMock }));
import { processSubscriptionExpiryReminders } from "../../src/modules/subscriptions/subscription-expiry-reminder-scheduler.service.js";

describe("subscription expiry reminder scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.subscription.findMany.mockResolvedValue([]);
    prismaMock.businessInboxMessage.createMany.mockResolvedValue({ count: 0 });
  });

  it("creates one owner inbox reminder for an active subscription expiring within five days", async () => {
    const now = new Date("2026-11-01T10:00:00.000Z");
    prismaMock.subscription.findMany.mockResolvedValue([{
      id: "sub-1", businessId: "biz-1", endsAt: new Date("2026-11-04T10:00:00.000Z"),
      business: { name: "Laundry A", timezone: "Africa/Lagos", users: [{ id: "owner-1" }] },
    }]);
    prismaMock.businessInboxMessage.createMany.mockResolvedValue({ count: 1 });

    const result = await processSubscriptionExpiryReminders(now);

    expect(result).toEqual({ subscriptionsScanned: 1, remindersCreated: 1 });
    expect(prismaMock.subscription.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { status: "ACTIVE", cancelAtPeriodEnd: false, endsAt: { lte: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000) } },
          { status: "EXPIRED", endsAt: { lte: now } },
        ]),
      }),
    }));
    expect(prismaMock.businessInboxMessage.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: [expect.objectContaining({
        businessId: "biz-1", userId: "owner-1", sourceSubscriptionId: "sub-1",
        displayDurationMinutes: 10, createdByPlatformAdminId: "SYSTEM",
      })],
    }));
  });

  it("does not create renewal reminders for subscriptions scheduled to cancel", async () => {
    const now = new Date("2026-11-01T10:00:00.000Z");
    await processSubscriptionExpiryReminders(now);
    expect(prismaMock.subscription.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ status: "ACTIVE", cancelAtPeriodEnd: false }]),
      }),
    }));
  });

  it("does not create reminders when no active business owner is assigned", async () => {
    prismaMock.subscription.findMany.mockResolvedValue([{
      id: "sub-2", businessId: "biz-2", endsAt: new Date("2026-11-03T10:00:00.000Z"),
      business: { name: "Laundry B", timezone: "Africa/Lagos", users: [] },
    }]);
    const result = await processSubscriptionExpiryReminders(new Date("2026-11-01T10:00:00.000Z"));
    expect(result.remindersCreated).toBe(0);
    expect(prismaMock.businessInboxMessage.createMany).not.toHaveBeenCalled();
  });
});
