import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";

const { findPermission, findUserOverride, findRoleOverride } = vi.hoisted(() => ({
  findPermission: vi.fn(),
  findUserOverride: vi.fn(),
  findRoleOverride: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    permission: {
      findUnique: findPermission,
    },
    userPermissionOverride: {
      findUnique: findUserOverride,
    },
    businessRolePermission: {
      findUnique: findRoleOverride,
    },
  },
}));

import { hasPermission } from "../../src/modules/permissions/permissions.service.js";

describe("hasPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows PLATFORM_ADMIN without a business context", async () => {
    await expect(
      hasPermission("platform-user", null, "PLATFORM_ADMIN" as Role, "anything"),
    ).resolves.toBe(true);

    expect(findPermission).not.toHaveBeenCalled();
  });

  it("denies non-platform users without a business context", async () => {
    await expect(
      hasPermission("user-1", null, "STAFF" as Role, "customers.view"),
    ).resolves.toBe(false);

    expect(findPermission).not.toHaveBeenCalled();
  });

  it("denies an unknown permission", async () => {
    findPermission.mockResolvedValue(null);

    await expect(
      hasPermission("user-1", "business-1", "STAFF" as Role, "unknown.permission"),
    ).resolves.toBe(false);
  });

  it("uses the user override before the business role override", async () => {
    findPermission.mockResolvedValue({ id: "permission-1" });
    findUserOverride.mockResolvedValue({ allowed: false });
    findRoleOverride.mockResolvedValue({ allowed: true });

    await expect(
      hasPermission("user-1", "business-1", "STAFF" as Role, "customers.view"),
    ).resolves.toBe(false);

    expect(findRoleOverride).not.toHaveBeenCalled();
  });

  it("uses the business role override when there is no user override", async () => {
    findPermission.mockResolvedValue({ id: "permission-1" });
    findUserOverride.mockResolvedValue(null);
    findRoleOverride.mockResolvedValue({ allowed: false });

    await expect(
      hasPermission("user-1", "business-1", "STAFF" as Role, "customers.view"),
    ).resolves.toBe(false);
  });

  it("falls back to the default role permission", async () => {
    findPermission.mockResolvedValue({ id: "permission-1" });
    findUserOverride.mockResolvedValue(null);
    findRoleOverride.mockResolvedValue(null);

    await expect(
      hasPermission("user-1", "business-1", "STAFF" as Role, "customers.view"),
    ).resolves.toBe(true);

    await expect(
      hasPermission("user-1", "business-1", "STAFF" as Role, "payroll.manage"),
    ).resolves.toBe(false);
  });

  it("uses the supplied businessId when resolving overrides", async () => {
    findPermission.mockResolvedValue({ id: "permission-1" });
    findUserOverride.mockResolvedValue(null);
    findRoleOverride.mockResolvedValue(null);

    await hasPermission("user-1", "business-123", "STAFF" as Role, "customers.view");

    expect(findUserOverride).toHaveBeenCalledWith({
      where: {
        businessId_userId_permissionId: {
          businessId: "business-123",
          userId: "user-1",
          permissionId: "permission-1",
        },
      },
      select: { allowed: true },
    });
  });
});
