import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

/**
 * Keys that must never appear in audit metadata, matched case-insensitively
 * against the *whole* key (so "token" strips a "token" key but not a
 * "tokenType" key that just happens to contain the substring "token").
 * This is a defensive backstop, not the only line of defense - callers are
 * still responsible for not passing secrets into `metadata` in the first
 * place. See the LOCKED decision on AuditLog in prisma/schema.prisma.
 */
const FORBIDDEN_METADATA_KEYS = new Set([
  "password",
  "passwordhash",
  "accesstoken",
  "refreshtoken",
  "token",
  "tokenhash",
  "secret",
  "authorization",
]);

/**
 * Recursively strips forbidden keys from a metadata object/array so a
 * secret nested a few levels deep can't slip through. Returns a plain
 * JSON-serializable value (Prisma's `Json?` column accepts this directly).
 */
export function sanitizeAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditMetadata(item));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) {
        continue;
      }
      result[key] = sanitizeAuditMetadata(val);
    }
    return result;
  }

  return value;
}

export interface AuditEventInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  businessId?: string | null;
  branchId?: string | null;
  actorUserId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * The single write path for AuditLog rows (LOCKED decision - AuditLog is
 * foundation infrastructure that future business modules call into rather
 * than reimplementing). Never throws: an audit-logging failure must not
 * take down the request that triggered it, so failures are logged and
 * swallowed here rather than propagated.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    let actorName: string | undefined;
    if (input.actorUserId) {
      try {
        const actor = await prisma.user.findUnique({
          where: { id: input.actorUserId },
          select: { fullName: true },
        });
        actorName = actor?.fullName?.trim() || undefined;
      } catch (err) {
        // Actor enrichment is best-effort; the immutable actorUserId is still recorded.
        logger.warn({ err, actorUserId: input.actorUserId }, "Unable to resolve audit actor name");
      }
    }

    const existingReference = input.metadata?.reference;
    const hasExternalReference =
      typeof existingReference === "string" && existingReference.trim().length > 0;
    const metadata: Record<string, unknown> = {
      ...(input.metadata ?? {}),
      ...(actorName
        ? {
            authorizedBy: actorName,
            // Preserve a genuine external reference (e.g. bank/POS reference).
            // When none was supplied, use the authenticated authorizer's name.
            ...(!hasExternalReference ? { reference: actorName } : {}),
          }
        : {}),
    };

    await prisma.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        businessId: input.businessId ?? null,
        branchId: input.branchId ?? null,
        actorUserId: input.actorUserId ?? null,
        correlationId: input.correlationId ?? null,
        ...(Object.keys(metadata).length
          ? { metadata: sanitizeAuditMetadata(metadata) as object }
          : {}),
      },
    });
  } catch (err) {
    logger.error({ err, action: input.action, entityType: input.entityType }, "Failed to write audit log entry");
  }
}
