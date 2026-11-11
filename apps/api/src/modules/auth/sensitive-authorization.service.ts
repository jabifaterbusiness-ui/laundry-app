import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

const DEFAULT_SENSITIVE_INACTIVITY_TIMEOUT_MINUTES = 3;

async function getInactivityTimeoutMinutes(businessId: string | null) {
  if (!businessId) return DEFAULT_SENSITIVE_INACTIVITY_TIMEOUT_MINUTES;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { sessionInactivityTimeoutMinutes: true },
  });
  return business?.sessionInactivityTimeoutMinutes ?? DEFAULT_SENSITIVE_INACTIVITY_TIMEOUT_MINUTES;
}

function hashAuthorizationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueSensitiveAuthorization(data: {
  userId: string;
  businessId: string | null;
}) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashAuthorizationToken(rawToken);
  const inactivityTimeoutMinutes = await getInactivityTimeoutMinutes(data.businessId);
  const inactivityTimeoutMs = inactivityTimeoutMinutes * 60 * 1000;
  const expiresAt = new Date(Date.now() + inactivityTimeoutMs);

  await prisma.sensitiveAuthorization.create({
    data: {
      tokenHash,
      userId: data.userId,
      businessId: data.businessId,
      expiresAt,
    },
  });

  return {
    token: rawToken,
    expiresAt,
    inactivityTimeoutMs,
  };
}

export async function recordSensitiveActivity(data: {
  token: string;
  userId: string;
  businessId: string | null;
}) {
  if (!data.token) {
    throw new AppError("Sensitive authorization is required", 403);
  }

  const now = new Date();
  const inactivityTimeoutMinutes = await getInactivityTimeoutMinutes(data.businessId);
  const inactivityTimeoutMs = inactivityTimeoutMinutes * 60 * 1000;
  const expiresAt = new Date(now.getTime() + inactivityTimeoutMs);
  const result = await prisma.sensitiveAuthorization.updateMany({
    where: {
      tokenHash: hashAuthorizationToken(data.token),
      userId: data.userId,
      businessId: data.businessId,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { expiresAt },
  });

  if (result.count !== 1) {
    throw new AppError("Sensitive authorization is missing or expired", 403);
  }

  return { expiresAt, inactivityTimeoutMs };
}

export async function requireSensitiveAuthorization(data: {
  token: string;
  userId: string;
  businessId: string | null;
}) {
  if (!data.token) {
    throw new AppError(
      "Sensitive authorization is required",
      403,
    );
  }

  const tokenHash = hashAuthorizationToken(data.token);

  const authorization =
    await prisma.sensitiveAuthorization.findUnique({
      where: {
        tokenHash,
      },
    });

  if (
    !authorization ||
    authorization.userId !== data.userId ||
    authorization.businessId !== data.businessId ||
    authorization.revokedAt !== null ||
    authorization.expiresAt <= new Date()
  ) {
    throw new AppError(
      "Sensitive authorization is missing or expired",
      403,
    );
  }

  return authorization;
}

export async function revokeSensitiveAuthorizations(
  userId: string,
) {
  await prisma.sensitiveAuthorization.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}
