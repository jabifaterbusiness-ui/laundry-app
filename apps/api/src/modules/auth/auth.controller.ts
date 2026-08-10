import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import { issueTokenPair, revokeRefreshToken, rotateRefreshToken, verifyPassword } from "./auth.service.js";

async function branchMemberships(userId: string) {
  const memberships = await prisma.userBranch.findMany({
    where: { userId },
    include: { branch: { select: { id: true, name: true, businessId: true } } },
  });
  return memberships.map((m) => ({ id: m.branch.id, name: m.branch.name }));
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive || !(await verifyPassword(user.passwordHash, password))) {
    throw new AppError("Invalid email or password", 401);
  }

  const tokens = await issueTokenPair(user);
  const branches = await branchMemberships(user.id);

  await recordAuditEvent({
    action: "user.login",
    entityType: "User",
    entityId: user.id,
    businessId: user.businessId,
    actorUserId: user.id,
    correlationId: req.correlationId,
  });

  res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      businessId: user.businessId,
      branches,
    },
    ...tokens,
  });
}

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);
  const tokens = await rotateRefreshToken(refreshToken);
  res.status(200).json(tokens);
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);
  // logout intentionally does not require a valid access token (the
  // access token may already be expired) - the refresh token itself is
  // the credential. revokeRefreshToken returns the owning user (if any)
  // so we can still attribute the audit entry.
  const owner = await revokeRefreshToken(refreshToken);

  if (owner) {
    await recordAuditEvent({
      action: "user.logout",
      entityType: "User",
      entityId: owner.id,
      businessId: owner.businessId,
      actorUserId: owner.id,
      correlationId: req.correlationId,
    });
  }

  res.status(204).send();
}

export async function me(req: Request, res: Response) {
  if (!req.user) {
    throw new AppError("Authentication required", 401);
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  const branches = await branchMemberships(user.id);

  res.status(200).json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    businessId: user.businessId,
    branches,
  });
}
