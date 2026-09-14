import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn().mockResolvedValue({
        id: "sub-test",
        businessId: "biz-A",
        plan: "MONTHLY",
        status: "ACTIVE",
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: new Date("2099-01-01T00:00:00.000Z"),
      }),
    },
    permission: {
      findUnique: vi.fn(),
    },
    businessRolePermission: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    userPermissionOverride: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import { createApp } from "../../src/app.js";

const findPermission = vi.mocked(prisma.permission.findUnique);
const findRoleOverrides = vi.mocked(prisma.businessRolePermission.findMany);
const findRoleOverride = vi.mocked(prisma.businessRolePermission.findUnique);
const upsertRoleOverride = vi.mocked(prisma.businessRolePermission.upsert);
const deleteRoleOverride = vi.mocked(prisma.businessRolePermission.deleteMany);

const findUserOverrides = vi.mocked(prisma.userPermissionOverride.findMany);
const findUserOverride = vi.mocked(prisma.userPermissionOverride.findUnique);
const upsertUserOverride = vi.mocked(prisma.userPermissionOverride.upsert);
const deleteUserOverride = vi.mocked(prisma.userPermissionOverride.deleteMany);

const findUser = vi.mocked(prisma.user.findFirst);

function tokenFor(
  role: string,
  businessId: string | null,
  userId = "user-1",
) {
  return jwt.sign(
    {
      sub: userId,
      email: "user@example.com",
      role,
      businessId,
    },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: "15m" },
  );
}

const OWNER_A = tokenFor("BUSINESS_OWNER", "biz-A");
const STAFF_A = tokenFor("STAFF", "biz-A", "user-staff-a");
const OWNER_B = tokenFor("BUSINESS_OWNER", "biz-B", "user-owner-b");
const NO_BUSINESS = tokenFor("BUSINESS_OWNER", null, "user-no-business");

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();

  findPermission.mockImplementation(((args: { where: { code?: string } }) => {
    const code = args.where.code ?? "";

    return Promise.resolve({
      id: code === "users.manage_permissions"
        ? "permission-manage-permissions"
        : `permission-${code}`,
      code,
      module: code.split(".")[0],
      action: code.split(".")[1] ?? "",
      description: null,
      createdAt: new Date(),
    });
  }) as never);

  findRoleOverride.mockResolvedValue(null);
  findUserOverride.mockResolvedValue(null);

  findUser.mockResolvedValue({
    id: "user-1",
    businessId: "biz-A",
    email: "user@example.com",
    fullName: "Business Owner",
    role: "BUSINESS_OWNER",
    isActive: true,
  } as never);
});

