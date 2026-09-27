import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
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
    },
    userBranch: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
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

vi.mock("../../src/modules/branches/branches.service.js", () => ({
  assignUserToBranch: vi.fn().mockResolvedValue({
    id: "membership-1",
    userId: "user-1",
    branchId: "branch-1",
  }),
  removeUserFromBranch: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import { hashPassword } from "../../src/modules/auth/auth.service.js";
import {
  assignUserToBranch,
  removeUserFromBranch,
} from "../../src/modules/branches/branches.service.js";
import {
  createUser,
  getUser,
  listUsers,
  setUserActiveStatus,
  updateUser,
} from "../../src/modules/users/users.service.js";

const userFindMany = vi.mocked(prisma.user.findMany);
const userFindFirst = vi.mocked(prisma.user.findFirst);
const userFindUnique = vi.mocked(prisma.user.findUnique);
const userCount = vi.mocked(prisma.user.count);
const userCreate = vi.mocked(prisma.user.create);
const userUpdate = vi.mocked(prisma.user.update);
const userUpdateMany = vi.mocked(prisma.user.updateMany);
const branchFindMany = vi.mocked(prisma.branch.findMany);
const userBranchCreate = vi.mocked(prisma.userBranch.create);
const userBranchCreateMany = vi.mocked(prisma.userBranch.createMany);
const userBranchDeleteMany = vi.mocked(prisma.userBranch.deleteMany);
const transaction = vi.mocked(prisma.$transaction);

const BASE_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "staff@example.com",
  fullName: "Staff User",
  role: "Staff",
  securityRole: "STAFF" as const,
  isActive: true,
  deletedAt: null,
  businessId: "biz-A",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const CONTEXT = {
  businessId: "biz-A",
  actorUserId: "owner-A",
  correlationId: "corr-1",
};

beforeEach(() => {
  vi.clearAllMocks();

  transaction.mockImplementation(async (callback) =>
    callback({
      user: {
        findFirst: userFindFirst,
        findFirstOrThrow: vi.fn(),
        create: userCreate,
        update: userUpdate,
        count: userCount,
        updateMany: userUpdateMany,
      },
      userBranch: {
        create: userBranchCreate,
        createMany: userBranchCreateMany,
        deleteMany: userBranchDeleteMany,
      },
    } as never),
  );

  userFindUnique.mockResolvedValue(null);
  userCount.mockResolvedValue(2);
  branchFindMany.mockResolvedValue([]);
});

describe("users.service - listUsers", () => {
  it("lists users scoped to the authenticated business", async () => {
    userFindMany.mockResolvedValue([
      {
        ...BASE_USER,
        branches: [
          { branch: { id: "branch-1", name: "Main", isActive: true } },
        ],
      },
    ] as never);

    const result = await listUsers("biz-A", {
      status: "active",
    });

    expect(result).toHaveLength(1);
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

  it("supports search and role filtering", async () => {
    userFindMany.mockResolvedValue([] as never);

    await listUsers("biz-A", {
      status: "all",
      search: "staff",
      role: "STAFF",
    });

    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          role: "STAFF",
          OR: [
            { fullName: { contains: "staff", mode: "insensitive" } },
            { email: { contains: "staff", mode: "insensitive" } },
          ],
        }),
      }),
    );
  });
});

describe("users.service - getUser", () => {
  it("never reads a user outside the authenticated business", async () => {
    userFindFirst.mockResolvedValue(null);

    await expect(
      getUser(BASE_USER.id, "biz-B"),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: BASE_USER.id,
          businessId: "biz-B",
          deletedAt: null,
        },
      }),
    );
  });
});

