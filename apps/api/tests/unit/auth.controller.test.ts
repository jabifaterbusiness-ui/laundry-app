import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userBranch: { findMany: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/modules/invoices/providers/resend.provider.js", () => ({
  sendReceiptEmail: vi.fn().mockResolvedValue({ id: "email-1" }),
}));

vi.mock("../../src/modules/permissions/permissions.service.js", () => ({
  getEffectivePermissionCodes: vi.fn().mockResolvedValue([
    "orders.view",
    "orders.create",
  ]),
}));

vi.mock("../../src/modules/auth/sensitive-authorization.service.js", () => ({
  issueSensitiveAuthorization: vi.fn().mockResolvedValue({
    token: "sensitive-token",
    expiresAt: new Date(Date.now() + 300000),
    inactivityTimeoutMs: 180000,
  }),
  recordSensitiveActivity: vi.fn().mockResolvedValue({
    expiresAt: new Date(Date.now() + 180000),
    inactivityTimeoutMs: 180000,
  }),
  revokeSensitiveAuthorizations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/modules/auth/auth.service.js", () => ({
  createPasswordResetToken: vi.fn().mockResolvedValue("raw-reset-token"),
  invalidatePasswordResetToken: vi.fn().mockResolvedValue(undefined),
  issueTokenPair: vi.fn().mockResolvedValue({ accessToken: "at", refreshToken: "rt" }),
  resetPassword: vi.fn().mockResolvedValue("user-1"),
  revokeRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  verifyPassword: vi.fn().mockResolvedValue(true),
  hashPassword: vi.fn().mockResolvedValue("new-hash"),
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import {
  createPasswordResetToken,
  invalidatePasswordResetToken,
  resetPassword,
  verifyPassword,
  hashPassword,
} from "../../src/modules/auth/auth.service.js";
import {
  forgotPassword,
  login,
  me,
  reauthorize,
  recordSensitiveActivityController,
  resetPasswordController,
  account,
  changePassword,
} from "../../src/modules/auth/auth.controller.js";

import { issueSensitiveAuthorization, recordSensitiveActivity } from "../../src/modules/auth/sensitive-authorization.service.js";
import { getEffectivePermissionCodes } from "../../src/modules/permissions/permissions.service.js";

const findUniqueUser = vi.mocked(prisma.user.findUnique);
const updateUser = vi.mocked(prisma.user.update);
const findManyUserBranch = vi.mocked(prisma.userBranch.findMany);
const deleteRefreshTokens = vi.mocked(prisma.refreshToken.deleteMany);
const transaction = vi.mocked(prisma.$transaction);
const verifyPasswordMock = vi.mocked(verifyPassword);
const hashPasswordMock = vi.mocked(hashPassword);
const createPasswordResetTokenMock = vi.mocked(createPasswordResetToken);
const invalidatePasswordResetTokenMock = vi.mocked(invalidatePasswordResetToken);
const resetPasswordMock = vi.mocked(resetPassword);
const issueSensitiveAuthorizationMock = vi.mocked(
  issueSensitiveAuthorization,
);
const recordSensitiveActivityMock = vi.mocked(recordSensitiveActivity);

const getEffectivePermissionCodesMock = vi.mocked(getEffectivePermissionCodes);

const baseUser = {
  id: "user-1",
  email: "owner@example.com",
  username: "owner",
  passwordHash: "hash",
  fullName: "Owner",
  role: "BUSINESS_OWNER",
  securityRole: "BUSINESS_OWNER",
  isActive: true,
  businessId: "biz-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const twoBranchMemberships = [
  { id: "ub-1", userId: "user-1", branchId: "branch-1", createdAt: new Date(), branch: { id: "branch-1", name: "Main St", businessId: "biz-1", isActive: true } },
  { id: "ub-2", userId: "user-1", branchId: "branch-2", createdAt: new Date(), branch: { id: "branch-2", name: "Downtown", businessId: "biz-1", isActive: true } },
];

function makeRes() {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe("recordSensitiveActivityController", () => {
  it("extends the authenticated user's sensitive authorization", async () => {
    const token = "sensitive-token";
    const req = {
      user: { id: "user-1", businessId: "biz-1" },
      header: vi.fn().mockReturnValue(token),
    } as unknown as Request;
    const res = makeRes();

    await recordSensitiveActivityController(req, res);

    expect(recordSensitiveActivityMock).toHaveBeenCalledWith({
      token,
      userId: "user-1",
      businessId: "biz-1",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      inactivityTimeoutMs: 180000,
    }));
  });
});

describe("reauthorize", () => {
  it("requires the current password and returns a sensitive authorization", async () => {
    findUniqueUser.mockResolvedValue({
      ...baseUser,
      passwordHash: "stored-hash",
    } as never);

    verifyPasswordMock.mockResolvedValue(true);
    issueSensitiveAuthorizationMock.mockResolvedValue({
      token: "sensitive-token",
      expiresAt: new Date(Date.now() + 300000),
      inactivityTimeoutMs: 180000,
    });

    const req = {
      user: {
        id: "user-1",
        businessId: "biz-1",
      },
      body: {
        password: "correct-password",
      },
      correlationId: "corr-1",
    } as unknown as Request;

    const res = makeRes();

    await reauthorize(req, res);

    expect(verifyPasswordMock).toHaveBeenCalledWith(
      "stored-hash",
      "correct-password",
    );

    expect(issueSensitiveAuthorizationMock).toHaveBeenCalledWith({
      userId: "user-1",
      businessId: "biz-1",
    });

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.sensitive_reauthorization",
        entityType: "User",
        entityId: "user-1",
        businessId: "biz-1",
        actorUserId: "user-1",
        correlationId: "corr-1",
      }),
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      token: "sensitive-token",
      expiresAt: expect.any(Date),
    });
  });

  it("rejects an incorrect password and does not issue authorization", async () => {
    findUniqueUser.mockResolvedValue({
      ...baseUser,
      passwordHash: "stored-hash",
    } as never);

    verifyPasswordMock.mockResolvedValue(false);

    const req = {
      user: {
        id: "user-1",
        businessId: "biz-1",
      },
      body: {
        password: "wrong-password",
      },
      correlationId: "corr-2",
    } as unknown as Request;

    const res = makeRes();

    await expect(reauthorize(req, res)).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(issueSensitiveAuthorizationMock).not.toHaveBeenCalled();

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.sensitive_reauthorization_failed",
        entityType: "User",
        entityId: "user-1",
        businessId: "biz-1",
        actorUserId: "user-1",
        correlationId: "corr-2",
      }),
    );
  });

  it("does not issue authorization for an inactive user", async () => {
    findUniqueUser.mockResolvedValue({
      ...baseUser,
      passwordHash: "stored-hash",
      isActive: false,
    } as never);

    const req = {
      user: {
        id: "user-1",
        businessId: "biz-1",
      },
      body: {
        password: "correct-password",
      },
      correlationId: "corr-3",
    } as unknown as Request;

    const res = makeRes();

    await expect(reauthorize(req, res)).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(issueSensitiveAuthorizationMock).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const req = {
      user: undefined,
      body: {
        password: "correct-password",
      },
    } as unknown as Request;

    const res = makeRes();

    await expect(reauthorize(req, res)).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(findUniqueUser).not.toHaveBeenCalled();
    expect(issueSensitiveAuthorizationMock).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  verifyPasswordMock.mockResolvedValue(true);
  issueSensitiveAuthorizationMock.mockResolvedValue({
    token: "sensitive-token",
    expiresAt: new Date(Date.now() + 300000),
  });
});

