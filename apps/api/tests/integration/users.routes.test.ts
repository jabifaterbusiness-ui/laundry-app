import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    platformConfig: {
      upsert: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        allowNewBusinessRegistration: true,
        maintenanceMode: false,
        whatsappMessagingEnabled: true,
        automatedNotificationsEnabled: true,
        offlineSyncEnabled: true,
        version: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    },


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
      findUnique: vi.fn(),
    },
    userPermissionOverride: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    branch: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/modules/auth/auth.service.js", () => ({
  hashPassword: vi.fn().mockResolvedValue("argon2id-hash"),
}));

import { prisma } from "../../src/lib/prisma.js";
import { createApp } from "../../src/app.js";

const userFindMany = vi.mocked(prisma.user.findMany);
const userFindFirst = vi.mocked(prisma.user.findFirst);
const userFindUnique = vi.mocked(prisma.user.findUnique);
const userCreate = vi.mocked(prisma.user.create);
const userUpdate = vi.mocked(prisma.user.update);
const userUpdateMany = vi.mocked(prisma.user.updateMany);
const userCount = vi.mocked(prisma.user.count);
const branchFindMany = vi.mocked(prisma.branch.findMany);

function tokenFor(
  role: string,
  businessId: string | null,
  userId = "11111111-1111-4111-8111-111111111111",
) {
  return jwt.sign(
    {
      sub: userId,
      email: "user@example.com",
      role,
      securityRole: role,
      businessId,
    },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: "15m" },
  );
}

const OWNER_A = tokenFor("BUSINESS_OWNER", "biz-A", "11111111-1111-4111-8111-111111111111");
const MANAGER_A = tokenFor("BRANCH_MANAGER", "biz-A", "22222222-2222-4222-8222-222222222222");
const STAFF_A = tokenFor("STAFF", "biz-A", "33333333-3333-4333-8333-333333333333");
const OWNER_B = tokenFor("BUSINESS_OWNER", "biz-B", "44444444-4444-4444-8444-444444444444");
const PLATFORM_ADMIN = tokenFor("PLATFORM_ADMIN", null, "55555555-5555-4555-8555-555555555555");

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(prisma.permission.findUnique).mockImplementation(
    ((args: { where: { code?: string } }) => {
      const code = args.where.code ?? "";
      const [module, action] = code.split(".");

      return Promise.resolve({
        id: `permission-${code}`,
        code,
        module,
        action,
        description: null,
        createdAt: new Date(),
      });
    }) as never,
  );

  vi.mocked(prisma.businessRolePermission.findUnique).mockResolvedValue(
    null,
  );
  vi.mocked(prisma.userPermissionOverride.findUnique).mockResolvedValue(
    null,
  );

  vi.mocked(prisma.$transaction).mockImplementation(
    async (callback) =>
      callback({
        user: {
          findFirst: userFindFirst,
          create: userCreate,
          update: userUpdate,
          count: userCount,
          updateMany: userUpdateMany,
        },
      } as never),
  );

  userCount.mockResolvedValue(2);
  userFindUnique.mockImplementation((async (args: { where: { id?: string } }) => args.where.id
    ? ({ id: args.where.id, isActive: true, deletedAt: null } as never)
    : null) as never);
  branchFindMany.mockResolvedValue([]);
});

describe("Users routes - authentication and context", () => {
  it("rejects unauthenticated requests", async () => {
    const response = await request(app).get("/api/v1/users");

    expect(response.status).toBe(401);
  });

  it("rejects a platform admin without business context", async () => {
    const response = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(response.status).toBe(403);
  });
});

describe("Users routes - tenant isolation", () => {
  it("lists only users from the authenticated business", async () => {
    userFindMany.mockResolvedValue([] as never);

    const response = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(response.status).toBe(200);
    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          deletedAt: null,
          isActive: true,
        },
      }),
    );
  });

  it("cannot retrieve a user outside the authenticated business", async () => {
    userFindFirst.mockResolvedValue(null);

    const response = await request(app)
      .get("/api/v1/users/11111111-1111-4111-8111-111111111111")
      .set("Authorization", `Bearer ${OWNER_B}`);

    expect(response.status).toBe(404);
    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "11111111-1111-4111-8111-111111111111",
          businessId: "biz-B",
          deletedAt: null,
        },
      }),
    );
  });
});

