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
  resetPassword,
  verifyPassword,
} from "../../src/modules/auth/auth.service.js";

describe("auth password reset service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) =>
      callback(prismaMock),
    );

    prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.passwordResetToken.create.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({});
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
