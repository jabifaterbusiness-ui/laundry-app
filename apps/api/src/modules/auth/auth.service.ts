import argon2 from "argon2";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Role, User } from "@prisma/client";
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
type TokenSubject = Pick<User, "id" | "email" | "role" | "businessId">;

function signAccessToken(user: TokenSubject): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
    },
    config.auth.accessTokenSecret,
    { expiresIn: config.auth.accessTokenExpiresIn },
  );
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Issues an access token + refresh token pair for a user, persisting a
 * hash of the refresh token so it can be looked up / revoked later.
 * Raw refresh tokens are never stored.
 */
export async function issueTokenPair(user: TokenSubject) {
  const accessToken = signAccessToken(user);
  const refreshToken = crypto.randomBytes(64).toString("hex");
  const refreshTokenHash = hashToken(refreshToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // aligned with JWT_REFRESH_EXPIRES_IN default

  await prisma.refreshToken.create({
    data: { tokenHash: refreshTokenHash, userId: user.id, expiresAt },
  });

  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  return issueTokenPair(existing.user);
}

/**
 * Revokes a refresh token and returns the user it belonged to (or null if
 * the token was unknown/already revoked), so the caller can attribute an
 * audit log entry without a second database round trip.
 */
export async function revokeRefreshToken(rawToken: string): Promise<Pick<User, "id" | "businessId"> | null> {
  const tokenHash = hashToken(rawToken);

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: { id: true, revokedAt: true, user: { select: { id: true, businessId: true } } },
  });

  if (!existing || existing.revokedAt) {
    return null;
  }

  await prisma.refreshToken
    .update({ where: { id: existing.id }, data: { revokedAt: new Date() } })
    .catch(() => undefined);

  return existing.user;
}

export type { Role };
