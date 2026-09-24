import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";

const {
  findPermission,
  findUserOverride,
  findUserOverrides,
  findRoleOverride,
  findUser,
  findRoleOverrides,
  upsertRoleOverride,
  deleteRoleOverride,
  upsertUserOverride,
  deleteUserOverride,
} = vi.hoisted(() => ({
  findPermission: vi.fn(),
  findUserOverride: vi.fn(),
  findUserOverrides: vi.fn(),
  findRoleOverride: vi.fn(),
  findUser: vi.fn(),
  findRoleOverrides: vi.fn(),
  upsertRoleOverride: vi.fn(),
  deleteRoleOverride: vi.fn(),
  upsertUserOverride: vi.fn(),
  deleteUserOverride: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    permission: {
      findUnique: findPermission,
    },
    user: {
      findFirst: findUser,
    },
    userPermissionOverride: {
      findUnique: findUserOverride,
      findMany: findUserOverrides,
      upsert: upsertUserOverride,
      deleteMany: deleteUserOverride,
    },
    businessRolePermission: {
      findUnique: findRoleOverride,
      findMany: findRoleOverrides,
      upsert: upsertRoleOverride,
      deleteMany: deleteRoleOverride,
    },
  },
}));

import {
  getEffectivePermissionCodes,
  hasPermission,
  getPermissionDefinition,
  listPermissions,
  getRolePermissions,
  getUserPermissions,
  requirePermissionForGrant,
  upsertBusinessRolePermission,
  removeBusinessRolePermission,
  upsertUserPermissionOverride,
  removeUserPermissionOverride,
} from "../../src/modules/permissions/permissions.service.js";

describe("getEffectivePermissionCodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns every catalog permission for PLATFORM_ADMIN without a business", async () => {
    await expect(
      getEffectivePermissionCodes(
        null,
        "platform-user",
        "PLATFORM_ADMIN" as Role,
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        "customers.view",
        "users.manage_permissions",
        "business.update",
      ]),
    );

    expect(findUserOverrides).not.toHaveBeenCalled();
    expect(findRoleOverrides).not.toHaveBeenCalled();
  });

  it("returns every catalog permission for BUSINESS_OWNER despite stored overrides", async () => {
    const permissions = await getEffectivePermissionCodes(
      "business-1",
      "owner-1",
      "BUSINESS_OWNER" as Role,
    );

    expect(permissions).toEqual(
      expect.arrayContaining([
        "customers.view",
        "reports.view",
        "expenses.manage",
        "users.manage_permissions",
      ]),
    );

    expect(findUserOverrides).not.toHaveBeenCalled();
    expect(findRoleOverrides).not.toHaveBeenCalled();
  });

  it("returns no permissions for a non-platform user without a business", async () => {
    await expect(
      getEffectivePermissionCodes(null, "user-1", "STAFF" as Role),
    ).resolves.toEqual([]);

    expect(findUserOverrides).not.toHaveBeenCalled();
    expect(findRoleOverrides).not.toHaveBeenCalled();
  });

  it("uses only individual user overrides for ordinary users", async () => {
    findUserOverrides.mockResolvedValue([
      {
        permission: { code: "customers.view" },
        allowed: true,
      },
      {
        permission: { code: "reports.view" },
        allowed: false,
      },
    ]);

    const permissions = await getEffectivePermissionCodes(
      "business-1",
      "user-1",
      "STAFF" as Role,
    );

    expect(permissions).toContain("customers.view");
    expect(permissions).not.toContain("reports.view");
    expect(findRoleOverrides).not.toHaveBeenCalled();
  });
});

