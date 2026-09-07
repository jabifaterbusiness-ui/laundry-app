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
  role: "STAFF" as const,
  isActive: true,
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

  it("rejects platform administrator creation from a business context", async () => {
    await expect(
      createUser(
        {
          fullName: "Platform Admin",
          email: "admin@example.com",
          password: "password123",
          role: "PLATFORM_ADMIN" as never,
          branchIds: [],
        },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(userCreate).not.toHaveBeenCalled();
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

  it("rejects inactive branch assignment", async () => {
    branchFindMany.mockResolvedValue([
      {
        id: "branch-1",
        name: "Closed",
        isActive: false,
        businessId: "biz-A",
      },
    ] as never);

    await expect(
      createUser(
        {
          fullName: "Staff User",
          email: "staff3@example.com",
          password: "password123",
          role: "STAFF",
          branchIds: ["branch-1"],
        },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(userCreate).not.toHaveBeenCalled();
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

  it("never accepts a platform administrator role", async () => {
    userFindFirst.mockResolvedValue({
      ...BASE_USER,
      branches: [],
    } as never);

    await expect(
      updateUser(
        BASE_USER.id,
        { role: "PLATFORM_ADMIN" as never },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(userUpdate).not.toHaveBeenCalled();
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
    });
    expect(JSON.stringify(auditCall)).not.toContain("newpassword123");
  });

  it("protects the last active business owner", async () => {
    userFindFirst.mockResolvedValue({
      ...BASE_USER,
      role: "BUSINESS_OWNER",
      branches: [],
    } as never);
    userCount.mockResolvedValue(1);

    await expect(
      updateUser(
        BASE_USER.id,
        { role: "STAFF" },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe("users.service - setUserActiveStatus", () => {
  it("rejects self-deactivation", async () => {
    userFindFirst.mockResolvedValue(BASE_USER as never);

    await expect(
      setUserActiveStatus(BASE_USER.id, false, {
        ...CONTEXT,
        actorUserId: BASE_USER.id,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("protects the last active business owner from deactivation", async () => {
    userFindFirst.mockResolvedValue({
      ...BASE_USER,
      role: "BUSINESS_OWNER",
    } as never);
    userCount.mockResolvedValue(1);

    await expect(
      setUserActiveStatus(BASE_USER.id, false, CONTEXT),
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

    await setUserActiveStatus(BASE_USER.id, false, CONTEXT);

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
