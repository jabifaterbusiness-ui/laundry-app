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
    $queryRaw: vi.fn().mockResolvedValue([]),
    branchResourceShare: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    inventoryItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    inventoryStock: {
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    inventoryMovement: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    inventoryReservation: {
      findMany: vi.fn(),
    },
    inventoryStocktake: {
      findFirst: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
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

const inventoryItemFindFirst = vi.mocked(prisma.inventoryItem.findFirst);
const inventoryItemFindMany = vi.mocked(prisma.inventoryItem.findMany);
const inventoryItemCount = vi.mocked(prisma.inventoryItem.count);
const inventoryStockFindMany = vi.mocked(prisma.inventoryStock.findMany);
const inventoryStockCount = vi.mocked(prisma.inventoryStock.count);
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
const OWNER_B = tokenFor("BUSINESS_OWNER", "biz-B", "user-owner-b");
const PLATFORM_ADMIN = tokenFor("PLATFORM_ADMIN", null, "user-admin");

const BRANCH_A = "33333333-3333-3333-3333-333333333333";

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
  userBranchFindUnique.mockImplementation(async ({ where }: any) => {
    const { userId, branchId } = where.userId_branchId;
    const businessId = userId === "user-owner-b" ? "biz-B" : "biz-A";
    return { userId, branchId, branch: { id: branchId, businessId, name: "Main Branch" } } as never;
  });

  vi.mocked(prisma.inventoryStock.findUniqueOrThrow).mockImplementation((async () => {
    const latestUpsert = vi.mocked(prisma.inventoryStock.upsert).mock.results.at(-1)?.value;
    return latestUpsert ? await latestUpsert : null;
  }) as never);

  vi.mocked(prisma.$transaction).mockImplementation(
    async (
      input:
        | readonly unknown[]
        | ((tx: typeof prisma) => unknown),
    ) => {
      if (typeof input === "function") {
        return input(prisma);
      }

      return Promise.all(input);
    },
  );
});

describe("Inventory routes - permissions", () => {
  it("rejects STAFF when inventory.manage is denied", async () => {
    findPermission.mockResolvedValueOnce({
      id: "permission-inventory.manage",
      code: "inventory.manage",
      module: "inventory",
      action: "manage",
      description: "Manage inventory",
      createdAt: new Date(),
    } as never);
    findUserOverride.mockResolvedValueOnce({
      id: "override-1",
      businessId: "biz-A",
      userId: "user-staff-a",
      permissionId: "permission-inventory.manage",
      allowed: false,
    } as never);

    const res = await request(app)
      .post("/api/v1/inventory")
      .set("Authorization", `Bearer ${STAFF_A}`).set("X-Branch-Id", BRANCH_A)
      .send({
        name: "Detergent",
        unit: "LITRE",
        lowStockThreshold: 5,
      });

    expect(res.status).toBe(403);
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
  });

  it("allows BUSINESS_OWNER to view inventory despite stored permission restrictions", async () => {
    inventoryItemFindMany.mockResolvedValue([] as never);
    inventoryItemCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/inventory")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(inventoryItemFindMany).toHaveBeenCalled();
    expect(inventoryItemCount).toHaveBeenCalled();
  });

  it("rejects BRANCH_MANAGER when inventory.manage is denied", async () => {
    const managerToken = tokenFor(
      "BRANCH_MANAGER",
      "biz-A",
      "user-manager-a",
    );

    findPermission.mockResolvedValueOnce({
      id: "permission-inventory.manage",
      code: "inventory.manage",
      module: "inventory",
      action: "manage",
      description: "Manage inventory",
      createdAt: new Date(),
    } as never);
    findUserOverride.mockResolvedValueOnce({
      id: "override-3",
      businessId: "biz-A",
      userId: "user-manager-a",
      permissionId: "permission-inventory.manage",
      allowed: false,
    } as never);

    const res = await request(app)
      .post("/api/v1/inventory")
      .set("Authorization", `Bearer ${managerToken}`).set("X-Branch-Id", BRANCH_A)
      .send({
        name: "Bleach",
        unit: "LITRE",
        lowStockThreshold: 3,
      });

    expect(res.status).toBe(403);
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
  });
});

