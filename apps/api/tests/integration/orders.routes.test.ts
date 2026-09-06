import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    order: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    service: {
      findMany: vi.fn(),
    },
    userBranch: {
      findUnique: vi.fn(),
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
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../src/lib/prisma.js";
import { createApp } from "../../src/app.js";

const orderFindMany = vi.mocked(prisma.order.findMany);
const orderCount = vi.mocked(prisma.order.count);
const orderFindFirst = vi.mocked(prisma.order.findFirst);
const orderUpdate = vi.mocked(prisma.order.update);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
const findPermission = vi.mocked(prisma.permission.findUnique);
const findRoleOverride = vi.mocked(prisma.businessRolePermission.findUnique);
const findUserOverride = vi.mocked(prisma.userPermissionOverride.findUnique);
const transaction = vi.mocked(prisma.$transaction);
const customerFindFirst = vi.mocked(prisma.customer.findFirst);

const recordAuditEvent = vi.mocked(
  (await import("../../src/lib/audit.js")).recordAuditEvent,
);

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
const MANAGER_A = tokenFor("BRANCH_MANAGER", "biz-A", "user-mgr-a");
const OWNER_B = tokenFor("BUSINESS_OWNER", "biz-B", "user-owner-b");
const PLATFORM_ADMIN = tokenFor("PLATFORM_ADMIN", null, "user-admin");

const BRANCH_A = "33333333-3333-3333-3333-333333333333";
const BRANCH_B = "44444444-4444-4444-4444-444444444444";
const ORDER_A = "77777777-7777-7777-7777-777777777777";
const CUSTOMER_A = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_B = "22222222-2222-4222-8222-222222222222";

const app = createApp();

function allowBranch(userId: string, branchId: string, businessId: string) {
  userBranchFindUnique.mockResolvedValue({
    userId,
    branchId,
    branch: {
      id: branchId,
      businessId,
      name: "Main Branch",
    },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();

  findPermission.mockImplementation(((args: {
    where: { code?: string };
  }) => {
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
  }) as never);

  findRoleOverride.mockResolvedValue(null);
  findUserOverride.mockResolvedValue(null);

  transaction.mockImplementation(async (callback) =>
    callback({
      order: {
        findFirst: orderFindFirst,
        update: orderUpdate,
      },
      customer: {
        findFirst: customerFindFirst,
      },
    } as never),
  );
});

describe("Orders routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/orders");

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .get("/api/v1/orders")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });
});

describe("Orders routes - branch context", () => {
  it("rejects a request without X-Branch-Id", async () => {
    const res = await request(app)
      .get("/api/v1/orders")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
  });

  it("rejects a branch the authenticated user is not a member of", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/orders")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });

  it("rejects a branch belonging to another business", async () => {
    userBranchFindUnique.mockResolvedValue({
      userId: "user-1",
      branchId: BRANCH_B,
      branch: {
        id: BRANCH_B,
        businessId: "biz-B",
        name: "Other Business Branch",
      },
    } as never);

    const res = await request(app)
      .get("/api/v1/orders")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
  });
});

describe("Orders routes - tenant and branch isolation", () => {
  it("business A lists only orders for its selected branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindMany.mockResolvedValue([]);
    orderCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/orders")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
        }),
      }),
    );
  });

  it("business B cannot retrieve an order from business A", async () => {
    allowBranch("user-owner-b", BRANCH_B, "biz-B");

    orderFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/orders/${ORDER_A}`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(404);

    expect(orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ORDER_A,
          businessId: "biz-B",
          branchId: BRANCH_B,
        },
      }),
    );
  });

  it("an order from another branch is not returned", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/orders/${ORDER_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(404);

    expect(orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ORDER_A,
          businessId: "biz-A",
          branchId: BRANCH_A,
        },
      }),
    );
  });
});

describe("Orders routes - listing", () => {
  it("lists orders successfully", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindMany.mockResolvedValue([]);
    orderCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/orders")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
    });
  });

  it("passes customer and status filters to the service", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindMany.mockResolvedValue([]);
    orderCount.mockResolvedValue(0);

    await request(app)
      .get(
        "/api/v1/orders?customerId=11111111-1111-1111-1111-111111111111&status=READY_FOR_PICKUP&page=2&pageSize=10",
      )
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          customerId: "11111111-1111-1111-1111-111111111111",
          status: "READY_FOR_PICKUP",
        }),
        skip: 10,
        take: 10,
      }),
    );
  });

  it("does not allow a client-supplied businessId to override the authenticated business", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindMany.mockResolvedValue([]);
    orderCount.mockResolvedValue(0);

    await request(app)
      .get("/api/v1/orders?businessId=biz-B")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
        }),
      }),
    );
  });
});

describe("Orders routes - permission enforcement", () => {
  it("rejects STAFF when orders.create is explicitly denied", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    findRoleOverride.mockResolvedValue({
      allowed: false,
    } as never);

    const res = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        customerId: "11111111-1111-4111-8111-111111111111",
        items: [],
      });

    expect(res.status).toBe(403);
  });

  it("rejects BUSINESS_OWNER when orders.view is explicitly denied", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    findRoleOverride.mockResolvedValue({
      allowed: false,
    } as never);

    const res = await request(app)
      .get("/api/v1/orders")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it("rejects BRANCH_MANAGER when orders.change_status is explicitly denied", async () => {
    allowBranch("user-mgr-a", BRANCH_A, "biz-A");

    findRoleOverride.mockResolvedValue({
      allowed: false,
    } as never);

    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_A}/status`)
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(403);
    expect(orderUpdate).not.toHaveBeenCalled();
  });
});