describe("users.service - createUser", () => {
  it("hashes the password and creates a business-scoped user", async () => {
    branchFindMany.mockResolvedValue([
      {
        id: "branch-1",
        name: "Main",
        isActive: true,
        businessId: "biz-A",
      },
    ] as never);

    userCreate.mockResolvedValue(BASE_USER as never);
    userFindFirst.mockResolvedValueOnce({
      ...BASE_USER,
      branches: [],
    } as never);

    const result = await createUser(
      {
        fullName: " Staff User ",
        email: "STAFF@EXAMPLE.COM",
        password: "password123",
        role: "STAFF",
        branchIds: ["branch-1"],
      },
      CONTEXT,
    );

    expect(hashPassword).toHaveBeenCalledWith("password123");
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          fullName: "Staff User",
          email: "staff@example.com",
          passwordHash: "argon2id-hash",
          role: "STAFF",
        }),
      }),
    );
    expect(userBranchCreateMany).toHaveBeenCalledWith({
      data: [{ userId: BASE_USER.id, branchId: "branch-1" }],
      skipDuplicates: true,
    });
    expect(result.id).toBe(BASE_USER.id);
  });

  it("creates a business user with a custom Platform Administrator job title while keeping staff security role", async () => {
    userCreate.mockResolvedValue({
      ...BASE_USER,
      id: "created-platform-title",
      fullName: "Platform Admin",
      email: "admin@example.com",
      role: "Platform Administrator",
      securityRole: "STAFF",
    } as never);

    userFindFirst.mockResolvedValue({
      ...BASE_USER,
      id: "created-platform-title",
      fullName: "Platform Admin",
      email: "admin@example.com",
      role: "Platform Administrator",
      securityRole: "STAFF",
      branches: [],
    } as never);

    await createUser(
      {
        fullName: "Platform Admin",
        email: "admin@example.com",
        password: "password123",
        role: "Platform Administrator",
        branchIds: [],
      },
      CONTEXT,
    );

    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "Platform Administrator",
          securityRole: "STAFF",
        }),
      }),
    );
  });

  it("rejects duplicate email", async () => {
    userFindUnique.mockResolvedValue({ id: "existing" } as never);

    await expect(
      createUser(
        {
          fullName: "Another User",
          email: "existing@example.com",
          password: "password123",
          role: "STAFF",
          branchIds: [],
        },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(userCreate).not.toHaveBeenCalled();
  });

  it("rejects branches outside the business", async () => {
    branchFindMany.mockResolvedValue([] as never);

    await expect(
      createUser(
        {
          fullName: "Staff User",
          email: "staff2@example.com",
          password: "password123",
          role: "STAFF",
          branchIds: ["22222222-2222-4222-8222-222222222222"],
        },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(userCreate).not.toHaveBeenCalled();
  });

  it("creates a user with a custom free-text role", async () => {
    userCreate.mockResolvedValue({
      ...BASE_USER,
      role: "Senior Laundry Supervisor",
    } as never);
    userFindFirst.mockResolvedValueOnce({
      ...BASE_USER,
      role: "Senior Laundry Supervisor",
      branches: [],
    } as never);

    await createUser(
      {
        fullName: "Senior Staff",
        email: "senior@example.com",
        password: "password123",
        role: " Senior Laundry Supervisor ",
        branchIds: [],
      },
      CONTEXT,
    );

    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "Senior Laundry Supervisor",
          securityRole: "STAFF",
        }),
      }),
    );
  });
});