describe("Inventory routes - business-wide reporting", () => {
  it("allows a business owner to compare only active branches in their business", async () => {
    vi.mocked(prisma.branch.findMany).mockResolvedValue([{
      id: BRANCH_A,
      name: "Main Branch",
      inventoryStocks: [{
        inventoryItemId: "item-1",
        quantity: 12,
        reservedQuantity: 2,
        averageUnitCost: 250,
        inventoryItem: { id: "item-1", lowStockThreshold: 5 },
      }],
    }] as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([{
      id: "item-1",
      lowStockThreshold: 5,
    }] as never);

    const res = await request(app)
      .get("/api/v1/inventory/reports/branch-comparison")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject([{
      branchId: BRANCH_A,
      branchName: "Main Branch",
      catalogueItemCount: 1,
      totalValuation: 3000,
      lowStockItems: 0,
    }]);
    expect(prisma.branch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "biz-A", isActive: true },
    }));
  });

  it("denies branch managers stocktake approval without the approval permission", async () => {
    const managerToken = tokenFor("BRANCH_MANAGER", "biz-A", "user-manager-stocktake");
    findUserOverride.mockResolvedValueOnce({
      id: "override-stocktake-approval",
      businessId: "biz-A",
      userId: "user-manager-stocktake",
      permissionId: "permission-inventory.approve",
      allowed: false,
    } as never);

    const res = await request(app)
      .post("/api/v1/inventory/stocktakes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/approve")
      .set("Authorization", `Bearer ${managerToken}`).set("X-Branch-Id", BRANCH_A)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
    expect(prisma.inventoryStocktake.findFirst).not.toHaveBeenCalled();
    expect(prisma.inventoryStock.update).not.toHaveBeenCalled();
  });

  it("denies branch managers without the all-branches reporting permission", async () => {
    const managerToken = tokenFor("BRANCH_MANAGER", "biz-A", "user-manager-report");
    findUserOverride.mockResolvedValueOnce({
      id: "override-report",
      businessId: "biz-A",
      userId: "user-manager-report",
      permissionId: "permission-inventory.reports_all_branches",
      allowed: false,
    } as never);

    const res = await request(app)
      .get("/api/v1/inventory/reports/branch-comparison")
      .set("Authorization", `Bearer ${managerToken}`).set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
    expect(prisma.branch.findMany).not.toHaveBeenCalled();
  });
});

describe("Inventory movement history", () => {
  it("lists movements scoped to the active business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    vi.mocked(prisma.inventoryMovement.findMany).mockResolvedValue([
      {
        id: "movement-history-1",
        businessId: "biz-A",
        branchId: BRANCH_A,
        inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        type: "RECEIPT",
        quantity: 5,
        resultingQuantity: 15,
        inventoryItem: { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "Detergent" },
      },
    ] as never);
    vi.mocked(prisma.inventoryMovement.count).mockResolvedValue(1);

    const res = await request(app)
      .get("/api/v1/inventory/movements?page=1&pageSize=25")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.movements).toHaveLength(1);
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
        businessId: "biz-A",
        branchId: BRANCH_A,
        inventoryItem: {
          is: {
            OR: [
              { ownerBranchId: null },
              { ownerBranchId: { in: [BRANCH_A] } },
              { id: { in: [] } },
            ],
          },
        },
      },
        include: { inventoryItem: true },
      }),
    );
  });
});

describe("Inventory routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/inventory");

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .get("/api/v1/inventory")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(res.status).toBe(403);
  });
});