describe("auth controller - password reset", () => {
  it("sends a reset email for an active user and returns a generic response", async () => {
    findUniqueUser.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      isActive: true,
    } as never);

    const req = {
      body: { email: "owner@example.com" },
      correlationId: "corr-reset-1",
    } as unknown as Request;
    const res = makeRes();

    await forgotPassword(req, res);

    expect(createPasswordResetTokenMock).toHaveBeenCalledWith("user-1");
    expect(res.status).toHaveBeenCalledWith(200);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(payload).toEqual({
      message: "If an account exists for that email, a password reset link has been sent.",
    });
  });

  it("does not reveal whether an unknown email exists", async () => {
    findUniqueUser.mockResolvedValue(null);

    const req = {
      body: { email: "unknown@example.com" },
    } as unknown as Request;
    const res = makeRes();

    await forgotPassword(req, res);

    expect(createPasswordResetTokenMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("invalidates the reset token when email delivery fails", async () => {
    findUniqueUser.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      isActive: true,
    } as never);

    const resendModule = await import("../../src/modules/invoices/providers/resend.provider.js");
    const sendReceiptEmailMock = vi.mocked(resendModule.sendReceiptEmail);
    sendReceiptEmailMock.mockRejectedValueOnce(new Error("provider unavailable"));

    const req = {
      body: { email: "owner@example.com" },
      correlationId: "corr-reset-2",
    } as unknown as Request;

    await expect(forgotPassword(req, makeRes())).rejects.toThrow(
      "Unable to send password reset email",
    );

    expect(invalidatePasswordResetTokenMock).toHaveBeenCalledWith("raw-reset-token");
  });

  it("resets the password and records the completion audit event", async () => {
    findUniqueUser.mockResolvedValue({
      id: "user-1",
      businessId: "biz-1",
    } as never);

    const req = {
      body: {
        token: "raw-reset-token",
        password: "NewSecurePassword123!",
      },
      correlationId: "corr-reset-3",
    } as unknown as Request;
    const res = makeRes();

    await resetPasswordController(req, res);

    expect(resetPasswordMock).toHaveBeenCalledWith(
      "raw-reset-token",
      "NewSecurePassword123!",
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.password_reset_completed",
        entityId: "user-1",
        businessId: "biz-1",
        actorUserId: "user-1",
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("auth controller - username login", () => {
  it("logs in with a username and returns the username in the authenticated user", async () => {
    findUniqueUser.mockResolvedValue({
      ...baseUser,
      username: "owner",
    } as never);
    findManyUserBranch.mockResolvedValue([]);

    const req = {
      body: { identifier: "OWNER", password: "pw" },
      correlationId: "corr-username-1",
    } as unknown as Request;
    const res = makeRes();

    await login(req, res);

    expect(findUniqueUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: "owner" },
      }),
    );

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(payload.user.username).toBe("owner");
  });
});

describe("auth controller - multi-branch membership", () => {
  it("login returns all of a user's branch memberships, not just one", async () => {
    findUniqueUser.mockResolvedValue(baseUser as never);
    findManyUserBranch.mockResolvedValue(twoBranchMemberships as never);

    const req = { body: { identifier: "owner@example.com", password: "pw" }, correlationId: "corr-1" } as unknown as Request;
    const res = makeRes();

    await login(req, res);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(payload.user.branches).toEqual([
      { id: "branch-1", name: "Main St", isActive: true },
      { id: "branch-2", name: "Downtown", isActive: true },
    ]);
    expect(payload.user.permissions).toEqual([
      "orders.view",
      "orders.create",
    ]);
    expect(getEffectivePermissionCodesMock).toHaveBeenCalledWith(
      "biz-1",
      "user-1",
      "BUSINESS_OWNER",
    );
  });

  it("login records a user.login audit event without leaking tokens", async () => {
    findUniqueUser.mockResolvedValue(baseUser as never);
    findManyUserBranch.mockResolvedValue([]);

    const req = { body: { identifier: "owner@example.com", password: "pw" }, correlationId: "corr-1" } as unknown as Request;
    await login(req, makeRes());

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.login", actorUserId: "user-1", businessId: "biz-1" }),
    );
    const call = vi.mocked(recordAuditEvent).mock.calls[0]![0];
    expect(call).not.toHaveProperty("metadata.password");
    expect(call).not.toHaveProperty("accessToken");
    expect(call).not.toHaveProperty("refreshToken");
  });

  it("me reflects multiple branch memberships for the authenticated user", async () => {
    findUniqueUser.mockResolvedValue(baseUser as never);
    findManyUserBranch.mockResolvedValue(twoBranchMemberships as never);

    const req = { user: { id: "user-1", email: "owner@example.com", role: "Business Owner", securityRole: "BUSINESS_OWNER", businessId: "biz-1" } } as unknown as Request;
    const res = makeRes();

    await me(req, res);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(payload.username).toBe("owner");
    expect(payload.branches).toHaveLength(2);
    expect(payload.permissions).toEqual([
      "orders.view",
      "orders.create",
    ]);
    expect(getEffectivePermissionCodesMock).toHaveBeenCalledWith(
      "biz-1",
      "user-1",
      "BUSINESS_OWNER",
    );
  });
});


