import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { config } from "../../config/index.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import { getEffectivePermissionCodes } from "../permissions/permissions.service.js";
import {
  createPasswordResetToken,
  invalidatePasswordResetToken,
  issueTokenPair,
  resetPassword,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyPassword,
} from "./auth.service.js";
import { issueSensitiveAuthorization, recordSensitiveActivity, revokeSensitiveAuthorizations } from "./sensitive-authorization.service.js";

async function branchMemberships(userId: string) {
  const memberships = await prisma.userBranch.findMany({
    where: { userId },
    include: { branch: { select: { id: true, name: true, businessId: true, isActive: true } } },
  });
  return memberships.map((m) => ({ id: m.branch.id, name: m.branch.name, isActive: m.branch.isActive }));
}

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Email or username is required"),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response) {
  const { identifier, password } = loginSchema.parse(req.body);
  const normalizedIdentifier = identifier.toLowerCase();

  const user = normalizedIdentifier.includes("@")
    ? await prisma.user.findUnique({ where: { email: normalizedIdentifier } })
    : await prisma.user.findUnique({ where: { username: normalizedIdentifier } });

  if (!user || !user.isActive || !(await verifyPassword(user.passwordHash, password))) {
    throw new AppError("Invalid email or password", 401);
  }

  const tokens = await issueTokenPair(user);
  const branches = await branchMemberships(user.id);
  const permissions = await getEffectivePermissionCodes(
    user.businessId,
    user.id,
    user.securityRole,
  );

  await recordAuditEvent({
    action: "user.login",
    entityType: "User",
    entityId: user.id,
    businessId: user.businessId,
    actorUserId: user.id,
    correlationId: req.correlationId ?? null,
  });

  res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      securityRole: user.securityRole,
      businessId: user.businessId,
      branches,
      permissions,
    },
    ...tokens,
  });
}

const reauthorizeSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export async function recordSensitiveActivityController(req: Request, res: Response) {
  if (!req.user?.id) {
    throw new AppError("Authentication is required", 401);
  }
  const token = req.header("x-sensitive-authorization");
  if (!token) {
    throw new AppError("Sensitive authorization is required", 403);
  }
  const activity = await recordSensitiveActivity({
    token,
    userId: req.user.id,
    businessId: req.user.businessId,
  });
  res.status(200).json(activity);
}

export async function reauthorize(req: Request, res: Response) {
  if (!req.user?.id) {
    throw new AppError("Authentication is required", 401);
  }

  const { password } = reauthorizeSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
      businessId: true,
    },
  });

  if (
    !user ||
    !user.isActive ||
    !(await verifyPassword(user.passwordHash, password))
  ) {
    await recordAuditEvent({
      action: "user.sensitive_reauthorization_failed",
      entityType: "User",
      entityId: req.user.id,
      businessId: req.user.businessId,
      actorUserId: req.user.id,
      correlationId: req.correlationId ?? null,
    });

    throw new AppError("Invalid password", 401);
  }

  const authorization = await issueSensitiveAuthorization({
    userId: user.id,
    businessId: user.businessId,
  });

  await recordAuditEvent({
    action: "user.sensitive_reauthorization",
    entityType: "User",
    entityId: user.id,
    businessId: user.businessId,
    actorUserId: user.id,
    correlationId: req.correlationId ?? null,
  });

  res.status(200).json(authorization);
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
    await revokeSensitiveAuthorizations(owner.id);

    await recordAuditEvent({
      action: "user.logout",
      entityType: "User",
      entityId: owner.id,
      businessId: owner.businessId,
      actorUserId: owner.id,
      correlationId: req.correlationId ?? null,
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
  const permissions = await getEffectivePermissionCodes(
    user.businessId,
    user.id,
    user.securityRole,
  );

  res.status(200).json({
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    securityRole: user.securityRole,
    businessId: user.businessId,
    branches,
    permissions,
  });
}



const accountSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

async function currentUserResponse(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  const branches = await branchMemberships(user.id);
  const permissions = await getEffectivePermissionCodes(
    user.businessId,
    user.id,
    user.securityRole,
  );

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    securityRole: user.securityRole,
    businessId: user.businessId,
    branches,
    permissions,
  };
}

export async function account(req: Request, res: Response) {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { fullName } = accountSchema.parse(req.body);

  await prisma.user.update({
    where: { id: req.user.id },
    data: { fullName },
  });

  const result = await currentUserResponse(req.user.id);

  await recordAuditEvent({
    action: "user.account.updated",
    entityType: "User",
    entityId: req.user.id,
    businessId: req.user.businessId,
    actorUserId: req.user.id,
    correlationId: req.correlationId ?? null,
  });

  res.status(200).json(result);
}

export async function changePassword(req: Request, res: Response) {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

  if (currentPassword === newPassword) {
    throw new AppError("New password must be different from the current password", 422);
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) throw new AppError("User not found", 404);

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError("Current password is incorrect", 401);
  }

  const passwordHash = await (await import("./auth.service.js")).hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    }),
    prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    }),
  ]);

  await revokeSensitiveAuthorizations(user.id);

  await recordAuditEvent({
    action: "user.password_changed",
    entityType: "User",
    entityId: user.id,
    businessId: user.businessId,
    actorUserId: user.id,
    correlationId: req.correlationId ?? null,
  });

  res.status(200).json({
    message: "Password changed successfully. Other active sessions have been signed out.",
  });
}

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, isActive: true },
  });

  if (user?.isActive) {
    const token = await createPasswordResetToken(user.id);
    const resetUrl = `${config.webAppUrl}/reset-password?token=${encodeURIComponent(token)}`;

    const { sendReceiptEmail } = await import("../invoices/providers/resend.provider.js");

    try {
      await sendReceiptEmail({
        to: user.email,
        subject: "Reset your LaundryAngel password",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#172033">
            <h1 style="margin:0 0 16px">LaundryAngel</h1>
            <h2 style="margin:0 0 12px">Reset your password</h2>
            <p>We received a request to reset your LaundryAngel password.</p>
            <p>
              <a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">
                Reset password
              </a>
            </p>
            <p>This link expires in 30 minutes and can only be used once.</p>
            <p>If you did not request this, you can safely ignore this email.</p>
          </div>
        `,
      });
    } catch {
      await invalidatePasswordResetToken(token);
      throw new AppError("Unable to send password reset email", 503);
    }

    await recordAuditEvent({
      action: "user.password_reset_requested",
      entityType: "User",
      entityId: user.id,
      businessId: null,
      actorUserId: null,
      correlationId: req.correlationId ?? null,
    });
  }

  res.status(200).json({
    message: "If an account exists for that email, a password reset link has been sent.",
  });
}

export async function resetPasswordController(req: Request, res: Response) {
  const { token, password } = resetPasswordSchema.parse(req.body);

  const userId = await resetPassword(token, password);

  await revokeSensitiveAuthorizations(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, businessId: true },
  });

  await recordAuditEvent({
    action: "user.password_reset_completed",
    entityType: "User",
    entityId: userId,
    businessId: user?.businessId ?? null,
    actorUserId: userId,
    correlationId: req.correlationId ?? null,
  });

  res.status(200).json({
    message: "Password reset successfully. Please sign in with your new password.",
  });
}