describe("Inventory routes - business-scoped items", () => {
  it("lists inventory items with the active branch context", async () => {
    inventoryItemFindMany.mockResolvedValue([] as never);
    inventoryItemCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/inventory")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(inventoryItemFindMany).toHaveBeenCalled();
    expect(inventoryItemCount).toHaveBeenCalled();
    expect(userBranchFindUnique).toHaveBeenCalled();
  });

  it("allows an authenticated business user to access inventory items", async () => {
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    inventoryItemFindMany.mockResolvedValue([
      {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        businessId: "biz-A",
        name: "Detergent",
        description: null,
        unit: "LITRE",
        lowStockThreshold: 5,
        isActive: true,
      },
    ] as never);
    inventoryItemCount.mockResolvedValue(1);

    const res = await request(app)
      .get("/api/v1/inventory?page=1&pageSize=25")
      .set("Authorization", `Bearer ${STAFF_A}`).set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("updates an inventory item within the active branch", async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      businessId: "biz-A",
      ownerBranchId: BRANCH_A,
      name: "Detergent",
      description: null,
      unit: "LITRE",
      lowStockThreshold: 5,
      isActive: true,
    } as never);
    vi.mocked(prisma.inventoryItem.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        businessId: "biz-A",
        ownerBranchId: BRANCH_A,
        name: "Liquid Detergent",
        description: "Laundry detergent",
        unit: "LITRE",
        lowStockThreshold: 10,
        isActive: true,
      } as never);
    vi.mocked(prisma.inventoryItem.updateMany).mockResolvedValue({ count: 1 } as never);

    vi.mocked(prisma.inventoryItem.update).mockResolvedValue({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      businessId: "biz-A",
      name: "Liquid Detergent",
      description: "Laundry detergent",
      unit: "LITRE",
      lowStockThreshold: 10,
      isActive: true,
    } as never);

    const res = await request(app)
      .patch("/api/v1/inventory/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .send({
        name: "Liquid Detergent",
        description: "Laundry detergent",
        lowStockThreshold: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      businessId: "biz-A",
      name: "Liquid Detergent",
      description: "Laundry detergent",
      unit: "LITRE",
      lowStockThreshold: 10,
      isActive: true,
    });
    expect(prisma.inventoryItem.updateMany).toHaveBeenCalled();
    expect(userBranchFindUnique).toHaveBeenCalled();
  });

  it("returns 404 when updating a non-existent inventory item", async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch("/api/v1/inventory/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .send({ name: "Liquid Detergent" });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Inventory item not found");
    expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(userBranchFindUnique).toHaveBeenCalled();
  });

  it("returns 409 when updating an inventory item to a duplicate name", async () => {
    vi.mocked(prisma.inventoryItem.findFirst)
      .mockResolvedValueOnce({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        businessId: "biz-A",
        name: "Detergent",
        description: null,
        unit: "LITRE",
        lowStockThreshold: 5,
        isActive: true,
      } as never)
      .mockResolvedValueOnce({
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        businessId: "biz-A",
        name: "Fabric Softener",
        description: null,
        unit: "LITRE",
        lowStockThreshold: 5,
        isActive: true,
      } as never);

    const res = await request(app)
      .patch("/api/v1/inventory/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .send({ name: "Fabric Softener" });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe(
      "An inventory item with this name already exists",
    );
    expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(userBranchFindUnique).toHaveBeenCalled();
  });

  it("returns 404 when updating an inventory item from another business", async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch("/api/v1/inventory/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .send({ name: "Updated Item" });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Inventory item not found");
    expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(userBranchFindUnique).toHaveBeenCalled();
  });

  it("creates an inventory item owned by the active branch", async () => {
    vi.mocked(prisma.inventoryItem.create).mockResolvedValue({
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      businessId: "biz-A",
      ownerBranchId: BRANCH_A,
      name: "Detergent",
      description: null,
      unit: "LITRE",
      lowStockThreshold: 5,
      isActive: true,
    } as never);

    const res = await request(app)
      .post("/api/v1/inventory")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .send({
        name: "Detergent",
        sku: "DET-001",
        category: "Chemicals",
        storageLocation: "Store A / Shelf 2",
        unit: "LITRE",
        reorderQuantity: 24,
        lowStockThreshold: 5,
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      businessId: "biz-A",
      name: "Detergent",
      unit: "LITRE",
      lowStockThreshold: 5,
      isActive: true,
    });
    expect(prisma.inventoryItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        businessId: "biz-A",
        ownerBranchId: BRANCH_A,
        sku: "DET-001",
        category: "Chemicals",
        storageLocation: "Store A / Shelf 2",
        reorderQuantity: 24,
      }),
    }));
    expect(userBranchFindUnique).toHaveBeenCalled();
  });
});

describe("Inventory routes - reservation register", () => {
  it("lists reservations only for the selected business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    vi.mocked(prisma.inventoryReservation.findMany).mockResolvedValue([{
      id: "reservation-1",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "item-1",
      quantity: 2,
      status: "ACTIVE",
      reference: "ORDER-100",
      expiresAt: null,
      releasedAt: null,
      createdAt: new Date("2026-11-02T10:00:00.000Z"),
      inventoryItem: { id: "item-1", name: "Detergent", unit: "LITRE" },
    }] as never);

    const res = await request(app)
      .get("/api/v1/inventory/reservations")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(prisma.inventoryReservation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "biz-A", branchId: BRANCH_A },
      take: 100,
    }));
  });
});

