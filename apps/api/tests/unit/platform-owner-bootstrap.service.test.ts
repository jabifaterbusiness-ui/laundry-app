import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockRecordAuditEvent, mockHashPassword } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockRecordAuditEvent: vi.fn(),
  mockHashPassword: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: mockPrisma,
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: mockRecordAuditEvent,
}));

vi.mock("../../src/middleware/error-handler.js", () => ({
  AppError: class AppError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "AppError";
      this.statusCode = statusCode;
    }
  },
}));

vi.mock("../../src/modules/auth/auth.service.js", () => ({
  hashPassword: mockHashPassword,
}));

import { bootstrapPlatformOwner } from "../../src/modules/platform/platform-owner-bootstrap.service.js";

describe("bootstrapPlatformOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a tenant-free Platform Owner and records a sanitized audit event", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockHashPassword.mockResolvedValue("hashed-password");

    const tx = {
      user: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({
          id: "platform-owner-1",
          email: "owner@example.com",
          fullName: "Platform Owner",
          role: "Platform Administrator",
          securityRole: "PLATFORM_ADMIN",
          businessId: null,
          isActive: true,
        }),
      },
    };

    mockPrisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );

    const result = await bootstrapPlatformOwner({
      fullName: "  Platform Owner  ",
      email: "  OWNER@EXAMPLE.COM  ",
      password: "StrongPlatformPassword123!",
    });

    expect(mockHashPassword).toHaveBeenCalledWith(
      "StrongPlatformPassword123!",
    );

    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        fullName: "Platform Owner",
        email: "owner@example.com",
        passwordHash: "hashed-password",
        role: "Platform Administrator",
        securityRole: "PLATFORM_ADMIN",
        isActive: true,
        businessId: null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        securityRole: true,
        businessId: true,
        isActive: true,
      },
    });

    expect(result).toEqual({
      id: "platform-owner-1",
      email: "owner@example.com",
      fullName: "Platform Owner",
      role: "Platform Administrator",
      securityRole: "PLATFORM_ADMIN",
      businessId: null,
      isActive: true,
    });

    expect(mockRecordAuditEvent).toHaveBeenCalledWith({
      action: "platform.owner_bootstrapped",
      entityType: "User",
      entityId: "platform-owner-1",
      businessId: null,
      actorUserId: null,
      metadata: {
        role: "Platform Administrator",
        securityRole: "PLATFORM_ADMIN",
        email: "owner@example.com",
        bootstrap: true,
      },
    });
  });

  it("refuses to create a second Platform Owner", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "existing-platform-owner",
      email: "existing@example.com",
      isActive: true,
    });

    await expect(
      bootstrapPlatformOwner({
        fullName: "Another Owner",
        email: "another@example.com",
        password: "StrongPlatformPassword123!",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "A Platform Owner already exists. Use the existing account recovery flow instead.",
    });

    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockHashPassword).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 12 characters", async () => {
    await expect(
      bootstrapPlatformOwner({
        fullName: "Platform Owner",
        email: "owner@example.com",
        password: "short",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Platform Owner password must be at least 12 characters",
    });

    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockHashPassword).not.toHaveBeenCalled();
  });

  it("rejects a blank name", async () => {
    await expect(
      bootstrapPlatformOwner({
        fullName: "   ",
        email: "owner@example.com",
        password: "StrongPlatformPassword123!",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Platform Owner name is required",
    });

    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an email already used by another user", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "existing-user",
    });

    await expect(
      bootstrapPlatformOwner({
        fullName: "Platform Owner",
        email: "existing@example.com",
        password: "StrongPlatformPassword123!",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "A user with this email already exists",
    });

    expect(mockHashPassword).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rechecks the Platform Owner count inside the transaction", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockHashPassword.mockResolvedValue("hashed-password");

    const tx = {
      user: {
        count: vi.fn().mockResolvedValue(1),
        create: vi.fn(),
      },
    };

    mockPrisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );

    await expect(
      bootstrapPlatformOwner({
        fullName: "Platform Owner",
        email: "owner@example.com",
        password: "StrongPlatformPassword123!",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "A Platform Owner already exists. Use the existing account recovery flow instead.",
    });

    expect(tx.user.count).toHaveBeenCalledWith({
      where: { securityRole: "PLATFORM_ADMIN" },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });
});
