import { prisma } from "../../lib/prisma.js";

const SUSPICIOUS_ACTIVITY_ACTIONS = [
  // Security / authentication
  "user.login",
  "user.logout",
  "user.password_reset_requested",
  "user.password_reset_completed",

  // User lifecycle
  "user.created",
  "user.updated",
  "user.deleted",
  "user.deactivated",

  // Permissions
  "permission.role.updated",
  "permission.role.removed",
  "permission.user.allow_all",
  "permission.user.disallow_all",
  "permission.user.updated",
  "permission.user.removed",

  // Invoice corrections
  "invoice.updated",
  "invoice.deleted",
  "invoice.transferred",
  "invoice.voided",
  "order.invoice_edited",

  // Customer / order transfer
  "order.customer_transferred",

  // Financial
  "payment.voided",

  // Inventory
  "inventory.stock_adjusted",

  // Backup / recovery
  "backup.exported",
  "backup.restored",

  // Quick operations
  "quick_operation.executed",

  // Subscription / platform financial events
  "subscription.payment.verified",
  "subscription.payment_intent.reconciled",

  // System
  "migration.analyzed",
] as const;

export type SuspiciousActivityRecord = {
  id: string;
  timestamp: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  metadata: unknown;
  correlationId: string | null;
};

export async function listSuspiciousActivity(
  businessId: string,
  limit = 100,
): Promise<SuspiciousActivityRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  const records = await prisma.auditLog.findMany({
    where: {
      businessId,
      action: {
        in: [...SUSPICIOUS_ACTIVITY_ACTIONS],
      },
    },
    orderBy: {
      timestamp: "desc",
    },
    take: safeLimit,
    select: {
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
    },
  });

  return records.map(({ actor, ...record }) => ({
    ...record,
    actorName: actor?.fullName ?? null,
  }));
}

export { SUSPICIOUS_ACTIVITY_ACTIONS };