describe("Users routes - permissions", () => {
  it("rejects STAFF from viewing users", async () => {
    const response = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(response.status).toBe(403);
  });

  it("rejects STAFF from creating users", async () => {
    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .send({
        fullName: "New Staff",
        email: "new@example.com",
        password: "password123",
        role: "STAFF",
        branchIds: [],
      });

    expect(response.status).toBe(403);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("allows BRANCH_MANAGER to create users when users.create is explicitly granted", async () => {
    vi.mocked(prisma.userPermissionOverride.findUnique).mockResolvedValue({
      allowed: true,
    } as never);

    const user = {
      id: "88888888-8888-4888-8888-888888888888",
      email: "manager-created@example.com",
      fullName: "Manager Created Staff",
      role: "Laundry Supervisor",
      securityRole: "STAFF",
      isActive: true,
      businessId: "biz-A",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    userCreate.mockResolvedValue(user as never);
    userFindFirst.mockResolvedValueOnce({
      ...user,
      branches: [],
    } as never);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .send({
        fullName: "Manager Created Staff",
        email: "manager-created@example.com",
        password: "password123",
        role: "STAFF",
        branchIds: [],
      });

    expect(response.status).toBe(201);
    expect(userCreate).toHaveBeenCalled();
  });

  it("allows STAFF to view users when users.view is explicitly granted", async () => {
    vi.mocked(prisma.userPermissionOverride.findUnique).mockResolvedValue({
      allowed: true,
    } as never);

    userFindMany.mockResolvedValue([] as never);

    const response = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(response.status).toBe(200);
    expect(userFindMany).toHaveBeenCalled();
  });

  it("allows STAFF to create users when users.create is explicitly granted", async () => {
    vi.mocked(prisma.userPermissionOverride.findUnique).mockResolvedValue({
      allowed: true,
    } as never);

    const user = {
      id: "77777777-7777-4777-8777-777777777777",
      email: "granted@example.com",
      fullName: "Granted Staff",
      role: "Laundry Supervisor",
      securityRole: "STAFF",
      isActive: true,
      businessId: "biz-A",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    userCreate.mockResolvedValue(user as never);
    userFindFirst.mockResolvedValueOnce({
      ...user,
      branches: [],
    } as never);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .send({
        fullName: "Granted Staff",
        email: "granted@example.com",
        password: "password123",
        role: "Laundry Supervisor",
        branchIds: [],
      });

    expect(response.status).toBe(201);
    expect(userCreate).toHaveBeenCalled();
  });

  it("allows BUSINESS_OWNER to create users", async () => {
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "new@example.com",
      fullName: "New Staff",
      role: "Laundry Supervisor",
      securityRole: "STAFF",
      isActive: true,
      businessId: "biz-A",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    userCreate.mockResolvedValue(user as never);
    userFindFirst.mockResolvedValueOnce({
      ...user,
      branches: [],
    } as never);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({
        fullName: "New Staff",
        email: "new@example.com",
        password: "password123",
        role: "Laundry Supervisor",
        branchIds: [],
      });

    expect(response.status).toBe(201);
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          email: "new@example.com",
          role: "Laundry Supervisor",
          securityRole: "STAFF",
        }),
      }),
    );
  });
});

