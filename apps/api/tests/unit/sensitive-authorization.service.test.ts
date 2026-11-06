import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    business: {
      findUnique: vi.fn(),
    },
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
  recordSensitiveActivity,
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

  it("uses the business-configured inactivity timeout when issuing authorization", async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      sessionInactivityTimeoutMinutes: 7,
    });
    prismaMock.sensitiveAuthorization.create.mockResolvedValue({});

    const result = await issueSensitiveAuthorization({
      userId: "user-1",
      businessId: "business-1",
    });

    expect(result.inactivityTimeoutMs).toBe(7 * 60 * 1000);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 60 * 1000);
  });

  it("extends a valid authorization after server-recorded activity", async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      sessionInactivityTimeoutMinutes: 4,
    });
    prismaMock.sensitiveAuthorization.updateMany.mockResolvedValue({ count: 1 });

    const result = await recordSensitiveActivity({
      token: "a".repeat(64),
      userId: "user-1",
      businessId: "business-1",
    });

    expect(result.inactivityTimeoutMs).toBe(4 * 60 * 1000);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3 * 60 * 1000);
    expect(prismaMock.sensitiveAuthorization.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: expect.any(String),
        userId: "user-1",
        businessId: "business-1",
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { expiresAt: expect.any(Date) },
    });
  });

  it("does not extend an already expired authorization", async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      sessionInactivityTimeoutMinutes: 3,
    });
    prismaMock.sensitiveAuthorization.updateMany.mockResolvedValue({ count: 0 });

    await expect(recordSensitiveActivity({
      token: "a".repeat(64),
      userId: "user-1",
      businessId: "business-1",
    })).rejects.toMatchObject({ statusCode: 403 });
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
