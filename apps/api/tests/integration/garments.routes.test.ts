import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, deletedAt: null }) },
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
    $transaction: vi.fn(),
    order: {
      findFirst: vi.fn(),
    },
    garment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
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

const orderFindFirst = vi.mocked(prisma.order.findFirst);
const garmentFindMany = vi.mocked(prisma.garment.findMany);
const garmentFindFirst = vi.mocked(prisma.garment.findFirst);
const garmentCount = vi.mocked(prisma.garment.count);
const garmentCreateMany = vi.mocked(prisma.garment.createMany);
const garmentUpdate = vi.mocked(prisma.garment.update);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
const findPermission = vi.mocked(prisma.permission.findUnique);
const findRoleOverride = vi.mocked(prisma.businessRolePermission.findUnique);
const findUserOverride = vi.mocked(prisma.userPermissionOverride.findUnique);

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
      securityRole: role,
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
const ORDER_B = "88888888-8888-8888-8888-888888888888";
const ORDER_ITEM_A = "99999999-9999-9999-9999-999999999999";
const ORDER_ITEM_B = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GARMENT_A = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const app = createApp();

function allowBranch(
  userId: string,
  branchId: string,
  businessId: string,
) {
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

  vi.mocked(prisma.$transaction).mockImplementation(
    async (callback: any) => callback(prisma),
  );

  findPermission.mockImplementation(((args: { where: { code?: string } }) => {
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
});

describe("Garments routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/garments");

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .get("/api/v1/garments")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });
});

describe("Garments routes - branch context", () => {
  it("rejects a request without X-Branch-Id", async () => {
    const res = await request(app)
      .get("/api/v1/garments")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
  });

  it("rejects a branch the authenticated user is not a member of", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/garments")
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
      .get("/api/v1/garments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
  });
});

describe("Garments routes - generation", () => {
  it("generates one garment record per server-side order-item piece count", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      items: [
        {
          id: ORDER_ITEM_A,
          totalPieces: 3,
          serviceName: "Complete Agbada",
        },
        {
          id: ORDER_ITEM_B,
          totalPieces: 2,
          serviceName: "Shirt",
        },
      ],
    } as never);

    garmentFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "g1", orderItemId: ORDER_ITEM_A, garmentNumber: 1 },
        { id: "g2", orderItemId: ORDER_ITEM_A, garmentNumber: 2 },
        { id: "g3", orderItemId: ORDER_ITEM_A, garmentNumber: 3 },
        { id: "g4", orderItemId: ORDER_ITEM_B, garmentNumber: 1 },
        { id: "g5", orderItemId: ORDER_ITEM_B, garmentNumber: 2 },
      ] as never);

    garmentCreateMany.mockResolvedValue({ count: 5 });

    const res = await request(app)
      .post(`/api/v1/garments/orders/${ORDER_A}/generate`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(201);
    expect(garmentCreateMany).toHaveBeenCalledWith({
      data: [
        {
          businessId: "biz-A",
          branchId: BRANCH_A,
          orderId: ORDER_A,
          orderItemId: ORDER_ITEM_A,
          garmentNumber: 1,
          status: "RECEIVED",
        },
        {
          businessId: "biz-A",
          branchId: BRANCH_A,
          orderId: ORDER_A,
          orderItemId: ORDER_ITEM_A,
          garmentNumber: 2,
          status: "RECEIVED",
        },
        {
          businessId: "biz-A",
          branchId: BRANCH_A,
          orderId: ORDER_A,
          orderItemId: ORDER_ITEM_A,
          garmentNumber: 3,
          status: "RECEIVED",
        },
        {
          businessId: "biz-A",
          branchId: BRANCH_A,
          orderId: ORDER_A,
          orderItemId: ORDER_ITEM_B,
          garmentNumber: 1,
          status: "RECEIVED",
        },
        {
          businessId: "biz-A",
          branchId: BRANCH_A,
          orderId: ORDER_A,
          orderItemId: ORDER_ITEM_B,
          garmentNumber: 2,
          status: "RECEIVED",
        },
      ],
    });
    expect(res.body.data).toHaveLength(5);
  });

  it("does not create duplicate garments when generation is repeated", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      items: [
        {
          id: ORDER_ITEM_A,
          totalPieces: 2,
        },
      ],
    } as never);

    garmentFindMany
      .mockResolvedValueOnce([
        { orderItemId: ORDER_ITEM_A, garmentNumber: 1 },
        { orderItemId: ORDER_ITEM_A, garmentNumber: 2 },
      ] as never)
      .mockResolvedValueOnce([
        { id: "g1", orderItemId: ORDER_ITEM_A, garmentNumber: 1 },
        { id: "g2", orderItemId: ORDER_ITEM_A, garmentNumber: 2 },
      ] as never);

    const res = await request(app)
      .post(`/api/v1/garments/orders/${ORDER_A}/generate`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(201);
    expect(garmentCreateMany).not.toHaveBeenCalled();
    expect(res.body.data).toHaveLength(2);
  });

  it("does not retrieve an order from another business or branch", async () => {
    allowBranch("user-owner-b", BRANCH_B, "biz-B");

    orderFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/garments/orders/${ORDER_A}/generate`)
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
});

describe("Garments routes - authorization", () => {
  it("STAFF can generate garments", async () => {
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      items: [],
    } as never);

    garmentFindMany.mockResolvedValue([]);

    const res = await request(app)
      .post(`/api/v1/garments/orders/${ORDER_A}/generate`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(201);
  });

  it("BRANCH_MANAGER can update garment status", async () => {
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    allowBranch("user-mgr-a", BRANCH_A, "biz-A");

    garmentFindFirst.mockResolvedValue({
      id: GARMENT_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      orderId: ORDER_A,
    } as never);

    garmentUpdate.mockResolvedValue({
      id: GARMENT_A,
      status: "READY",
      orderId: ORDER_A,
    } as never);

    const res = await request(app)
      .patch(`/api/v1/garments/${GARMENT_A}/status`)
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ status: "READY" });

    expect(res.status).toBe(200);
  });
});

describe("Garments routes - permission enforcement", () => {
  it("rejects STAFF when garments.manage is explicitly denied", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    findRoleOverride.mockResolvedValue({ allowed: false } as never);

    const res = await request(app)
      .post(`/api/v1/garments/orders/${ORDER_A}/generate`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
    expect(orderFindFirst).not.toHaveBeenCalled();
    expect(garmentCreateMany).not.toHaveBeenCalled();
  });

  it("rejects STAFF when garments.view is explicitly denied", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    findRoleOverride.mockResolvedValue({ allowed: false } as never);

    const res = await request(app)
      .get("/api/v1/garments")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
    expect(garmentFindMany).not.toHaveBeenCalled();
    expect(garmentCount).not.toHaveBeenCalled();
  });

  it("rejects BRANCH_MANAGER when garments.manage is explicitly denied", async () => {
    allowBranch("user-mgr-a", BRANCH_A, "biz-A");

    findRoleOverride.mockResolvedValue({ allowed: false } as never);

    const res = await request(app)
      .patch(`/api/v1/garments/${GARMENT_A}/status`)
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ status: "READY" });

    expect(res.status).toBe(403);
    expect(garmentFindFirst).not.toHaveBeenCalled();
    expect(garmentUpdate).not.toHaveBeenCalled();
  });
});

describe("Garments routes - listing and scope", () => {
  it("lists only garments for the authenticated business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    garmentFindMany.mockResolvedValue([]);
    garmentCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/garments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
    });

    expect(garmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
        },
      }),
    );
  });

  it("supports order, order-item, status and pagination filters", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    garmentFindMany.mockResolvedValue([]);
    garmentCount.mockResolvedValue(0);

    const res = await request(app)
      .get(
        `/api/v1/garments?orderId=${ORDER_A}&orderItemId=${ORDER_ITEM_A}&status=READY&page=2&pageSize=10`,
      )
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(garmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
          orderId: ORDER_A,
          orderItemId: ORDER_ITEM_A,
          status: "READY",
        },
        skip: 10,
        take: 10,
      }),
    );
  });

  it("does not expose a garment from another business or branch", async () => {
    allowBranch("user-owner-b", BRANCH_B, "biz-B");

    garmentFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/garments/${GARMENT_A}`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(404);

    expect(garmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: GARMENT_A,
          businessId: "biz-B",
          branchId: BRANCH_B,
        },
      }),
    );
  });
});

