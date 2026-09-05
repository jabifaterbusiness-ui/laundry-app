import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    branch: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    userBranch: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
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

const findMany = vi.mocked(prisma.branch.findMany);
const findFirst = vi.mocked(prisma.branch.findFirst);
const create = vi.mocked(prisma.branch.create);
const updateMany = vi.mocked(prisma.branch.updateMany);
const userBranchFindMany = vi.mocked(prisma.userBranch.findMany);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
const userBranchCreate = vi.mocked(prisma.userBranch.create);
const userBranchDeleteMany = vi.mocked(prisma.userBranch.deleteMany);
const userFindFirst = vi.mocked(prisma.user.findFirst);

function tokenFor(role: string, businessId: string | null, userId = "user-1") {
  return jwt.sign(
    { sub: userId, email: "user@example.com", role, businessId },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: "15m" },
  );
}

const OWNER_A = tokenFor("BUSINESS_OWNER", "biz-A");
const STAFF_A = tokenFor("STAFF", "biz-A", "user-staff-a");
const MANAGER_A = tokenFor("BRANCH_MANAGER", "biz-A", "user-mgr-a");
const OWNER_B = tokenFor("BUSINESS_OWNER", "biz-B", "user-owner-b");
const PLATFORM_ADMIN = tokenFor("PLATFORM_ADMIN", null, "user-admin");

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Branches routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/branches");
    expect(res.status).toBe(401);
  });

  it("rejects a PLATFORM_ADMIN without business context", async () => {
    const res = await request(app)
      .get("/api/v1/branches")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);
    expect(res.status).toBe(403);
  });
});

describe("Branches routes - tenant isolation", () => {
  it("business A can list its own branches", async () => {
    findMany.mockResolvedValue([{ id: "branch-a", businessId: "biz-A", name: "Main Branch" }] as never);

    const res = await request(app)
      .get("/api/v1/branches")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessId: "biz-A" }),
    }));
  });

  it("business B cannot access business A branch by id", async () => {
    findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/branches/11111111-1111-1111-1111-111111111111")
      .set("Authorization", `Bearer ${OWNER_B}`);

    expect(res.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "11111111-1111-1111-1111-111111111111",
        businessId: "biz-B",
      },
    });
  });
});

describe("Branches routes - authorization", () => {
  it("allows STAFF to view branches", async () => {
    findMany.mockResolvedValue([] as never);
    const res = await request(app)
      .get("/api/v1/branches")
      .set("Authorization", `Bearer ${STAFF_A}`);
    expect(res.status).toBe(200);
  });

  it("allows BRANCH_MANAGER to view branches", async () => {
    findMany.mockResolvedValue([] as never);
    const res = await request(app)
      .get("/api/v1/branches")
      .set("Authorization", `Bearer ${MANAGER_A}`);
    expect(res.status).toBe(200);
  });

  it("rejects STAFF from creating a branch", async () => {
    const res = await request(app)
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .send({ name: "New Branch" });
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects BRANCH_MANAGER from creating a branch", async () => {
    const res = await request(app)
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .send({ name: "New Branch" });
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("allows BUSINESS_OWNER to create a branch", async () => {
    create.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      businessId: "biz-A",
      name: "New Branch",
      address: null,
      isActive: true,
    } as never);

    const res = await request(app)
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ name: "New Branch", address: "Abuja" });

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        businessId: "biz-A",
        name: "New Branch",
        address: "Abuja",
      }),
    }));
  });
});