describe("auth controller - account management", () => {
  beforeEach(() => {
    findUniqueUser.mockResolvedValue(baseUser as never);
    updateUser.mockResolvedValue({
      ...baseUser,
      fullName: "Updated Owner",
    } as never);

    findUniqueUser.mockResolvedValue({
      ...baseUser,
      fullName: "Updated Owner",
    } as never);

    findManyUserBranch.mockResolvedValue(twoBranchMemberships as never);
    getEffectivePermissionCodesMock.mockResolvedValue([
      "orders.view",
      "orders.create",
    ]);
  });

  it("updates the authenticated user's full name and returns refreshed identity", async () => {
    const req = {
      user: {
        id: "user-1",
        businessId: "biz-1",
      },
      body: {
        fullName: "Updated Owner",
      },
      correlationId: "corr-account-1",
    } as unknown as Request;

    const res = makeRes();

    await account(req, res);

    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { fullName: "Updated Owner" },
    });

    expect(res.status).toHaveBeenCalledWith(200);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];

    expect(payload).toMatchObject({
      id: "user-1",
      fullName: "Updated Owner",
      email: "owner@example.com",
      username: "owner",
      businessId: "biz-1",
      securityRole: "BUSINESS_OWNER",
    });

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.account.updated",
        entityType: "User",
        entityId: "user-1",
        businessId: "biz-1",
        actorUserId: "user-1",
      }),
    );
  });
});

