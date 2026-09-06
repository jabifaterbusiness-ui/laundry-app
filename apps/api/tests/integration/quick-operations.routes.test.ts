import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    userBranch: {
      findUnique: vi.fn(),
    },
    order: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    inventoryItem: {
      findFirst: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    inventoryStock: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    inventoryMovement: {
      create: vi.fn(),
    },
    permission: {
      findUnique: vi.fn(),
    },
    userPermissionOverride: {
      findUnique: vi.fn(),
    },
    businessRolePermission: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import { createApp } from "../../src/app.js";

const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
const orderFindFirst = vi.mocked(prisma.order.findFirst);
const orderUpdate = vi.mocked(prisma.order.update);
const customerFindFirst = vi.mocked(prisma.customer.findFirst);
const paymentFindFirst = vi.mocked(prisma.payment.findFirst);
const paymentUpdate = vi.mocked(prisma.payment.update);
const inventoryItemFindFirst = vi.mocked(prisma.inventoryItem.findFirst);
const branchFindFirst = vi.mocked(prisma.branch.findFirst);
const inventoryStockUpsert = vi.mocked(prisma.inventoryStock.upsert);
const inventoryStockUpdate = vi.mocked(prisma.inventoryStock.update);
const inventoryMovementCreate = vi.mocked(prisma.inventoryMovement.create);
const permissionFindUnique = vi.mocked(prisma.permission.findUnique);
const userPermissionFindUnique = vi.mocked(prisma.userPermissionOverride.findUnique);
const rolePermissionFindUnique = vi.mocked(prisma.businessRolePermission.findUnique);

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

const BRANCH_A = "33333333-3333-4333-8333-333333333333";
const BRANCH_B = "44444444-4444-4444-8444-444444444444";
const ORDER_A = "55555555-5555-4555-8555-555555555555";
const CUSTOMER_A = "66666666-6666-4666-8666-666666666666";
const CUSTOMER_B = "77777777-7777-4777-8777-777777777777";
const PAYMENT_A = "88888888-8888-4888-8888-888888888888";
const INVENTORY_ITEM_A = "99999999-9999-4999-8999-999999999999";
const MOVEMENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

function allowPermission() {
  permissionFindUnique.mockResolvedValue({
    id: "permission-1",
  } as never);
  userPermissionFindUnique.mockResolvedValue(null);
  rolePermissionFindUnique.mockResolvedValue({
    allowed: true,
  } as never);
}

function mockTransaction() {
  vi.mocked(prisma.$transaction).mockImplementation(
    async (callback) => callback(prisma as never),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction();
  allowPermission();
});

describe("Quick Operations routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .send({
        code: "TI",
        input: {
          orderId: ORDER_A,
          customerId: CUSTOMER_B,
        },
        confirmed: true,
      });

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "TI",
        input: {
          orderId: ORDER_A,
          customerId: CUSTOMER_B,
        },
        confirmed: true,
      });

    expect(res.status).toBe(403);
  });
});

describe("Quick Operations routes - branch context", () => {
  it("rejects a request without X-Branch-Id", async () => {
    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({
        code: "TI",
        input: {
          orderId: ORDER_A,
          customerId: CUSTOMER_B,
        },
        confirmed: true,
      });

    expect(res.status).toBe(400);
  });

  it("rejects a branch the authenticated user is not a member of", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "TI",
        input: {
          orderId: ORDER_A,
          customerId: CUSTOMER_B,
        },
        confirmed: true,
      });

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
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B)
      .send({
        code: "TI",
        input: {
          orderId: ORDER_A,
          customerId: CUSTOMER_B,
        },
        confirmed: true,
      });

    expect(res.status).toBe(403);
  });
});

describe("Quick Operations routes - validation and authorization", () => {
  it("rejects malformed request envelopes", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "",
        input: {},
        confirmed: true,
      });

    expect(res.status).toBe(422);
  });

  it("rejects an explicitly denied user permission", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    permissionFindUnique.mockResolvedValue({
      id: "permission-1",
    } as never);
    userPermissionFindUnique.mockResolvedValue({
      allowed: false,
    } as never);
    rolePermissionFindUnique.mockResolvedValue({
      allowed: true,
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "TI",
        input: {
          orderId: ORDER_A,
          customerId: CUSTOMER_B,
        },
        confirmed: true,
      });

    expect(res.status).toBe(403);
    expect(orderFindFirst).not.toHaveBeenCalled();
  });
});

