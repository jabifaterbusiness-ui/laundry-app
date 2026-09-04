import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    inventoryItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    inventoryStock: {
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    inventoryMovement: {
      create: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    userBranch: {
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
  it("lists inventory items without requiring a branch header", async () => {
    inventoryItemFindMany.mockResolvedValue([] as never);
    inventoryItemCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/inventory")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(200);
    expect(inventoryItemFindMany).toHaveBeenCalled();
    expect(inventoryItemCount).toHaveBeenCalled();
    expect(userBranchFindUnique).not.toHaveBeenCalled();
  });

  it("allows an authenticated business user to access inventory items", async () => {
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
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("updates an inventory item without requiring a branch header", async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      businessId: "biz-A",
      name: "Detergent",
      description: null,
      unit: "LITRE",
      lowStockThreshold: 5,
      isActive: true,
    } as never);

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
      .set("Authorization", `Bearer ${OWNER_A}`)
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
    expect(prisma.inventoryItem.update).toHaveBeenCalled();
    expect(userBranchFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when updating a non-existent inventory item", async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch("/api/v1/inventory/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ name: "Liquid Detergent" });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Inventory item not found");
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(userBranchFindUnique).not.toHaveBeenCalled();
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
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ name: "Fabric Softener" });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe(
      "An inventory item with this name already exists",
    );
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(userBranchFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when updating an inventory item from another business", async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch("/api/v1/inventory/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ name: "Updated Item" });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Inventory item not found");
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(userBranchFindUnique).not.toHaveBeenCalled();
  });

  it("creates an inventory item without requiring a branch header", async () => {
    vi.mocked(prisma.inventoryItem.create).mockResolvedValue({
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      businessId: "biz-A",
      name: "Detergent",
      description: null,
      unit: "LITRE",
      lowStockThreshold: 5,
      isActive: true,
    } as never);

    const res = await request(app)
      .post("/api/v1/inventory")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({
        name: "Detergent",
        unit: "LITRE",
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
    expect(prisma.inventoryItem.create).toHaveBeenCalled();
    expect(userBranchFindUnique).not.toHaveBeenCalled();
  });
});

describe("Inventory routes - branch-scoped stock", () => {
  it("creates a RECEIPT inventory movement for an authorized branch", async () => {
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
      .set("Authorization", `Bearer ${OWNER_A}`)
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
      .set("Authorization", `Bearer ${OWNER_A}`)
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
      .set("Authorization", `Bearer ${OWNER_A}`)
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

  it("rejects stock requests without X-Branch-Id", async () => {
    const res = await request(app)
      .get("/api/v1/inventory/stock")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
    expect(userBranchFindUnique).not.toHaveBeenCalled();
  });

  it("rejects stock requests for a branch the user cannot access", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/inventory/stock")
      .set("Authorization", `Bearer ${OWNER_A}`)
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
      .set("Authorization", `Bearer ${OWNER_A}`)
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
      .set("Authorization", `Bearer ${OWNER_A}`)
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
      .set("Authorization", `Bearer ${OWNER_A}`)
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
      .set("Authorization", `Bearer ${OWNER_A}`)
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
