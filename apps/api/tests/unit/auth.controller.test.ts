import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    userBranch: { findMany: vi.fn() },
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

vi.mock("../../src/modules/auth/auth.service.js", () => ({
  createPasswordResetToken: vi.fn().mockResolvedValue("raw-reset-token"),
  invalidatePasswordResetToken: vi.fn().mockResolvedValue(undefined),
  issueTokenPair: vi.fn().mockResolvedValue({ accessToken: "at", refreshToken: "rt" }),
  resetPassword: vi.fn().mockResolvedValue("user-1"),
  revokeRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import {
  createPasswordResetToken,
  invalidatePasswordResetToken,
  resetPassword,
} from "../../src/modules/auth/auth.service.js";
import {
  forgotPassword,
  login,
  me,
  resetPasswordController,
} from "../../src/modules/auth/auth.controller.js";

import { getEffectivePermissionCodes } from "../../src/modules/permissions/permissions.service.js";

const findUniqueUser = vi.mocked(prisma.user.findUnique);
const findManyUserBranch = vi.mocked(prisma.userBranch.findMany);
const createPasswordResetTokenMock = vi.mocked(createPasswordResetToken);
const invalidatePasswordResetTokenMock = vi.mocked(invalidatePasswordResetToken);
const resetPasswordMock = vi.mocked(resetPassword);

const getEffectivePermissionCodesMock = vi.mocked(getEffectivePermissionCodes);

const baseUser = {
  id: "user-1",
  email: "owner@example.com",
  passwordHash: "hash",
  fullName: "Owner",
  role: "BUSINESS_OWNER",
  isActive: true,
  businessId: "biz-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const twoBranchMemberships = [
  { id: "ub-1", userId: "user-1", branchId: "branch-1", createdAt: new Date(), branch: { id: "branch-1", name: "Main St", businessId: "biz-1" } },
  { id: "ub-2", userId: "user-1", branchId: "branch-2", createdAt: new Date(), branch: { id: "branch-2", name: "Downtown", businessId: "biz-1" } },
];

function makeRes() {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
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

describe("auth controller - multi-branch membership", () => {
  it("login returns all of a user's branch memberships, not just one", async () => {
    findUniqueUser.mockResolvedValue(baseUser as never);
    findManyUserBranch.mockResolvedValue(twoBranchMemberships as never);

    const req = { body: { email: "owner@example.com", password: "pw" }, correlationId: "corr-1" } as unknown as Request;
    const res = makeRes();

    await login(req, res);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(payload.user.branches).toEqual([
      { id: "branch-1", name: "Main St" },
      { id: "branch-2", name: "Downtown" },
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

    const req = { body: { email: "owner@example.com", password: "pw" }, correlationId: "corr-1" } as unknown as Request;
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

    const req = { user: { id: "user-1", email: "owner@example.com", role: "BUSINESS_OWNER", businessId: "biz-1" } } as unknown as Request;
    const res = makeRes();

    await me(req, res);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
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
