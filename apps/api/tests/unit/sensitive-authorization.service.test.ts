import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    sensitiveAuthorization: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  issueSensitiveAuthorization,
  requireSensitiveAuthorization,
  revokeSensitiveAuthorizations,
} from "../../src/modules/auth/sensitive-authorization.service.js";

describe("sensitive authorization service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a short-lived authorization and stores only the token hash", async () => {
    prismaMock.sensitiveAuthorization.create.mockResolvedValue({
      id: "auth-1",
      tokenHash: "hashed-token",
      userId: "user-1",
      businessId: "business-1",
      expiresAt: new Date(Date.now() + 300_000),
      revokedAt: null,
      createdAt: new Date(),
    });

    const result = await issueSensitiveAuthorization({
      userId: "user-1",
      businessId: "business-1",
    });

    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const createCall =
      prismaMock.sensitiveAuthorization.create.mock.calls[0]?.[0];

    expect(createCall).toBeDefined();
    expect(createCall?.data.userId).toBe("user-1");
    expect(createCall.data.businessId).toBe("business-1");
    expect(createCall.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createCall.data.tokenHash).not.toBe(result.token);
  });

  it("allows a valid authorization for the same user and business", async () => {
    prismaMock.sensitiveAuthorization.findUnique.mockResolvedValue({
      id: "auth-1",
      tokenHash: "hashed-token",
      userId: "user-1",
      businessId: "business-1",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
    });

    const result = await requireSensitiveAuthorization({
      token: "a".repeat(64),
      userId: "user-1",
      businessId: "business-1",
    });

    expect(result.id).toBe("auth-1");
    expect(
      prismaMock.sensitiveAuthorization.findUnique,
    ).toHaveBeenCalledOnce();
  });

  it("rejects an authorization belonging to another user", async () => {
    prismaMock.sensitiveAuthorization.findUnique.mockResolvedValue({
      id: "auth-1",
      tokenHash: "hashed-token",
      userId: "different-user",
      businessId: "business-1",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
    });

    await expect(
      requireSensitiveAuthorization({
        token: "a".repeat(64),
        userId: "user-1",
        businessId: "business-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("rejects an authorization from another business", async () => {
    prismaMock.sensitiveAuthorization.findUnique.mockResolvedValue({
      id: "auth-1",
      tokenHash: "hashed-token",
      userId: "user-1",
      businessId: "different-business",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
    });

    await expect(
      requireSensitiveAuthorization({
        token: "a".repeat(64),
        userId: "user-1",
        businessId: "business-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("rejects an expired authorization", async () => {
    prismaMock.sensitiveAuthorization.findUnique.mockResolvedValue({
      id: "auth-1",
      tokenHash: "hashed-token",
      userId: "user-1",
      businessId: "business-1",
      expiresAt: new Date(Date.now() - 1),
      revokedAt: null,
      createdAt: new Date(),
    });

    await expect(
      requireSensitiveAuthorization({
        token: "a".repeat(64),
        userId: "user-1",
        businessId: "business-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("rejects a revoked authorization", async () => {
    prismaMock.sensitiveAuthorization.findUnique.mockResolvedValue({
      id: "auth-1",
      tokenHash: "hashed-token",
      userId: "user-1",
      businessId: "business-1",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      createdAt: new Date(),
    });

    await expect(
      requireSensitiveAuthorization({
        token: "a".repeat(64),
        userId: "user-1",
        businessId: "business-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("revokes all active authorizations for a user", async () => {
    prismaMock.sensitiveAuthorization.updateMany.mockResolvedValue({
      count: 2,
    });

    await revokeSensitiveAuthorizations("user-1");

    expect(
      prismaMock.sensitiveAuthorization.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
  });
});
