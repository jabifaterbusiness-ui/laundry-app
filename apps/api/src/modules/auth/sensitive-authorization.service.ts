import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

const SENSITIVE_AUTHORIZATION_TTL_MS = 5 * 60 * 1000;

function hashAuthorizationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueSensitiveAuthorization(data: {
  userId: string;
  businessId: string | null;
}) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashAuthorizationToken(rawToken);
  const expiresAt = new Date(
    Date.now() + SENSITIVE_AUTHORIZATION_TTL_MS,
  );

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
  };
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