describe("hasPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows PLATFORM_ADMIN without a business context", async () => {
    await expect(
      hasPermission(
        "platform-user",
        null,
        "PLATFORM_ADMIN" as Role,
        "anything",
      ),
    ).resolves.toBe(true);

    expect(findPermission).not.toHaveBeenCalled();
  });

  it("allows BUSINESS_OWNER for catalog permissions despite overrides", async () => {
    await expect(
      hasPermission(
        "owner-1",
        "business-1",
        "BUSINESS_OWNER" as Role,
        "reports.view",
      ),
    ).resolves.toBe(true);

    await expect(
      hasPermission(
        "owner-1",
        "business-1",
        "BUSINESS_OWNER" as Role,
        "expenses.manage",
      ),
    ).resolves.toBe(true);

    expect(findPermission).not.toHaveBeenCalled();
    expect(findUserOverride).not.toHaveBeenCalled();
    expect(findRoleOverride).not.toHaveBeenCalled();
  });

  it("denies non-platform users without a business context", async () => {
    await expect(
      hasPermission(
        "user-1",
        null,
        "STAFF" as Role,
        "customers.view",
      ),
    ).resolves.toBe(false);

    expect(findPermission).not.toHaveBeenCalled();
  });

  it("denies an unknown permission", async () => {
    findPermission.mockResolvedValue(null);

    await expect(
      hasPermission(
        "user-1",
        "business-1",
        "STAFF" as Role,
        "unknown.permission",
      ),
    ).resolves.toBe(false);
  });

  it("uses the user override before the business role override", async () => {
    findPermission.mockResolvedValue({ id: "permission-1" });
    findUserOverride.mockResolvedValue({ allowed: false });
    findRoleOverride.mockResolvedValue({ allowed: true });

    await expect(
      hasPermission(
        "user-1",
        "business-1",
        "STAFF" as Role,
        "customers.view",
      ),
    ).resolves.toBe(false);

    expect(findRoleOverride).not.toHaveBeenCalled();
  });

  it("denies ordinary users unless an individual override grants access", async () => {
    findPermission.mockResolvedValue({ id: "permission-1" });
    findUserOverride.mockResolvedValue(null);

    await expect(
      hasPermission(
        "user-1",
        "business-1",
        "STAFF" as Role,
        "customers.view",
      ),
    ).resolves.toBe(false);

    expect(findRoleOverride).not.toHaveBeenCalled();
  });

  it("uses the supplied businessId when resolving overrides", async () => {
    findPermission.mockResolvedValue({ id: "permission-1" });
    findUserOverride.mockResolvedValue(null);
    findRoleOverride.mockResolvedValue(null);

    await hasPermission(
      "user-1",
      "business-123",
      "STAFF" as Role,
      "customers.view",
    );

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

describe("permission administration helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a known permission definition", () => {
    expect(getPermissionDefinition("customers.view")).toEqual({
      code: "customers.view",
      module: "customers",
      action: "view",
      description: "View customers",
    });
  });

  it("rejects an unknown permission definition", () => {
    expect(() => getPermissionDefinition("unknown.permission")).toThrow(
      "Unknown permission: unknown.permission",
    );
  });

  it("lists the complete permission catalog", async () => {
    const permissions = await listPermissions();

    expect(permissions.length).toBeGreaterThan(0);
    expect(permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "customers.view" }),
        expect.objectContaining({ code: "users.manage_permissions" }),
      ]),
    );
  });

  it("returns role permissions with default source", async () => {
    findRoleOverrides.mockResolvedValue([]);

    const result = await getRolePermissions(
      "business-1",
      "STAFF" as Role,
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "customers.view",
          allowed: false,
          source: "default",
        }),
        expect.objectContaining({
          code: "payroll.manage",
          allowed: false,
          source: "default",
        }),
      ]),
    );

    expect(findRoleOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "business-1",
          role: "STAFF",
        },
      }),
    );
  });

  it("applies business role overrides over defaults", async () => {
    findRoleOverrides.mockResolvedValue([
      {
        permission: {
          code: "customers.view",
          module: "customers",
          action: "view",
          description: "View customers",
        },
        allowed: false,
      },
    ]);

    const result = await getRolePermissions(
      "business-1",
      "STAFF" as Role,
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "customers.view",
          allowed: false,
          source: "business_role_override",
        }),
      ]),
    );
  });

  it("returns effective user permissions with user override precedence", async () => {
    findUser.mockResolvedValue({
      id: "user-1",
      email: "staff@example.com",
      fullName: "Staff User",
      role: "STAFF",
      isActive: true,
      businessId: "business-1",
    });

    findUserOverrides.mockResolvedValue([
      {
        permission: {
          code: "customers.view",
          module: "customers",
          action: "view",
          description: "View customers",
        },
        allowed: false,
      },
    ]);

    findRoleOverrides.mockResolvedValue([
      {
        permission: {
          code: "customers.view",
          module: "customers",
          action: "view",
          description: "View customers",
        },
        allowed: true,
      },
    ]);

    const result = await getUserPermissions(
      "business-1",
      "user-1",
    );

    expect(result.user).toEqual(
      expect.objectContaining({
        id: "user-1",
        role: "STAFF",
        email: "staff@example.com",
        fullName: "Staff User",
        isActive: true,
      }),
    );

    expect(result.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "customers.view",
          allowed: false,
          source: "user_override",
        }),
      ]),
    );
  });

  it("rejects getting permissions for a user outside the business", async () => {
    findUser.mockResolvedValue(null);

    await expect(
      getUserPermissions("business-1", "user-from-business-2"),
    ).rejects.toThrow("User not found in this business");

    expect(findUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "user-from-business-2",
          businessId: "business-1",
        },
      }),
    );
  });

  it("allows an actor to grant a permission they possess", async () => {
    findPermission.mockResolvedValue({ id: "permission-1" });
    findUserOverride.mockResolvedValue({ allowed: true });
    findRoleOverride.mockResolvedValue(null);

    await expect(
      requirePermissionForGrant(
        "user-1",
        "business-1",
        "STAFF" as Role,
        "customers.view",
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects an actor from granting a permission they do not possess", async () => {
    findPermission.mockResolvedValue({ id: "permission-1" });
    findUserOverride.mockResolvedValue(null);
    findRoleOverride.mockResolvedValue(null);

    await expect(
      requirePermissionForGrant(
        "user-1",
        "business-1",
        "STAFF" as Role,
        "payroll.manage",
      ),
    ).rejects.toThrow(
      "You cannot grant a permission that you do not possess",
    );
  });

  it("upserts a business role permission in the correct business", async () => {
    findPermission.mockResolvedValue({ id: "permission-1" });

    upsertRoleOverride.mockResolvedValue({
      id: "role-override-1",
      role: "STAFF",
      allowed: false,
      permission: {
        code: "customers.view",
        module: "customers",
        action: "view",
        description: "View customers",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await upsertBusinessRolePermission(
      "business-1",
      "STAFF" as Role,
      "customers.view",
      false,
    );

    expect(upsertRoleOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId_role_permissionId: {
            businessId: "business-1",
            role: "STAFF",
            permissionId: "permission-1",
          },
        },
        create: expect.objectContaining({
          businessId: "business-1",
          role: "STAFF",
          permissionId: "permission-1",
          allowed: false,
        }),
        update: {
          allowed: false,
        },
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: "role-override-1",
        role: "STAFF",
        allowed: false,
      }),
    );
  });

  it("rejects business configuration of BUSINESS_OWNER", async () => {
    await expect(
      upsertBusinessRolePermission(
        "business-1",
        "BUSINESS_OWNER" as Role,
        "reports.view",
        false,
      ),
    ).rejects.toThrow(
      "BUSINESS_OWNER permissions cannot be restricted at business level",
    );

    await expect(
      removeBusinessRolePermission(
        "business-1",
        "BUSINESS_OWNER" as Role,
        "reports.view",
      ),
    ).rejects.toThrow(
      "BUSINESS_OWNER permissions cannot be restricted at business level",
    );
  });

  it("rejects business configuration of PLATFORM_ADMIN", async () => {
    await expect(
      upsertBusinessRolePermission(
        "business-1",
        "PLATFORM_ADMIN" as Role,
        "customers.view",
        true,
      ),
    ).rejects.toThrow(
      "PLATFORM_ADMIN permissions cannot be configured at business level",
    );
  });

  it("removes a business role override within the business scope", async () => {
    deleteRoleOverride.mockResolvedValue({ count: 1 });

    await expect(
      removeBusinessRolePermission(
        "business-1",
        "STAFF" as Role,
        "customers.view",
      ),
    ).resolves.toEqual({ removed: true });

    expect(deleteRoleOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "business-1",
          role: "STAFF",
          permission: {
            code: "customers.view",
          },
        }),
      }),
    );
  });

  it("rejects removing a missing business role override", async () => {
    deleteRoleOverride.mockResolvedValue({ count: 0 });

    await expect(
      removeBusinessRolePermission(
        "business-1",
        "STAFF" as Role,
        "customers.view",
      ),
    ).rejects.toThrow("Business role permission override not found");
  });

  it("rejects user permission restrictions for a BUSINESS_OWNER", async () => {
    findUser.mockResolvedValue({
      id: "owner-1",
      businessId: "business-1",
      role: "Business Owner",
      securityRole: "BUSINESS_OWNER",
    });

    await expect(
      upsertUserPermissionOverride(
        "business-1",
        "owner-1",
        "reports.view",
        false,
      ),
    ).rejects.toThrow(
      "BUSINESS_OWNER permissions cannot be restricted",
    );

    await expect(
      removeUserPermissionOverride(
        "business-1",
        "owner-1",
        "reports.view",
      ),
    ).rejects.toThrow(
      "BUSINESS_OWNER permissions cannot be restricted",
    );

    expect(findPermission).not.toHaveBeenCalled();
    expect(upsertUserOverride).not.toHaveBeenCalled();
    expect(deleteUserOverride).not.toHaveBeenCalled();
  });

  it("upserts a user permission override in the correct business", async () => {
    findUser.mockResolvedValue({
      id: "user-1",
      businessId: "business-1",
    });

    findPermission.mockResolvedValue({ id: "permission-1" });

    upsertUserOverride.mockResolvedValue({
      id: "user-override-1",
      allowed: true,
      permission: {
        code: "customers.view",
        module: "customers",
        action: "view",
        description: "View customers",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await upsertUserPermissionOverride(
      "business-1",
      "user-1",
      "customers.view",
      true,
    );

    expect(upsertUserOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId_userId_permissionId: {
            businessId: "business-1",
            userId: "user-1",
            permissionId: "permission-1",
          },
        },
        create: expect.objectContaining({
          businessId: "business-1",
          userId: "user-1",
          permissionId: "permission-1",
          allowed: true,
        }),
        update: {
          allowed: true,
        },
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: "user-override-1",
        allowed: true,
      }),
    );
  });

  it("rejects creating a user override for another business", async () => {
    findUser.mockResolvedValue(null);

    await expect(
      upsertUserPermissionOverride(
        "business-1",
        "user-from-business-2",
        "customers.view",
        true,
      ),
    ).rejects.toThrow("User not found in this business");

    expect(upsertUserOverride).not.toHaveBeenCalled();
  });

  it("removes a user override within the business scope", async () => {
    findUser.mockResolvedValue({
      id: "user-1",
      businessId: "business-1",
    });

    deleteUserOverride.mockResolvedValue({ count: 1 });

    await expect(
      removeUserPermissionOverride(
        "business-1",
        "user-1",
        "customers.view",
      ),
    ).resolves.toEqual({ removed: true });

    expect(deleteUserOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "business-1",
          userId: "user-1",
          permission: {
            code: "customers.view",
          },
        }),
      }),
    );
  });

  it("rejects removing a user override that does not exist", async () => {
    findUser.mockResolvedValue({
      id: "user-1",
      businessId: "business-1",
    });

    deleteUserOverride.mockResolvedValue({ count: 0 });

    await expect(
      removeUserPermissionOverride(
        "business-1",
        "user-1",
        "customers.view",
      ),
    ).rejects.toThrow("User permission override not found");
  });
});