describe("Branches routes - update and status", () => {
  it("allows BUSINESS_OWNER to update a branch", async () => {
    updateMany.mockResolvedValue({ count: 1 } as never);
    findFirst.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      businessId: "biz-A",
      name: "Updated Branch",
      address: "Lagos Street",
      isActive: true,
    } as never);

    const res = await request(app)
      .patch("/api/v1/branches/22222222-2222-2222-2222-222222222222")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ name: "Updated Branch", address: "Lagos Street" });

    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "22222222-2222-2222-2222-222222222222",
        businessId: "biz-A",
      }),
    }));
  });

  it("rejects STAFF from updating a branch", async () => {
    const res = await request(app)
      .patch("/api/v1/branches/22222222-2222-2222-2222-222222222222")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .send({ name: "Not Allowed" });
    expect(res.status).toBe(403);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("allows BUSINESS_OWNER to deactivate a branch", async () => {
    updateMany.mockResolvedValue({ count: 1 } as never);
    findFirst.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      businessId: "biz-A",
      name: "Main Branch",
      address: null,
      isActive: false,
    } as never);

    const res = await request(app)
      .patch("/api/v1/branches/22222222-2222-2222-2222-222222222222/deactivate")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { isActive: false },
    }));
  });

  it("allows BUSINESS_OWNER to activate a branch", async () => {
    updateMany.mockResolvedValue({ count: 1 } as never);
    findFirst.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      businessId: "biz-A",
      name: "Main Branch",
      address: null,
      isActive: true,
    } as never);

    const res = await request(app)
      .patch("/api/v1/branches/22222222-2222-2222-2222-222222222222/activate")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { isActive: true },
    }));
  });
});

describe("Branches routes - validation and not found", () => {
  it("rejects an invalid branch id", async () => {
    const res = await request(app)
      .get("/api/v1/branches/not-a-uuid")
      .set("Authorization", `Bearer ${OWNER_A}`);
    expect(res.status).toBe(422);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("rejects creating a branch without a name", async () => {
    const res = await request(app)
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ address: "Abuja" });
    expect(res.status).toBe(422);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an empty branch name", async () => {
    const res = await request(app)
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ name: "   " });
    expect(res.status).toBe(422);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects updating a branch with no fields", async () => {
    const res = await request(app)
      .patch("/api/v1/branches/22222222-2222-2222-2222-222222222222")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({});
    expect(res.status).toBe(422);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when updating a branch outside the business", async () => {
    updateMany.mockResolvedValue({ count: 0 } as never);

    const res = await request(app)
      .patch("/api/v1/branches/22222222-2222-2222-2222-222222222222")
      .set("Authorization", `Bearer ${OWNER_B}`)
      .send({ name: "Should Not Update" });

    expect(res.status).toBe(404);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "22222222-2222-2222-2222-222222222222",
        businessId: "biz-B",
      }),
    }));
  });
});

describe("Branches routes - user membership", () => {
  const BRANCH_A = "33333333-3333-3333-3333-333333333333";
  const USER_A = "44444444-4444-4444-4444-444444444444";

  it("allows STAFF to view users assigned to a branch", async () => {
    findFirst.mockResolvedValue({
      id: BRANCH_A,
      businessId: "biz-A",
      name: "Main Branch",
      address: null,
      isActive: true,
    } as never);
    userBranchFindMany.mockResolvedValue([
      { user: {
        id: USER_A,
        email: "staff@example.com",
        fullName: "Staff User",
        role: "STAFF",
        isActive: true,
        businessId: "biz-A",
      } },
    ] as never);

    const res = await request(app)
      .get(`/api/v1/branches/${BRANCH_A}/users`)
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(userBranchFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        branchId: BRANCH_A,
        branch: { businessId: "biz-A" },
      }),
    }));
  });

  it("returns 404 when viewing users for a branch outside the business", async () => {
    findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/branches/${BRANCH_A}/users`)
      .set("Authorization", `Bearer ${OWNER_B}`);

    expect(res.status).toBe(404);
    expect(userBranchFindMany).not.toHaveBeenCalled();
  });

  it("allows BUSINESS_OWNER to assign an active business user to a branch", async () => {
    findFirst.mockResolvedValue({
      id: BRANCH_A,
      businessId: "biz-A",
      name: "Main Branch",
      address: null,
      isActive: true,
    } as never);
    userFindFirst.mockResolvedValue({
      id: USER_A,
      email: "staff@example.com",
      fullName: "Staff User",
      role: "STAFF",
      isActive: true,
      businessId: "biz-A",
    } as never);
    userBranchFindUnique.mockResolvedValue(null);
    userBranchCreate.mockResolvedValue({
      id: "55555555-5555-5555-5555-555555555555",
      userId: USER_A,
      branchId: BRANCH_A,
    } as never);

    const res = await request(app)
      .post(`/api/v1/branches/${BRANCH_A}/users/${USER_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(201);
    expect(userBranchCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_A,
        branchId: BRANCH_A,
      },
    });
  });
});

