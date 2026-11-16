import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findFirst: vi.fn() },
    permission: { findMany: vi.fn(), findUnique: vi.fn() },
    userPermissionOverride: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  transaction: {
    userPermissionOverride: { upsert: vi.fn() },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { PERMISSIONS } from "../../src/modules/permissions/permissions.catalog.js";
import {
  allowAllUserPermissions,
  hasPermission,
} from "../../src/modules/permissions/permissions.service.js";

const BUSINESS_ID = "business-a";
const USER_ID = "staff-a";

function setBusinessUser() {
  mocks.prisma.user.findFirst.mockResolvedValue({
    id: USER_ID,
    email: "staff@example.com",
    fullName: "Staff Member",
    role: "STAFF",
    securityRole: "STAFF",
    isActive: true,
    businessId: BUSINESS_ID,
  });
}

describe("permission catalogue and bulk grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBusinessUser();
    mocks.prisma.$transaction.mockImplementation(
      async (callback) => callback(mocks.transaction),
    );
    mocks.transaction.userPermissionOverride.upsert.mockResolvedValue({});
  });

  it("grants every catalogue permission, including all eight chat permissions", async () => {
    mocks.prisma.permission.findMany.mockResolvedValue(
      PERMISSIONS.map((permission, index) => ({
        id: `permission-${index}`,
        code: permission.code,
      })),
    );

    const result = await allowAllUserPermissions(BUSINESS_ID, USER_ID);

    expect(result).toEqual({ allowed: true, count: PERMISSIONS.length });
    expect(mocks.prisma.permission.findMany).toHaveBeenCalledWith({
      where: { code: { in: PERMISSIONS.map((permission) => permission.code) } },
      select: { id: true, code: true },
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.transaction.userPermissionOverride.upsert).toHaveBeenCalledTimes(
      PERMISSIONS.length,
    );
    expect(
      PERMISSIONS.filter((permission) => permission.code.startsWith("chat.")),
    ).toHaveLength(8);
  });

  it("fails safely when even one catalogue permission record is missing", async () => {
    mocks.prisma.permission.findMany.mockResolvedValue(
      PERMISSIONS.slice(1).map((permission, index) => ({
        id: `permission-${index}`,
        code: permission.code,
      })),
    );

    await expect(
      allowAllUserPermissions(BUSINESS_ID, USER_ID),
    ).rejects.toThrow(
      "Permission catalogue is incomplete; cannot allow all permissions",
    );

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.transaction.userPermissionOverride.upsert).not.toHaveBeenCalled();
  });

  it("does not allow bulk grants to target a user from another business", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      allowAllUserPermissions(BUSINESS_ID, "user-from-business-b"),
    ).rejects.toThrow("User not found in this business");

    expect(mocks.prisma.permission.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("enforces permission overrides within the requested business and user", async () => {
    mocks.prisma.permission.findUnique.mockResolvedValue({ id: "chat-view-id" });
    mocks.prisma.userPermissionOverride.findUnique.mockResolvedValue({
      allowed: true,
    });

    await expect(
      hasPermission(USER_ID, BUSINESS_ID, "STAFF", "chat.view"),
    ).resolves.toBe(true);

    expect(mocks.prisma.userPermissionOverride.findUnique).toHaveBeenCalledWith({
      where: {
        businessId_userId_permissionId: {
          businessId: BUSINESS_ID,
          userId: USER_ID,
          permissionId: "chat-view-id",
        },
      },
      select: { allowed: true },
    });
  });

  it("denies permissions when no explicit user override exists", async () => {
    mocks.prisma.permission.findUnique.mockResolvedValue({ id: "chat-view-id" });
    mocks.prisma.userPermissionOverride.findUnique.mockResolvedValue(null);

    await expect(
      hasPermission(USER_ID, BUSINESS_ID, "STAFF", "chat.view"),
    ).resolves.toBe(false);
  });
});
