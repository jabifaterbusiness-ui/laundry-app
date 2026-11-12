import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    auditLog: {
      findMany,
    },
  },
}));

import {
  listSuspiciousActivity,
  SUSPICIOUS_ACTIVITY_ACTIONS,
} from "../../src/modules/audit/audit.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listSuspiciousActivity", () => {
  it("queries only the requested business and suspicious actions", async () => {
    const records = [
      {
        id: "audit-1",
        timestamp: new Date("2026-09-25T00:00:00.000Z"),
        action: "payment.voided",
        entityType: "Payment",
        entityId: "payment-1",
        actorUserId: "user-1",
        actorName: null,
        metadata: { reason: "test" },
        correlationId: "corr-1",
      },
    ];

    findMany.mockResolvedValue(records);

    await expect(
      listSuspiciousActivity("business-1", "branch-1", 100),
    ).resolves.toEqual(records);

    expect(findMany).toHaveBeenCalledOnce();

    const call = findMany.mock.calls[0]![0];

    expect(call.where).toEqual({
      businessId: "business-1",
      branchId: "branch-1",
      action: {
        in: [...SUSPICIOUS_ACTIVITY_ACTIONS],
      },
    });
    expect(call.orderBy).toEqual({ timestamp: "desc" });
    expect(call.take).toBe(100);
  });

  it("uses the complete suspicious activity action catalogue", async () => {
    findMany.mockResolvedValue([]);

    await listSuspiciousActivity("business-1", "branch-1");

    const call = findMany.mock.calls[0]![0];

    expect(call.where.action.in).toEqual([
      "user.login",
      "user.logout",
      "user.password_reset_requested",
      "user.password_reset_completed",
      "user.created",
      "user.updated",
      "user.deleted",
      "user.deactivated",
      "permission.role.updated",
      "permission.role.removed",
      "permission.user.allow_all",
      "permission.user.disallow_all",
      "permission.user.updated",
      "permission.user.removed",
      "invoice.updated",
      "invoice.deleted",
      "invoice.transferred",
      "invoice.voided",
      "order.invoice_edited",
      "order.customer_transferred",
      "payment.voided",
      "inventory.stock_adjusted",
      "backup.exported",
      "backup.restored",
      "quick_operation.executed",
      "subscription.payment.verified",
      "subscription.payment_intent.reconciled",
      "migration.analyzed",
    ]);
  });

  it("clamps the requested limit to the safe range", async () => {
    findMany.mockResolvedValue([]);

    await listSuspiciousActivity("business-1", "branch-1", 0);
    expect(findMany.mock.calls[0]![0].take).toBe(1);

    await listSuspiciousActivity("business-1", "branch-1", 999);
    expect(findMany.mock.calls[1]![0].take).toBe(200);
  });

  it("selects only fields needed by the protected activity centre", async () => {
    findMany.mockResolvedValue([]);

    await listSuspiciousActivity("business-1", "branch-1");

    const call = findMany.mock.calls[0]![0];

    expect(call.select).toEqual({
      id: true,
      timestamp: true,
      action: true,
      entityType: true,
      entityId: true,
      actorUserId: true,
      actor: {
        select: {
          fullName: true,
        },
      },
      metadata: true,
      correlationId: true,
    });
  });
});