describe("Branches routes - membership edge cases", () => {
  const BRANCH_A = "33333333-3333-3333-3333-333333333333";
  const USER_A = "44444444-4444-4444-4444-444444444444";

  it("rejects assigning a user who is already assigned", async () => {
    findFirst.mockResolvedValue({
      id: BRANCH_A,
      businessId: "biz-A",
      name: "Main Branch",
      isActive: true,
    } as never);
    userFindFirst.mockResolvedValue({
      id: USER_A,
      email: "staff@example.com",
      fullName: "Staff User",
      role: "STAFF",
      isActive: true,
      businessId: "biz-A",
    } as never);
    userBranchFindUnique.mockResolvedValue({
      id: "55555555-5555-5555-5555-555555555555",
      userId: USER_A,
      branchId: BRANCH_A,
    } as never);

    const res = await request(app)
      .post(`/api/v1/branches/${BRANCH_A}/users/${USER_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(409);
    expect(userBranchCreate).not.toHaveBeenCalled();
  });

  it("rejects assigning an inactive user", async () => {
    findFirst.mockResolvedValue({
      id: BRANCH_A,
      businessId: "biz-A",
      name: "Main Branch",
      isActive: true,
    } as never);
    userFindFirst.mockResolvedValue({
      id: USER_A,
      email: "inactive@example.com",
      fullName: "Inactive User",
      role: "STAFF",
      isActive: false,
      businessId: "biz-A",
    } as never);

    const res = await request(app)
      .post(`/api/v1/branches/${BRANCH_A}/users/${USER_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(409);
    expect(userBranchCreate).not.toHaveBeenCalled();
  });

  it("rejects assigning a user from another business", async () => {
    findFirst.mockResolvedValue({
      id: BRANCH_A,
      businessId: "biz-A",
      name: "Main Branch",
      isActive: true,
    } as never);
    userFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/branches/${BRANCH_A}/users/${USER_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(404);
    expect(userBranchCreate).not.toHaveBeenCalled();
  });
});

describe("Branches routes - user removal", () => {
  const BRANCH_A = "33333333-3333-3333-3333-333333333333";
  const USER_A = "44444444-4444-4444-4444-444444444444";

  it("allows BUSINESS_OWNER to remove a user from a branch", async () => {
    findFirst.mockResolvedValue({
      id: BRANCH_A,
      businessId: "biz-A",
      name: "Main Branch",
      isActive: true,
    } as never);
    userBranchDeleteMany.mockResolvedValue({ count: 1 } as never);

    const res = await request(app)
      .delete(`/api/v1/branches/${BRANCH_A}/users/${USER_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(204);
    expect(userBranchDeleteMany).toHaveBeenCalledWith({
      where: {
        branchId: BRANCH_A,
        userId: USER_A,
        user: { businessId: "biz-A" },
      },
    });
  });

  it("rejects STAFF from removing a user", async () => {
    const res = await request(app)
      .delete(`/api/v1/branches/${BRANCH_A}/users/${USER_A}`)
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(res.status).toBe(403);
    expect(userBranchDeleteMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the user is not assigned to the branch", async () => {
    findFirst.mockResolvedValue({
      id: BRANCH_A,
      businessId: "biz-A",
      name: "Main Branch",
      isActive: true,
    } as never);
    userBranchDeleteMany.mockResolvedValue({ count: 0 } as never);

    const res = await request(app)
      .delete(`/api/v1/branches/${BRANCH_A}/users/${USER_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(404);
  });
});