describe("Garments routes - status lifecycle", () => {
  it.each([
    ["READY", "readyAt"],
    ["PICKED_UP", "pickedUpAt"],
    ["DAMAGED", "damagedAt"],
    ["LOST", "lostAt"],
  ] as const)(
    "sets %s timestamp when status changes",
    async (status, timestampField) => {
      allowBranch("user-1", BRANCH_A, "biz-A");

      garmentFindFirst.mockResolvedValue({
        id: GARMENT_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
      } as never);

      garmentUpdate.mockResolvedValue({
        id: GARMENT_A,
        status,
      } as never);

      const res = await request(app)
        .patch(`/api/v1/garments/${GARMENT_A}/status`)
        .set("Authorization", `Bearer ${OWNER_A}`)
        .set("X-Branch-Id", BRANCH_A)
        .send({ status });

      expect(res.status).toBe(200);

      expect(garmentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: GARMENT_A },
          data: expect.objectContaining({
            status,
            [timestampField]: expect.any(Date),
          }),
        }),
      );
    },
  );

  it("preserves an existing garment row when its status changes", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    garmentFindFirst.mockResolvedValue({
      id: GARMENT_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      status: "PROCESSING",
    } as never);

    garmentUpdate.mockResolvedValue({
      id: GARMENT_A,
      status: "READY",
    } as never);

    const res = await request(app)
      .patch(`/api/v1/garments/${GARMENT_A}/status`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        status: "READY",
        note: "Pressed and packed",
      });

    expect(res.status).toBe(200);
    expect(garmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: GARMENT_A },
        data: expect.objectContaining({
          status: "READY",
          note: "Pressed and packed",
          readyAt: expect.any(Date),
        }),
      }),
    );
  });

  it("rejects an invalid status", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .patch(`/api/v1/garments/${GARMENT_A}/status`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({ status: "NOT_A_REAL_STATUS" });

    expect(res.status).toBe(422);
  });
});
