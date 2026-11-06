import argon2 from "argon2";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Prisma, Role, User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { config } from "../../config/index.js";
import { AppError } from "../../middleware/error-handler.js";

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

// Deliberately does NOT include branchId (LOCKED decision #3/#6): branch
// membership can change after the token is issued, and the access token
// TTL means a stale claim could otherwise grant access to a branch the
// user has since been removed from. The *active* branch is resolved and
// re-validated against the database on every request that needs it - see
// src/middleware/branch-context.ts. businessId is included because, for
// v1, a user's business membership is fixed at creation and doesn't
// change during a session.
type TokenSubject = Pick<User, "id" | "email" | "securityRole" | "businessId">;

function signAccessToken(user: TokenSubject, sessionId: string): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      securityRole: user.securityRole,
      businessId: user.businessId,
      sid: sessionId,
    },
    config.auth.accessTokenSecret,
    { expiresIn: config.auth.accessTokenExpiresIn as `${number}${"s" | "m" | "h" | "d"}` },
  );
}

function parseTokenLifetime(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error("JWT_REFRESH_EXPIRES_IN must use a duration such as 7d, 12h, 30m or 60s");
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("JWT_REFRESH_EXPIRES_IN must be a positive duration");
  }
  const unit = match[2];
  const multiplier = unit === "s" ? 1_000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  const durationMs = amount * multiplier;
  if (!Number.isSafeInteger(durationMs) || durationMs > 8_640_000_000_000_000) {
    throw new Error("JWT_REFRESH_EXPIRES_IN exceeds the supported date range");
  }
  return durationMs;
}

type TokenDb = typeof prisma | Prisma.TransactionClient;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Issues an access token + refresh token pair for a user, persisting a
 * hash of the refresh token so it can be looked up / revoked later.
 * Raw refresh tokens are never stored.
 */
export async function issueTokenPair(user: TokenSubject, db: TokenDb = prisma, sessionId = crypto.randomUUID()) {
  const accessToken = signAccessToken(user, sessionId);
  const refreshToken = crypto.randomBytes(64).toString("hex");
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseTokenLifetime(config.auth.refreshTokenExpiresIn));

  await db.refreshToken.create({
    data: { tokenHash: refreshTokenHash, sessionId, userId: user.id, expiresAt },
  });

  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    const now = new Date();

    if (!existing || existing.revokedAt || existing.expiresAt <= now || !existing.user.isActive) {
      throw new AppError("Invalid or expired refresh token", 401);
    }

    // Claim the token with a conditional update. Concurrent refresh requests
    // can no longer both rotate the same token into separate active sessions.
    const claimed = await tx.refreshToken.updateMany({
      where: {
        id: existing.id,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now },
    });

    if (claimed.count !== 1) {
      throw new AppError("Invalid or expired refresh token", 401);
    }

    return issueTokenPair(existing.user, tx, existing.sessionId);
  });
}

/**
 * Revokes every refresh token in the supplied session and returns its user
 * (or null if the token was unknown/already revoked). Access tokens carry
 * the same session ID, so requireAuth rejects them on the next request.
 */
export async function revokeRefreshToken(rawToken: string): Promise<Pick<User, "id" | "businessId"> | null> {
  const tokenHash = hashToken(rawToken);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, sessionId: true, revokedAt: true, user: { select: { id: true, businessId: true } } },
    });

    if (!existing || existing.revokedAt) {
      return null;
    }

    // Claim revocation conditionally so concurrent logout requests cannot
    // both report success for the same refresh token. Database errors must
    // propagate; silently swallowing one would leave the session active.
    const revoked = await tx.refreshToken.updateMany({
      where: { sessionId: existing.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return revoked.count > 0 ? existing.user : null;
  });
}

export type { Role };


const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export async function createPasswordResetToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    await tx.passwordResetToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt,
      },
    });
  });

  return rawToken;
}

export async function invalidatePasswordResetToken(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);

  await prisma.passwordResetToken.updateMany({
    where: {
      tokenHash,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<string> {
  const tokenHash = hashToken(rawToken);

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: {
        select: {
          id: true,
          businessId: true,
          isActive: true,
        },
      },
    },
  });

  if (
    !resetToken ||
    resetToken.usedAt ||
    resetToken.expiresAt <= new Date() ||
    !resetToken.user.isActive
  ) {
    throw new AppError("Invalid or expired password reset token", 400);
  }

  const passwordHash = await hashPassword(newPassword);

  const consumed = await prisma.$transaction(async (tx) => {
    const result = await tx.passwordResetToken.updateMany({
      where: {
        id: resetToken.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    if (result.count !== 1) {
      throw new AppError("Invalid or expired password reset token", 400);
    }

    await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    });

    await tx.refreshToken.updateMany({
      where: {
        userId: resetToken.userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return resetToken.user;
  });

  return consumed.id;
}
