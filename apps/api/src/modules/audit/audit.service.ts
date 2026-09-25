import { prisma } from "../../lib/prisma.js";

const SUSPICIOUS_ACTIVITY_ACTIONS = [
  "user.login",
  "user.password_reset_requested",
  "user.password_reset_completed",
  "permission.role.updated",
  "permission.role.removed",
  "permission.user.allow_all",
  "permission.user.disallow_all",
  "permission.user.updated",
  "permission.user.removed",
  "user.created",
  "user.updated",
  "user.deleted",
  "payment.voided",
  "backup.exported",
  "backup.restored",
  "migration.analyzed",
  "subscription.payment.verified",
  "subscription.payment_intent.reconciled",
] as const;

export type SuspiciousActivityRecord = {
  id: string;
  timestamp: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  metadata: unknown;
  correlationId: string | null;
};

export async function listSuspiciousActivity(
  businessId: string,
  limit = 100,
): Promise<SuspiciousActivityRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  return prisma.auditLog.findMany({
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
      metadata: true,
      correlationId: true,
    },
  });
}

export { SUSPICIOUS_ACTIVITY_ACTIONS };
