import type { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    passwordResetToken: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    refreshToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  createPasswordResetToken,
  hashPassword,
  invalidatePasswordResetToken,
  issueTokenPair,
  revokeRefreshToken,
  rotateRefreshToken,
  resetPassword,
  verifyPassword,
} from "../../src/modules/auth/auth.service.js";

describe("refresh token rotation", () => {
  const user = {
    id: "user-1",
    email: "owner@example.com",
    securityRole: "BUSINESS_OWNER" as Role,
    businessId: "business-1",
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) =>
      callback(prismaMock),
    );
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: "refresh-token-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user,
    });
    prismaMock.refreshToken.create.mockResolvedValue({});
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  });

  it("stores only a hash and uses the configured seven-day refresh lifetime", async () => {
    const before = Date.now();
    const tokens = await issueTokenPair(user);

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toMatch(/^[a-f0-9]{128}$/);
    const createCall = prismaMock.refreshToken.create.mock.calls[0]?.[0];
    expect(createCall.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createCall.data.tokenHash).not.toBe(tokens.refreshToken);
    expect(createCall.data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000);
    expect(createCall.data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1000 + 1000);
  });

  it("atomically revokes the old token and issues exactly one replacement", async () => {
    const tokens = await rotateRefreshToken("raw-refresh-token");

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toMatch(/^[a-f0-9]{128}$/);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: "refresh-token-1",
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a token already claimed by a concurrent refresh request", async () => {
    prismaMock.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(rotateRefreshToken("raw-refresh-token")).rejects.toMatchObject({
      message: "Invalid or expired refresh token",
      statusCode: 401,
    });
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe("refresh token revocation", () => {
  const owner = { id: "user-1", businessId: "business-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) =>
      callback(prismaMock),
    );
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: "refresh-token-1",
      revokedAt: null,
      user: owner,
    });
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  });

  it("conditionally revokes a refresh token and returns its owner", async () => {
    await expect(revokeRefreshToken("raw-refresh-token")).resolves.toEqual(owner);

    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "refresh-token-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("does not report success when another request already revoked the token", async () => {
    prismaMock.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(revokeRefreshToken("raw-refresh-token")).resolves.toBeNull();
  });

  it("propagates database errors rather than silently leaving a session active", async () => {
    const databaseError = new Error("database unavailable");
    prismaMock.refreshToken.updateMany.mockRejectedValueOnce(databaseError);

    await expect(revokeRefreshToken("raw-refresh-token")).rejects.toBe(databaseError);
  });
});

describe("auth password reset service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) =>
      callback(prismaMock),
    );

    prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.passwordResetToken.create.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);
    prismaMock.refreshToken.create.mockResolvedValue({});
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 0 });
  });

  it("invalidates only the requested unused reset token", async () => {
    prismaMock.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 1 });

    await invalidatePasswordResetToken("raw-reset-token");

    expect(prismaMock.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenHash: expect.any(String),
          usedAt: null,
        },
        data: {
          usedAt: expect.any(Date),
        },
      }),
    );
  });

  it("creates a random reset token and stores only its hash", async () => {
    const rawToken = await createPasswordResetToken("user-1");

    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);

    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledTimes(1);

    const createCall = prismaMock.passwordResetToken.create.mock.calls[0]?.[0];

    expect(createCall.data.userId).toBe("user-1");
    expect(createCall.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createCall.data.tokenHash).not.toBe(rawToken);
    expect(createCall.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(createCall.data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 60 * 1000 + 1000);
  });

  it("invalidates previously active reset tokens before creating a new one", async () => {
    await createPasswordResetToken("user-1");

    expect(prismaMock.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        usedAt: null,
      },
      data: expect.objectContaining({
        usedAt: expect.any(Date),
      }),
    });
  });

  it("resets the password and revokes all existing refresh tokens", async () => {
    const passwordHash = await hashPassword("OldPassword123!");
    const newPassword = "NewPassword456!";

    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "reset-1",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
      user: {
        id: "user-1",
        businessId: "business-1",
        isActive: true,
      },
    });

    const rawToken = "a".repeat(64);

    prismaMock.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 1 });

    await resetPassword(rawToken, newPassword);

    expect(prismaMock.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "reset-1",
        usedAt: null,
        expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
      }),
      data: expect.objectContaining({
        usedAt: expect.any(Date),
      }),
    });

    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);

    const updateCall = prismaMock.user.update.mock.calls[0]?.[0];

    expect(updateCall.where).toEqual({ id: "user-1" });
    expect(updateCall.data.passwordHash).not.toBe(newPassword);
    expect(await verifyPassword(updateCall.data.passwordHash, newPassword)).toBe(true);
    expect(await verifyPassword(updateCall.data.passwordHash, passwordHash)).toBe(false);

    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        revokedAt: null,
      },
      data: expect.objectContaining({
        revokedAt: expect.any(Date),
      }),
    });
  });

  it("rejects an expired reset token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "reset-1",
      userId: "user-1",
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
      user: {
        id: "user-1",
        businessId: "business-1",
        isActive: true,
      },
    });

    await expect(
      resetPassword("a".repeat(64), "NewPassword456!"),
    ).rejects.toThrow("Invalid or expired password reset token");

    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an already-used reset token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "reset-1",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: new Date(),
      user: {
        id: "user-1",
        businessId: "business-1",
        isActive: true,
      },
    });

    await expect(
      resetPassword("a".repeat(64), "NewPassword456!"),
    ).rejects.toThrow("Invalid or expired password reset token");

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects a reset token belonging to an inactive user", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "reset-1",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
      user: {
        id: "user-1",
        businessId: "business-1",
        isActive: false,
      },
    });

    await expect(
      resetPassword("a".repeat(64), "NewPassword456!"),
    ).rejects.toThrow("Invalid or expired password reset token");

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown reset token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);

    await expect(
      resetPassword("a".repeat(64), "NewPassword456!"),
    ).rejects.toThrow("Invalid or expired password reset token");

    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