describe("permissions routes", () => {
  describe("authentication and authorization", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await request(app).get("/api/v1/permissions/");

      expect(response.status).toBe(401);
    });

    it("rejects users without a business context", async () => {
      const response = await request(app)
        .get("/api/v1/permissions/")
        .set("Authorization", `Bearer ${NO_BUSINESS}`);

      expect(response.status).toBe(403);
    });

    it("rejects staff without users.manage_permissions", async () => {
      findPermission.mockResolvedValue({
        id: "permission-1",
        code: "users.manage_permissions",
      } as never);

      findUserOverrides.mockResolvedValue([]);
      findRoleOverrides.mockResolvedValue([]);

      const response = await request(app)
        .get("/api/v1/permissions/")
        .set("Authorization", `Bearer ${STAFF_A}`);

      expect(response.status).toBe(403);
    });
  });

  describe("permission catalog", () => {
    it("lists the permission catalog for an authorized business user", async () => {
      const response = await request(app)
        .get("/api/v1/permissions/")
        .set("Authorization", `Bearer ${OWNER_A}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "users.manage_permissions",
            module: "users",
          }),
        ]),
      );
    });
  });

  describe("role permissions", () => {
    it("returns effective permissions for a business role", async () => {
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
      ] as never);

      const response = await request(app)
        .get("/api/v1/permissions/roles/STAFF")
        .set("Authorization", `Bearer ${OWNER_A}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "customers.view",
            allowed: false,
            source: "business_role_override",
          }),
        ]),
      );
    });

    it("rejects PLATFORM_ADMIN role configuration", async () => {
      const response = await request(app)
        .get("/api/v1/permissions/roles/PLATFORM_ADMIN")
        .set("Authorization", `Bearer ${OWNER_A}`);

      expect(response.status).toBe(400);
    });

    it("updates a business role permission", async () => {
      findPermission.mockResolvedValue({
        id: "permission-1",
        code: "customers.view",
        module: "customers",
        action: "view",
        description: "View customers",
      } as never);

      upsertRoleOverride.mockResolvedValue({
        id: "role-override-1",
        role: "STAFF",
        allowed: true,
        permission: {
          code: "customers.view",
          module: "customers",
          action: "view",
          description: "View customers",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const response = await request(app)
        .put("/api/v1/permissions/roles/STAFF/customers.view")
        .set("Authorization", `Bearer ${OWNER_A}`)
        .send({ allowed: true });

      expect(response.status).toBe(200);
      expect(upsertRoleOverride).toHaveBeenCalled();
      expect(recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "permission.role.updated",
          businessId: "biz-A",
          actorUserId: "user-1",
        }),
      );
    });

    it("rejects granting a permission the actor does not possess", async () => {
      findPermission.mockResolvedValue({
        id: "permission-1",
        code: "payroll.approve",
        module: "payroll",
        action: "approve",
        description: "Approve payroll transactions",
      } as never);

      findUserOverrides.mockResolvedValue([]);
      findRoleOverride.mockResolvedValue({
        allowed: false,
      } as never);

      const response = await request(app)
        .put("/api/v1/permissions/roles/STAFF/payroll.approve")
        .set("Authorization", `Bearer ${OWNER_A}`)
        .send({ allowed: true });

      expect(response.status).toBe(403);
      expect(upsertRoleOverride).not.toHaveBeenCalled();
    });

    it("allows denying a permission without possessing it", async () => {
      findPermission.mockResolvedValue({
        id: "permission-1",
        code: "payroll.approve",
        module: "payroll",
        action: "approve",
        description: "Approve payroll transactions",
      } as never);

      upsertRoleOverride.mockResolvedValue({
        id: "role-override-2",
        role: "STAFF",
        allowed: false,
        permission: {
          code: "payroll.approve",
          module: "payroll",
          action: "approve",
          description: "Approve payroll transactions",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const response = await request(app)
        .put("/api/v1/permissions/roles/STAFF/payroll.approve")
        .set("Authorization", `Bearer ${OWNER_A}`)
        .send({ allowed: false });

      expect(response.status).toBe(200);
      expect(upsertRoleOverride).toHaveBeenCalled();
    });

    it("removes a business role permission override", async () => {
      deleteRoleOverride.mockResolvedValue({ count: 1 });

      const response = await request(app)
        .delete("/api/v1/permissions/roles/STAFF/customers.view")
        .set("Authorization", `Bearer ${OWNER_A}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ removed: true });
      expect(deleteRoleOverride).toHaveBeenCalled();
      expect(recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "permission.role.removed",
          businessId: "biz-A",
        }),
      );
    });
  });

  describe("user permissions", () => {
    it("returns effective permissions for a user in the business", async () => {
      findUser.mockResolvedValue({
        id: "user-staff-a",
        businessId: "biz-A",
        email: "staff@example.com",
        fullName: "Staff User",
        role: "STAFF",
        isActive: true,
      } as never);

      findUserOverrides.mockResolvedValue([]);
      findRoleOverrides.mockResolvedValue([]);

      const response = await request(app)
        .get("/api/v1/permissions/users/11111111-1111-4111-8111-111111111111")
        .set("Authorization", `Bearer ${OWNER_A}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          user: expect.objectContaining({
            id: "user-staff-a",
            role: "STAFF",
          }),
          permissions: expect.any(Array),
        }),
      );
    });

    it("rejects a user outside the business", async () => {
      findUser.mockResolvedValue(null);

      const response = await request(app)
        .get("/api/v1/permissions/users/22222222-2222-4222-8222-222222222222")
        .set("Authorization", `Bearer ${OWNER_A}`);

      expect(response.status).toBe(404);
    });

    it("updates a user permission override", async () => {
      findUser.mockResolvedValue({
        id: "user-staff-a",
        businessId: "biz-A",
        email: "staff@example.com",
        fullName: "Staff User",
        role: "STAFF",
        isActive: true,
      } as never);

      findPermission.mockResolvedValue({
        id: "permission-1",
        code: "customers.view",
        module: "customers",
        action: "view",
        description: "View customers",
      } as never);

      upsertUserOverride.mockResolvedValue({
        id: "user-override-1",
        allowed: false,
        permission: {
          code: "customers.view",
          module: "customers",
          action: "view",
          description: "View customers",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const response = await request(app)
        .put("/api/v1/permissions/users/11111111-1111-4111-8111-111111111111/customers.view")
        .set("Authorization", `Bearer ${OWNER_A}`)
        .send({ allowed: false });

      expect(response.status).toBe(200);
      expect(upsertUserOverride).toHaveBeenCalled();
      expect(recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "permission.user.updated",
          businessId: "biz-A",
          actorUserId: "user-1",
        }),
      );
    });

    it("removes a user permission override", async () => {
      findUser.mockResolvedValue({
        id: "user-staff-a",
        businessId: "biz-A",
        email: "staff@example.com",
        fullName: "Staff User",
        role: "STAFF",
        isActive: true,
      } as never);

      deleteUserOverride.mockResolvedValue({ count: 1 });

      const response = await request(app)
        .delete("/api/v1/permissions/users/11111111-1111-4111-8111-111111111111/customers.view")
        .set("Authorization", `Bearer ${OWNER_A}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ removed: true });
      expect(deleteUserOverride).toHaveBeenCalled();
      expect(recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "permission.user.removed",
          businessId: "biz-A",
        }),
      );
    });
  });
});