describe("Users routes - custom roles", () => {
  it("allows management to create a user with a custom free-text role", async () => {
    const user = {
      id: "88888888-8888-4888-8888-888888888888",
      email: "positioned@example.com",
      fullName: "Positioned Staff",
      role: "Laundry Supervisor",
      securityRole: "STAFF",
      isActive: true,
      deletedAt: null,
      businessId: "biz-A",
      createdAt: new Date(),
      updatedAt: new Date(),
      branches: [],
    };

    userCreate.mockResolvedValue(user as never);
    userFindFirst.mockResolvedValueOnce(user as never);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({
        fullName: "Positioned Staff",
        email: "positioned@example.com",
        password: "password123",
        role: "Laundry Supervisor",
        branchIds: [],
      });

    expect(response.status).toBe(201);
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "Laundry Supervisor",
          securityRole: "STAFF",
        }),
      }),
    );
  });

  it("allows management to update the user's custom free-text role", async () => {
    const user = {
      id: "99999999-9999-4999-8999-999999999999",
      email: "position-update@example.com",
      fullName: "Position Update",
      role: "Laundry Supervisor",
      securityRole: "STAFF",
      isActive: true,
      deletedAt: null,
      businessId: "biz-A",
      createdAt: new Date(),
      updatedAt: new Date(),
      branches: [],
    };

    userFindFirst
      .mockResolvedValueOnce(user as never)
      .mockResolvedValueOnce(user as never)
      .mockResolvedValueOnce({
        ...user,
        role: "Operations Supervisor",
      } as never);

    userUpdate.mockResolvedValue({
      ...user,
      role: "Operations Supervisor",
    } as never);

    const response = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({
        role: "Operations Supervisor",
      });

    expect(response.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "Operations Supervisor",
        }),
      }),
    );
  });
});

describe("Users routes - deletion", () => {
  it("rejects STAFF from deleting users by default", async () => {
    const response = await request(app)
      .delete("/api/v1/users/88888888-8888-4888-8888-888888888888")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .send({ reason: "Removing an inactive or unauthorized account" });

    expect(response.status).toBe(403);
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("allows STAFF to delete users when users.delete is explicitly granted", async () => {
    vi.mocked(prisma.userPermissionOverride.findUnique).mockResolvedValue({
      allowed: true,
    } as never);

    userFindFirst.mockResolvedValue({
      id: "88888888-8888-4888-8888-888888888888",
      email: "deletable@example.com",
      fullName: "Deletable User",
      role: "Staff",
      securityRole: "STAFF",
      isActive: true,
      deletedAt: null,
      businessId: "biz-A",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    userUpdateMany.mockResolvedValue({ count: 1 } as never);

    const response = await request(app)
      .delete("/api/v1/users/88888888-8888-4888-8888-888888888888")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .send({
        reason: "Removing a user account as authorized by management",
      });

    expect(response.status).not.toBe(403);
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          deletedAt: null,
        }),
        data: expect.objectContaining({
          isActive: false,
          deletedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("allows BUSINESS_OWNER to delete a user", async () => {
    userFindFirst.mockResolvedValue({
      id: "88888888-8888-4888-8888-888888888888",
      email: "deletable@example.com",
      fullName: "Deletable User",
      role: "Staff",
      securityRole: "STAFF",
      isActive: true,
      deletedAt: null,
      businessId: "biz-A",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    userUpdateMany.mockResolvedValue({ count: 1 } as never);

    const response = await request(app)
      .delete("/api/v1/users/88888888-8888-4888-8888-888888888888")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ reason: "Removing an obsolete user account" });

    expect(response.status).not.toBe(403);
    expect(userUpdateMany).toHaveBeenCalled();
  });
});

describe("Users routes - status management", () => {
  it("rejects self-deactivation", async () => {
    userFindFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "owner@example.com",
      fullName: "Owner",
      role: "BUSINESS_OWNER",
      securityRole: "BUSINESS_OWNER",
      isActive: true,
      businessId: "biz-A",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const response = await request(app)
      .patch("/api/v1/users/11111111-1111-4111-8111-111111111111/deactivate")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ reason: "Testing protected self-deactivation rule" });

    expect(response.status).toBe(400);
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects deactivation of the last active owner", async () => {
    userFindFirst.mockResolvedValue({
      id: "owner-target",
      email: "owner@example.com",
      fullName: "Owner",
      role: "BUSINESS_OWNER",
      securityRole: "BUSINESS_OWNER",
      isActive: true,
      businessId: "biz-A",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    userCount.mockResolvedValue(1);

    const response = await request(app)
      .patch("/api/v1/users/66666666-6666-4666-8666-666666666666/deactivate")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ reason: "Testing last active owner protection" });

    expect(response.status).toBe(409);
    expect(userUpdateMany).not.toHaveBeenCalled();
  });
});