describe("Quick Operations routes - TI", () => {
  it("executes Transfer Invoice within the authenticated business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    permissionFindUnique.mockResolvedValue({
      id: "permission-1",
    } as never);
    rolePermissionFindUnique.mockResolvedValue({
      allowed: true,
    } as never);

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      customerId: CUSTOMER_A,
    } as never);

    customerFindFirst.mockResolvedValue({
      id: CUSTOMER_B,
      name: "New Customer",
    } as never);

    orderUpdate.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      customerId: CUSTOMER_B,
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "TI",
        input: {
          orderId: ORDER_A,
          customerId: CUSTOMER_B,
        },
        confirmed: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("TI");
    expect(orderFindFirst).toHaveBeenCalledWith({
      where: {
        id: ORDER_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
      },
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
      },
    });
    expect(orderUpdate).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalled();
  });
});

describe("Quick Operations routes - VO", () => {
  it("executes Void Operation within the authenticated business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    permissionFindUnique.mockResolvedValue({
      id: "permission-1",
    } as never);
    userPermissionFindUnique.mockResolvedValue(null);
    rolePermissionFindUnique.mockResolvedValue({
      allowed: true,
    } as never);

    paymentFindFirst.mockResolvedValue({
      id: PAYMENT_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      invoiceId: "invoice-A",
      amount: 5000,
      method: "TRANSFER",
      status: "POSTED",
    } as never);

    paymentUpdate.mockResolvedValue({
      id: PAYMENT_A,
      invoiceId: "invoice-A",
      amount: 5000,
      method: "TRANSFER",
      status: "VOID",
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "VO",
        input: {
          paymentId: PAYMENT_A,
        },
        confirmed: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("VO");
    expect(paymentFindFirst).toHaveBeenCalledWith({
      where: {
        id: PAYMENT_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
      },
    });
    expect(paymentUpdate).toHaveBeenCalled();
  });
});

describe("Quick Operations routes - inventory", () => {
  it("executes Stock Issue against the authenticated branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    permissionFindUnique.mockResolvedValue({
      id: "permission-1",
    } as never);
    userPermissionFindUnique.mockResolvedValue(null);
    rolePermissionFindUnique.mockResolvedValue({
      allowed: true,
    } as never);

    inventoryItemFindFirst.mockResolvedValue({
      id: INVENTORY_ITEM_A,
      businessId: "biz-A",
      name: "Detergent",
      isActive: true,
    } as never);

    branchFindFirst.mockResolvedValue({
      id: BRANCH_A,
      businessId: "biz-A",
      name: "Main Branch",
    } as never);

    inventoryStockUpsert.mockResolvedValue({
      id: "stock-A",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: INVENTORY_ITEM_A,
      quantity: 10,
    } as never);

    inventoryStockUpdate.mockResolvedValue({
      id: "stock-A",
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: INVENTORY_ITEM_A,
      quantity: 7,
    } as never);

    inventoryMovementCreate.mockResolvedValue({
      id: MOVEMENT_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      inventoryItemId: INVENTORY_ITEM_A,
      quantity: 3,
      type: "ISSUE",
      resultingQuantity: 7,
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SI",
        input: {
          inventoryItemId: INVENTORY_ITEM_A,
          quantity: 3,
        },
        confirmed: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("SI");
    expect(inventoryMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          inventoryItemId: INVENTORY_ITEM_A,
          quantity: 3,
          type: "ISSUE",
        }),
      }),
    );
  });
});

describe("Quick Operations routes - unimplemented operations", () => {
  it("returns 501 for a catalogued but unimplemented operation", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    permissionFindUnique.mockResolvedValue({
      id: "permission-1",
    } as never);
    userPermissionFindUnique.mockResolvedValue(null);
    rolePermissionFindUnique.mockResolvedValue({
      allowed: true,
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "RF",
        input: {},
        confirmed: true,
      });

    expect(res.status).toBe(501);
    expect(res.body.error.message).toBe(
      "Quick operation RF is not implemented yet",
    );
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("Quick Operations routes - branch/business isolation", () => {
  it("does not execute when the selected branch belongs to another business", async () => {
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
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B)
      .send({
        code: "TI",
        input: {
          orderId: ORDER_A,
          customerId: CUSTOMER_B,
        },
        confirmed: true,
      });

    expect(res.status).toBe(403);
    expect(orderFindFirst).not.toHaveBeenCalled();
  });
});