describe("users.service - updateUser", () => {
  it("updates only a business-owned user", async () => {
    userFindFirst
      .mockResolvedValueOnce({
        ...BASE_USER,
        branches: [{ branchId: "branch-old" }],
      } as never)
      .mockResolvedValueOnce({
        ...BASE_USER,
        branches: [{ branchId: "branch-old" }],
      } as never)
      .mockResolvedValueOnce({
        ...BASE_USER,
        fullName: "Updated User",
        branches: [],
      } as never);

    branchFindMany.mockResolvedValue([
      {
        id: "branch-new",
        name: "New Branch",
        isActive: true,
        businessId: "biz-A",
      },
    ] as never);

    await updateUser(
      BASE_USER.id,
      {
        fullName: "Updated User",
        branchIds: ["branch-new"],
      },
      CONTEXT,
    );

    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BASE_USER.id },
        data: { fullName: "Updated User" },
      }),
    );
    expect(userBranchDeleteMany).toHaveBeenCalledWith({
      where: { userId: BASE_USER.id, branchId: "branch-old" },
    });
  });

  it("allows changing the visible job title without changing the security role", async () => {
    userFindFirst
      .mockResolvedValueOnce({
        ...BASE_USER,
        branches: [],
      } as never)
      .mockResolvedValueOnce({
        ...BASE_USER,
        role: "Platform Administrator",
        branches: [],
      } as never)
      .mockResolvedValueOnce({
        ...BASE_USER,
        role: "Platform Administrator",
        branches: [],
      } as never);

    await updateUser(
      BASE_USER.id,
      { role: "Platform Administrator" },
      CONTEXT,
    );

    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BASE_USER.id },
        data: { role: "Platform Administrator" },
      }),
    );

    const firstUpdate = userUpdate.mock.calls[0]?.[0];
    if (!firstUpdate) throw new Error("Expected user update call");
    expect(firstUpdate.data).not.toHaveProperty("securityRole");
  });

  it("does not expose or audit the new password", async () => {
    userFindFirst
      .mockResolvedValueOnce({
        ...BASE_USER,
        branches: [],
      } as never)
      .mockResolvedValueOnce({
        ...BASE_USER,
        branches: [],
      } as never)
      .mockResolvedValueOnce({
        ...BASE_USER,
        branches: [],
      } as never);

    await updateUser(
      BASE_USER.id,
      { password: "newpassword123" },
      CONTEXT,
    );

    expect(hashPassword).toHaveBeenCalledWith("newpassword123");

    const auditCall = vi.mocked(recordAuditEvent).mock.calls.at(-1)?.[0];
    expect(auditCall?.metadata).toEqual({
      changedFields: ["password"],
      passwordChanged: true,
    });
    expect(JSON.stringify(auditCall)).not.toContain("newpassword123");
  });

  it("updates a user's custom free-text role", async () => {
    userFindFirst
      .mockResolvedValueOnce({
        ...BASE_USER,
        branches: [],
      } as never)
      .mockResolvedValueOnce({
        ...BASE_USER,
        branches: [],
      } as never)
      .mockResolvedValueOnce({
        ...BASE_USER,
        role: "Operations Supervisor",
        branches: [],
      } as never);

    await updateUser(
      BASE_USER.id,
      { role: " Operations Supervisor " },
      CONTEXT,
    );

    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BASE_USER.id },
        data: { role: "Operations Supervisor" },
      }),
    );
  });

  it("rejects updating a deleted user", async () => {
    userFindFirst.mockResolvedValue(null);

    await expect(
      updateUser(
        BASE_USER.id,
        { role: "Deleted User Role" },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("allows a business owner's visible job title to change without changing ownership security", async () => {
    userFindFirst
      .mockResolvedValueOnce({
        ...BASE_USER,
        role: "Business Owner",
        securityRole: "BUSINESS_OWNER",
        branches: [],
      } as never)
      .mockResolvedValueOnce({
        ...BASE_USER,
        role: "Operations Director",
        securityRole: "BUSINESS_OWNER",
        branches: [],
      } as never)
      .mockResolvedValueOnce({
        ...BASE_USER,
        role: "Operations Director",
        securityRole: "BUSINESS_OWNER",
        branches: [],
      } as never);

    await updateUser(
      BASE_USER.id,
      { role: "Operations Director" },
      CONTEXT,
    );

    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BASE_USER.id },
        data: { role: "Operations Director" },
      }),
    );

    const firstUpdate = userUpdate.mock.calls[0]?.[0];
    if (!firstUpdate) throw new Error("Expected user update call");
    expect(firstUpdate.data).not.toHaveProperty("securityRole");
  });
});