describe("Inventory routes - branch-scoped stock", () => {
  it("creates a RECEIPT inventory movement for an authorized branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    vi.mocked(prisma.branch.findFirst).mockResolvedValueOnce({ id: BRANCH_A, businessId: "biz-A", name: "Main Branch" } as never);

    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      businessId: "biz-A",
      ownerBranchId: BRANCH_A,
      name: "Detergent",
      description: null,
      unit: "LITRE",
      lowStockThreshold: 5,
      isActive: true,
    } as never);

    vi.mocked(prisma.inventoryStock.upsert).mockResolvedValueOnce({
      id: "stock-1",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      quantity: 15,
    } as never);

    vi.mocked(prisma.inventoryMovement.create).mockResolvedValueOnce({
      id: "movement-1",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      type: "RECEIPT",
      quantity: 10,
      resultingQuantity: 15,
      createdById: "user-1",
      reason: "New stock received",
      reference: "PO-001",
    } as never);

    const res = await request(app)
      .post("/api/v1/inventory/movements")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        quantity: 10,
        type: "RECEIPT",
        reason: "New stock received",
        reference: "PO-001",
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      movement: {
        id: "movement-1",
        type: "RECEIPT",
        quantity: 10,
        resultingQuantity: 15,
      },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalled();
    expect(userBranchFindUnique).toHaveBeenCalled();
  });

  it("creates an ISSUE inventory movement and decreases stock", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    vi.mocked(prisma.branch.findFirst).mockResolvedValueOnce({ id: BRANCH_A, businessId: "biz-A", name: "Main Branch" } as never);

    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      businessId: "biz-A",
      name: "Detergent",
      description: null,
      unit: "LITRE",
      lowStockThreshold: 5,
      isActive: true,
    } as never);

    vi.mocked(prisma.inventoryStock.upsert).mockResolvedValueOnce({
      id: "stock-2",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      quantity: 15,
    } as never);

    vi.mocked(prisma.inventoryStock.update).mockResolvedValueOnce({
      id: "stock-2",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      quantity: 5,
    } as never);

    vi.mocked(prisma.inventoryMovement.create).mockResolvedValueOnce({
      id: "movement-2",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      type: "ISSUE",
      quantity: 10,
      resultingQuantity: 5,
      createdById: "user-1",
      reason: "Laundry production use",
      reference: "ISSUE-001",
    } as never);

    const res = await request(app)
      .post("/api/v1/inventory/movements")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        quantity: 10,
        type: "ISSUE",
        reason: "Laundry production use",
        reference: "ISSUE-001",
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      movement: {
        id: "movement-2",
        type: "ISSUE",
        quantity: 10,
        resultingQuantity: 5,
      },
      stock: {
        quantity: 5,
      },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalled();
    expect(prisma.inventoryStock.update).toHaveBeenCalled();
  });

  it("rejects an ISSUE that would make stock negative", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    vi.mocked(prisma.branch.findFirst).mockResolvedValueOnce({ id: BRANCH_A, businessId: "biz-A", name: "Main Branch" } as never);

    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      businessId: "biz-A",
      name: "Detergent",
      description: null,
      unit: "LITRE",
      lowStockThreshold: 5,
      isActive: true,
    } as never);

    vi.mocked(prisma.inventoryStock.upsert).mockResolvedValueOnce({
      id: "stock-3",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      quantity: 3,
    } as never);

    const res = await request(app)
      .post("/api/v1/inventory/movements")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        quantity: 4,
        type: "ISSUE",
      });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe("Insufficient inventory stock");
    expect(prisma.inventoryStock.update).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("requires an audit reason for return, waste and expired-stock movements", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    vi.mocked(prisma.branch.findFirst).mockResolvedValue({
      id: BRANCH_A, businessId: "biz-A", name: "Main Branch",
    } as never);
    for (const type of ["RETURN", "WASTE", "EXPIRED"]) {
      const res = await request(app)
        .post("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
        .set("X-Branch-Id", BRANCH_A)
        .send({
          inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          quantity: 1,
          type,
        });
      expect(res.status).toBe(422);
    }
    expect(prisma.inventoryStock.upsert).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("rejects stock requests without X-Branch-Id", async () => {
    const res = await request(app)
      .get("/api/v1/inventory/stock")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
    expect(userBranchFindUnique).toHaveBeenCalled();
  });

  it("rejects stock requests for a branch the user cannot access", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/inventory/stock")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });

  it("lists stock after validating branch membership", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    vi.mocked(prisma.branch.findFirst).mockResolvedValueOnce({ id: BRANCH_A, businessId: "biz-A", name: "Main Branch" } as never);
    inventoryStockFindMany.mockResolvedValue([] as never);
    inventoryStockCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/inventory/stock")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(inventoryStockFindMany).toHaveBeenCalled();
    expect(inventoryStockCount).toHaveBeenCalled();
  });

  it("creates a positive stock adjustment for an authorized branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    vi.mocked(prisma.branch.findFirst).mockResolvedValueOnce({
      id: BRANCH_A,
      businessId: "biz-A",
      name: "Main Branch",
    } as never);

    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      businessId: "biz-A",
      name: "Detergent",
      description: null,
      unit: "LITRE",
      lowStockThreshold: 5,
      isActive: true,
    } as never);

    vi.mocked(prisma.inventoryStock.upsert).mockResolvedValueOnce({
      id: "stock-adjust-1",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      quantity: 10,
    } as never);

    vi.mocked(prisma.inventoryStock.update).mockResolvedValueOnce({
      id: "stock-adjust-1",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      quantity: 15,
    } as never);

    vi.mocked(prisma.inventoryMovement.create).mockResolvedValueOnce({
      id: "adjustment-1",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      type: "ADJUSTMENT",
      quantity: 5,
      resultingQuantity: 15,
      createdById: "user-1",
      reason: "Physical stock count correction",
      reference: "COUNT-001",
    } as never);

    const res = await request(app)
      .post("/api/v1/inventory/stock/adjust")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        quantity: 5,
        reason: "Physical stock count correction",
        reference: "COUNT-001",
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      movement: {
        id: "adjustment-1",
        type: "ADJUSTMENT",
        quantity: 5,
        resultingQuantity: 15,
      },
      stock: {
        quantity: 15,
      },
    });
    expect(prisma.inventoryStock.update).toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).toHaveBeenCalled();
  });


  it("creates a negative stock adjustment and decreases stock", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    vi.mocked(prisma.branch.findFirst).mockResolvedValueOnce({
      id: BRANCH_A,
      businessId: "biz-A",
      name: "Main Branch",
    } as never);

    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      businessId: "biz-A",
      name: "Detergent",
      description: null,
      unit: "LITRE",
      lowStockThreshold: 5,
      isActive: true,
    } as never);

    vi.mocked(prisma.inventoryStock.upsert).mockResolvedValueOnce({
      id: "stock-adjust-2",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      quantity: 15,
    } as never);

    vi.mocked(prisma.inventoryStock.update).mockResolvedValueOnce({
      id: "stock-adjust-2",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      quantity: 10,
    } as never);

    vi.mocked(prisma.inventoryMovement.create).mockResolvedValueOnce({
      id: "adjustment-2",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      type: "ADJUSTMENT",
      quantity: -5,
      resultingQuantity: 10,
      createdById: "user-1",
      reason: "Damaged stock",
      reference: "DAMAGE-001",
    } as never);

    const res = await request(app)
      .post("/api/v1/inventory/stock/adjust")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        quantity: -5,
        reason: "Damaged stock",
        reference: "DAMAGE-001",
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      movement: {
        id: "adjustment-2",
        type: "ADJUSTMENT",
        quantity: -5,
        resultingQuantity: 10,
      },
      stock: {
        quantity: 10,
      },
    });
    expect(prisma.inventoryStock.update).toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).toHaveBeenCalled();
  });


  it("rejects a negative adjustment that would make stock negative", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    vi.mocked(prisma.branch.findFirst).mockResolvedValueOnce({
      id: BRANCH_A,
      businessId: "biz-A",
      name: "Main Branch",
    } as never);

    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      businessId: "biz-A",
      name: "Detergent",
      description: null,
      unit: "LITRE",
      lowStockThreshold: 5,
      isActive: true,
    } as never);

    vi.mocked(prisma.inventoryStock.upsert).mockResolvedValueOnce({
      id: "stock-adjust-3",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      quantity: 3,
    } as never);

    const res = await request(app)
      .post("/api/v1/inventory/stock/adjust")
      .set("Authorization", `Bearer ${OWNER_A}`).set("X-Branch-Id", BRANCH_A)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        inventoryItemId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        quantity: -4,
        reason: "Stock count correction",
      });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe(
      "Inventory adjustment cannot make stock negative",
    );
    expect(prisma.inventoryStock.update).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

});