describe("auth controller - change password", () => {
  beforeEach(() => {
    findUniqueUser.mockResolvedValue(baseUser as never);
    transaction.mockResolvedValue([] as never);
    deleteRefreshTokens.mockResolvedValue({ count: 2 } as never);
    verifyPasswordMock.mockResolvedValue(true);
    hashPasswordMock.mockResolvedValue("new-hash");
  });

  it("rejects a new password identical to the current password", async () => {
    const req = {
      user: {
        id: "user-1",
        businessId: "biz-1",
      },
      body: {
        currentPassword: "same-password",
        newPassword: "same-password",
      },
    } as unknown as Request;

    const res = makeRes();

    await expect(changePassword(req, res)).rejects.toMatchObject({
      statusCode: 422,
    });

    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects an incorrect current password", async () => {
    verifyPasswordMock.mockResolvedValue(false);

    const req = {
      user: {
        id: "user-1",
        businessId: "biz-1",
      },
      body: {
        currentPassword: "wrong-password",
        newPassword: "new-password-123",
      },
    } as unknown as Request;

    const res = makeRes();

    await expect(changePassword(req, res)).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(verifyPasswordMock).toHaveBeenCalledWith(
      "hash",
      "wrong-password",
    );
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("hashes the new password, revokes refresh tokens, and records an audit event", async () => {
    const req = {
      user: {
        id: "user-1",
        businessId: "biz-1",
      },
      body: {
        currentPassword: "current-password",
        newPassword: "new-password-123",
      },
      correlationId: "corr-password-1",
    } as unknown as Request;

    const res = makeRes();

    await changePassword(req, res);

    expect(verifyPasswordMock).toHaveBeenCalledWith(
      "hash",
      "current-password",
    );

    expect(hashPasswordMock).toHaveBeenCalledWith("new-password-123");

    expect(transaction).toHaveBeenCalledTimes(1);

    expect(deleteRefreshTokens).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.password_changed",
        entityType: "User",
        entityId: "user-1",
        businessId: "biz-1",
        actorUserId: "user-1",
      }),
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message:
        "Password changed successfully. Other active sessions have been signed out.",
    });
  });
});