describe("users.service - deleteUser", () => {
  it("soft-deletes a user and preserves the record", async () => {
    userFindFirst.mockResolvedValue({
      ...BASE_USER,
      branches: [],
    } as never);
    userUpdateMany.mockResolvedValue({ count: 1 } as never);
    userFindFirst.mockResolvedValueOnce({
      ...BASE_USER,
      branches: [],
    } as never);

    const txFindFirstOrThrow = vi.fn().mockResolvedValue({
      ...BASE_USER,
      isActive: false,
      deletedAt: new Date(),
    });
    transaction.mockImplementationOnce(async (callback) =>
      callback({
        user: {
          findFirst: userFindFirst,
          findFirstOrThrow: txFindFirstOrThrow,
          create: userCreate,
          update: userUpdate,
          count: userCount,
          updateMany: userUpdateMany,
        },
        userBranch: {
          create: userBranchCreate,
          createMany: userBranchCreateMany,
          deleteMany: userBranchDeleteMany,
        },
      } as never),
    );

    const result = await (await import("../../src/modules/users/users.service.js")).deleteUser(
      BASE_USER.id,
      {
        businessId: "biz-A",
        actorUserId: "owner-A",
        correlationId: "corr-1",
        reason: "Removing a user account as authorized by management",
      },
    );

    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: BASE_USER.id,
          businessId: "biz-A",
          deletedAt: null,
        },
        data: expect.objectContaining({
          isActive: false,
          deletedAt: expect.any(Date),
        }),
      }),
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.deleted",
        entityType: "User",
        entityId: BASE_USER.id,
        businessId: "biz-A",
      }),
    );
    expect(result.id).toBe(BASE_USER.id);
  });

  it("cannot delete the actor's own account", async () => {
    userFindFirst.mockResolvedValue({
      ...BASE_USER,
      branches: [],
    } as never);

    await expect(
      (await import("../../src/modules/users/users.service.js")).deleteUser(
        BASE_USER.id,
        {
          businessId: "biz-A",
          actorUserId: BASE_USER.id,
          correlationId: "corr-1",
          reason: "Testing protected self-deletion rule",
        },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("cannot update or reactivate a deleted user", async () => {
    userFindFirst.mockResolvedValue(null);

    await expect(
      setUserActiveStatus(BASE_USER.id, true, CONTEXT),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(userUpdateMany).not.toHaveBeenCalled();
  });
});

describe("users.service - setUserActiveStatus", () => {
  it("rejects self-deactivation", async () => {
    userFindFirst.mockResolvedValue(BASE_USER as never);

    await expect(
      setUserActiveStatus(BASE_USER.id, false, {
        ...CONTEXT,
        actorUserId: BASE_USER.id,
        reason: "Testing protected self-deactivation rule",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("protects the last active business owner from deactivation", async () => {
    userFindFirst.mockResolvedValue({
      ...BASE_USER,
      role: "Business Owner",
      securityRole: "BUSINESS_OWNER",
      isActive: true,
    } as never);
    userCount.mockResolvedValue(1);

    await expect(
      setUserActiveStatus(BASE_USER.id, false, {
        ...CONTEXT,
        reason: "Testing last active owner protection",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("deactivates a user and records an audit event", async () => {
    userFindFirst
      .mockResolvedValueOnce(BASE_USER as never)
      .mockResolvedValueOnce({
        ...BASE_USER,
        isActive: true,
        branches: [],
      } as never)
      .mockResolvedValueOnce({
        ...BASE_USER,
        isActive: false,
        branches: [],
      } as never);
    userUpdateMany.mockResolvedValue({ count: 1 } as never);

    await setUserActiveStatus(BASE_USER.id, false, {
      ...CONTEXT,
      reason: "User deactivated after management review",
    });

    expect(userUpdateMany).toHaveBeenCalledWith({
      where: {
        id: BASE_USER.id,
        businessId: "biz-A",
      },
      data: { isActive: false },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.deactivated",
        entityType: "User",
        entityId: BASE_USER.id,
        businessId: "biz-A",
      }),
    );
  });
});
