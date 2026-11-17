import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";

const CALLING_CONFIG_ID = "00000000-0000-4000-8000-000000000002";

async function ensureCallingConfig() {
  return prisma.platformCallingConfig.upsert({
    where: { id: CALLING_CONFIG_ID },
    update: {},
    create: { id: CALLING_CONFIG_ID },
  });
}

export async function getPlatformCallingAccess() {
  const [config, businesses] = await Promise.all([
    ensureCallingConfig(),
    prisma.business.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, slug: true, isActive: true, archivedAt: true,
        callingAccess: { select: { granted: true, grantedAt: true, revokedAt: true, updatedAt: true } },
      },
    }),
  ]);
  const endpointConfigured = Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  return {
    globallyEnabled: config.globallyEnabled,
    grantNewBusinesses: config.grantNewBusinesses,
    endpointConfigured,
    serverUrlConfigured: Boolean(process.env.LIVEKIT_URL),
    businesses: businesses.map(({ callingAccess, ...business }) => ({
      ...business,
      callingAccess: callingAccess ?? { granted: false, grantedAt: null, revokedAt: null, updatedAt: null },
    })),
  };
}

export async function setPlatformCallingGlobal(enabled: boolean, actorUserId: string, correlationId?: string) {
  const current = await ensureCallingConfig();
  const updated = await prisma.platformCallingConfig.update({ where: { id: CALLING_CONFIG_ID }, data: { globallyEnabled: enabled } });
  await recordAuditEvent({
    action: enabled ? "platform.calling.globally_enabled" : "platform.calling.globally_disabled",
    entityType: "PlatformCallingConfig", entityId: CALLING_CONFIG_ID, actorUserId,
    ...(correlationId ? { correlationId } : {}),
    metadata: { previousValue: current.globallyEnabled, enabled },
  });
  return { globallyEnabled: updated.globallyEnabled, grantNewBusinesses: updated.grantNewBusinesses };
}

export async function setPlatformCallingGrants(input: { mode: "ALL" | "SELECTED"; granted: boolean; businessIds?: string[] }, actorUserId: string, correlationId?: string) {
  const ids = input.mode === "ALL"
    ? (await prisma.business.findMany({ select: { id: true } })).map((business) => business.id)
    : Array.from(new Set(input.businessIds ?? []));
  if (ids.length === 0) throw new AppError("No businesses were found for this access change.", 404);
  if (input.mode === "SELECTED") {
    const count = await prisma.business.count({ where: { id: { in: ids } } });
    if (count !== ids.length) throw new AppError("One or more selected businesses could not be found.", 404);
  }
  const now = new Date();
  await prisma.$transaction(ids.map((businessId) => prisma.businessCallingAccess.upsert({
    where: { businessId },
    update: { granted: input.granted, grantedAt: input.granted ? now : undefined, revokedAt: input.granted ? null : now, updatedByUserId: actorUserId },
    create: { businessId, granted: input.granted, grantedAt: input.granted ? now : null, revokedAt: input.granted ? null : now, updatedByUserId: actorUserId },
  })));
  await recordAuditEvent({
    action: input.granted ? "platform.calling.business_access_granted" : "platform.calling.business_access_revoked",
    entityType: "BusinessCallingAccess", entityId: input.mode === "ALL" ? "ALL" : ids.join(","), actorUserId,
    ...(correlationId ? { correlationId } : {}),
    metadata: { mode: input.mode, granted: input.granted, businessIds: ids, affectedCount: ids.length },
  });
  return { mode: input.mode, granted: input.granted, affectedCount: ids.length, businessIds: ids };
}