describe("Orders routes - transfer", () => {
  it("STAFF can transfer an order when orders.update is allowed", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    const previousOrder = {
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      customerId: CUSTOMER_A,
      orderNumber: "00042",
    };

    orderFindFirst.mockResolvedValue(previousOrder as never);

    customerFindFirst.mockResolvedValue({
      id: CUSTOMER_B,
      businessId: "biz-A",
      name: "Customer B",
    } as never);

    orderUpdate.mockResolvedValue({
      ...previousOrder,
      customerId: CUSTOMER_B,
      items: [],
    } as never);

    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_A}/transfer`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ customerId: CUSTOMER_B });

    expect(res.status).toBe(200);
    expect(res.body.customerId).toBe(CUSTOMER_B);
    expect(orderUpdate).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "order.customer_transferred",
        entityType: "Order",
        entityId: ORDER_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-staff-a",
        metadata: expect.objectContaining({
          previousCustomerId: CUSTOMER_A,
          newCustomerId: CUSTOMER_B,
        }),
      }),
    );
  });

  it("rejects transfer when orders.update is explicitly denied", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    findRoleOverride.mockResolvedValue({
      allowed: false,
    } as never);

    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_A}/transfer`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ customerId: CUSTOMER_B });

    expect(res.status).toBe(403);
    expect(orderFindFirst).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("enforces business and branch isolation during transfer", async () => {
    allowBranch("user-owner-b", BRANCH_B, "biz-B");

    orderFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_A}/transfer`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_B)
      .send({ customerId: CUSTOMER_B });

    expect(res.status).toBe(404);
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects transferring an order to the same customer", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      customerId: CUSTOMER_A,
      orderNumber: "00042",
    } as never);

    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_A}/transfer`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ customerId: CUSTOMER_A });

    expect(res.status).toBe(422);
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("Orders routes - authorization", () => {
  it("STAFF can list orders", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    orderFindMany.mockResolvedValue([]);
    orderCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/orders")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
  });

  it("BRANCH_MANAGER can list orders", async () => {
    allowBranch("user-mgr-a", BRANCH_A, "biz-A");

    orderFindMany.mockResolvedValue([]);
    orderCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/orders")
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
  });

  it("STAFF cannot change order status", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_A}/status`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ status: "COMPLETED" });

    expect(res.status).toBe(403);
  });

  it("BRANCH_MANAGER can change order status", async () => {
    allowBranch("user-mgr-a", BRANCH_A, "biz-A");

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      status: "RECEIVED",
    } as never);

    orderUpdate.mockResolvedValue({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      status: "IN_PROGRESS",
      items: [],
    } as never);

    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_A}/status`)
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(200);
  });

  it("BUSINESS_OWNER can change order status", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      status: "RECEIVED",
    } as never);

    orderUpdate.mockResolvedValue({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      status: "COMPLETED",
      items: [],
    } as never);

    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_A}/status`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ status: "COMPLETED" });

    expect(res.status).toBe(200);
  });
});

describe("Orders routes - status validation", () => {
  it("rejects an invalid status", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_A}/status`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ status: "NOT_A_REAL_STATUS" });

    expect(res.status).toBe(422);
  });

  it("rejects a missing status", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_A}/status`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({});

    expect(res.status).toBe(422);
  });
});
