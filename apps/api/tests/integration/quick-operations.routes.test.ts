import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    refreshToken: { findFirst: vi.fn().mockResolvedValue({ id: "session-test" }) },
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
    $queryRaw: vi.fn().mockResolvedValue([]),
    userBranch: {
      findUnique: vi.fn(),
    },
    order: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    branchResourceShare: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    customerAccount: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    customerAccountTransaction: {
      updateMany: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
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
      findUniqueOrThrow: vi.fn(),
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

const {
  getCustomerReceiptMock,
  getCompanyReceiptMock,
} = vi.hoisted(() => ({
  getCustomerReceiptMock: vi.fn(),
  getCompanyReceiptMock: vi.fn(),
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/modules/invoices/receipts.service.js", () => ({
  getCustomerReceipt: getCustomerReceiptMock,
  getCompanyReceipt: getCompanyReceiptMock,
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import { createApp } from "../../src/app.js";

const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
const orderFindFirst = vi.mocked(prisma.order.findFirst);
const orderFindMany = vi.mocked(prisma.order.findMany);
const orderUpdate = vi.mocked(prisma.order.update);
const orderUpdateMany = vi.mocked(prisma.order.updateMany);
const customerFindFirst = vi.mocked(prisma.customer.findFirst);
const customerUpdateMany = vi.mocked(prisma.customer.updateMany);
const customerAccountFindFirst = vi.mocked(prisma.customerAccount.findFirst);
const customerAccountUpdate = vi.mocked(prisma.customerAccount.update);
const customerAccountDelete = vi.mocked(prisma.customerAccount.delete);
const customerAccountTransactionUpdateMany = vi.mocked(
  prisma.customerAccountTransaction.updateMany,
);
const paymentFindFirst = vi.mocked(prisma.payment.findFirst);
const paymentFindMany = vi.mocked(prisma.payment.findMany);
const paymentCreate = vi.mocked(prisma.payment.create);
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
      sid: "session-test",
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
  orderFindFirst.mockReset();
  mockTransaction();
  vi.mocked(prisma.inventoryStock.findUniqueOrThrow).mockImplementation((async () => {
    const latestUpsert = vi.mocked(prisma.inventoryStock.upsert).mock.results.at(-1)?.value;
    return latestUpsert ? await latestUpsert : null;
  }) as never);
  allowPermission();
  getCustomerReceiptMock.mockReset();
  getCompanyReceiptMock.mockReset();
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
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

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
      .set("Authorization", `Bearer ${STAFF_A}`)
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

describe("Quick Operations routes - MU", () => {
  it("updates an order status within the authenticated business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    permissionFindUnique.mockResolvedValue({
      id: "permission-1",
    } as never);
    userPermissionFindUnique.mockResolvedValue(null);
    rolePermissionFindUnique.mockResolvedValue({
      allowed: true,
    } as never);

    orderFindFirst.mockResolvedValueOnce({
      id: ORDER_A,
      orderNumber: "00042",
      status: "IN_PROGRESS",
    } as never);

    orderFindFirst.mockResolvedValueOnce({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      status: "IN_PROGRESS",
    } as never);

    orderUpdate.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      status: "READY_FOR_PICKUP",
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "MU",
        input: {
          orderId: ORDER_A,
          status: "READY_FOR_PICKUP",
        },
        confirmed: true,
        reason: "Routine manual update test",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("MU");

    expect(orderFindFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: ORDER_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        customer: {
          is: {
            businessId: "biz-A",
            OR: [
              { ownerBranchId: { in: [BRANCH_A] } },
              { id: { in: [] } },
            ],
          },
        },
      },
      include: {
        customer: true,
        branch: true,
        items: true,
      },
    });

    expect(orderFindFirst).toHaveBeenNthCalledWith(2, {
      where: {
        id: ORDER_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
      },
    });

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ORDER_A,
        },
        data: expect.objectContaining({
          status: "READY_FOR_PICKUP",
          readyAt: expect.any(Date),
        }),
        include: {
          customer: true,
          branch: true,
          items: true,
        },
      }),
    );

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "quick_operation.executed",
        entityType: "Order",
        entityId: ORDER_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-1",
        metadata: expect.objectContaining({
          operationCode: "MU",
          operationName: "Manual Update",
          orderNumber: "00042",
          beforeStatus: "IN_PROGRESS",
          afterStatus: "READY_FOR_PICKUP",
        }),
      }),
    );
  });

  it("rejects an order outside the authenticated business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindFirst.mockReset();
    orderFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "MU",
        input: {
          orderId: ORDER_A,
          status: "COMPLETED",
        },
        confirmed: true,
        reason: "Routine manual update isolation test",
      });

    expect(res.status).toBe(404);
    expect(orderFindFirst).toHaveBeenCalledWith({
      where: {
        id: ORDER_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        customer: {
          is: {
            businessId: "biz-A",
            OR: [
              { ownerBranchId: { in: [BRANCH_A] } },
              { id: { in: [] } },
            ],
          },
        },
      },
      include: {
        customer: true,
        branch: true,
        items: true,
      },
    });
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("enforces the orders.change_status permission for MU", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    permissionFindUnique.mockImplementation((args) => {
      const code = args.where.code;

      if (code === "orders.change_status") {
        return {
          id: "permission-change-status",
          code,
          module: "orders",
          action: "change_status",
          createdAt: new Date(),
          description: null,
        } as never;
      }

      return {
        id: "permission-update",
        code,
        module: "orders",
        action: "update",
        createdAt: new Date(),
        description: null,
      } as never;
    });

    userPermissionFindUnique.mockResolvedValue({
      allowed: false,
    } as never);

    rolePermissionFindUnique.mockResolvedValue({
      allowed: true,
    } as never);

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      status: "IN_PROGRESS",
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "MU",
        input: {
          orderId: ORDER_A,
          status: "COMPLETED",
        },
        confirmed: true,
      });

    expect(res.status).toBe(403);
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects MU without confirmation", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "MU",
        input: {
          orderId: ORDER_A,
          status: "COMPLETED",
        },
        confirmed: false,
      });

    expect(res.status).toBe(422);
    expect(orderFindFirst).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
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
        reason: "Routine invoice transfer test",
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
        reason: "Routine payment void test",
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


describe("Quick Operations routes - RI", () => {
  const INVOICE_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const customerReceipt = {
    receiptType: "CUSTOMER",
    invoiceNumber: "INV-00042",
    orderNumber: "00042",
    companyName: "Laundry Company",
    companyPhone: "08000000000",
    companyEmail: "hello@example.com",
    companyWebsite: "https://example.com",
    companyAddress: "Main Street",
    customerName: "Customer A",
    branchName: "Main Branch",
    createdAt: "2026-09-07T08:00:00.000Z",
    items: [
      {
        id: "item-A",
        quantity: 1,
        itemName: "Complete Agbada",
        totalPieces: 3,
        unitPrice: 4500,
        totalPrice: 4500,
      },
    ],
    totalAmount: 4500,
    garmentNote: "Check sleeve before processing.",
    customerAgreement: "Customer agrees to the company laundry terms.",
  };

  const companyReceipt = {
    ...customerReceipt,
    receiptType: "COMPANY",
    internalNote: "Handle with care.",
  };

  it("reprints a customer receipt within the authenticated business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    getCustomerReceiptMock.mockResolvedValue(customerReceipt);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "RI",
        input: {
          invoiceId: INVOICE_A,
          receiptType: "CUSTOMER",
        },
        confirmed: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      code: "RI",
      result: customerReceipt,
    });

    expect(getCustomerReceiptMock).toHaveBeenCalledWith(
      INVOICE_A,
      "biz-A",
      BRANCH_A,
    );
    expect(getCompanyReceiptMock).not.toHaveBeenCalled();

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "quick_operation.executed",
        entityType: "Invoice",
        entityId: INVOICE_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-1",
        metadata: expect.objectContaining({
          operationCode: "RI",
          receiptType: "CUSTOMER",
        }),
      }),
    );
  });

  it("reprints a company receipt without requiring confirmation", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    getCompanyReceiptMock.mockResolvedValue(companyReceipt);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "RI",
        input: {
          invoiceId: INVOICE_A,
          receiptType: "COMPANY",
        },
        confirmed: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      code: "RI",
      result: companyReceipt,
    });

    expect(getCompanyReceiptMock).toHaveBeenCalledWith(
      INVOICE_A,
      "biz-A",
      BRANCH_A,
    );
    expect(getCustomerReceiptMock).not.toHaveBeenCalled();
  });

  it("enforces the invoices.view permission for RI", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

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
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "RI",
        input: {
          invoiceId: INVOICE_A,
          receiptType: "CUSTOMER",
        },
        confirmed: false,
      });

    expect(res.status).toBe(403);
    expect(getCustomerReceiptMock).not.toHaveBeenCalled();
    expect(getCompanyReceiptMock).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("returns 404 when the invoice is outside the authenticated business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    getCustomerReceiptMock.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "RI",
        input: {
          invoiceId: INVOICE_A,
          receiptType: "CUSTOMER",
        },
        confirmed: false,
      });

    expect(res.status).toBe(404);
    expect(getCustomerReceiptMock).toHaveBeenCalledWith(
      INVOICE_A,
      "biz-A",
      BRANCH_A,
    );
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed RI input before receipt generation", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "RI",
        input: {
          invoiceId: "not-a-uuid",
          receiptType: "CUSTOMER",
        },
        confirmed: false,
      });

    expect(res.status).toBe(422);
    expect(getCustomerReceiptMock).not.toHaveBeenCalled();
    expect(getCompanyReceiptMock).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("Quick Operations routes - RF", () => {
  it("executes Refund within the authenticated business and branch", async () => {
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
      type: "PAYMENT",
      status: "POSTED",
      invoice: {
        id: "invoice-A",
        status: "ISSUED",
      },
    } as never);

    paymentFindMany.mockResolvedValue([] as never);

    paymentCreate.mockResolvedValue({
      id: "refund-A",
      businessId: "biz-A",
      branchId: BRANCH_A,
      invoiceId: "invoice-A",
      amount: 2000,
      method: "TRANSFER",
      type: "REFUND",
      status: "POSTED",
      refundOfPaymentId: PAYMENT_A,
      reference: "RF-001",
      note: "Customer refund",
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "RF",
        input: {
          paymentId: PAYMENT_A,
          amount: 2000,
          method: "TRANSFER",
          reference: "RF-001",
          note: "Customer refund",
        },
        confirmed: true,
        reason: "Routine refund test",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("RF");
    expect(paymentFindFirst).toHaveBeenCalledWith({
      where: {
        id: PAYMENT_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
      },
      include: {
        invoice: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
    expect(paymentCreate).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalled();
  });

  it("rejects RF without confirmation", async () => {
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
        input: {
          paymentId: PAYMENT_A,
          amount: 2000,
          method: "TRANSFER",
        },
        confirmed: false,
      });

    expect(res.status).toBe(422);
    expect(paymentFindFirst).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("enforces the payments.manage permission for RF", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    permissionFindUnique.mockResolvedValue({
      id: "permission-1",
    } as never);
    userPermissionFindUnique.mockResolvedValue(null);
    rolePermissionFindUnique.mockResolvedValue({
      allowed: false,
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "RF",
        input: {
          paymentId: PAYMENT_A,
          amount: 2000,
          method: "TRANSFER",
        },
        confirmed: true,
      });

    expect(res.status).toBe(403);
    expect(paymentFindFirst).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("rejects an RF request with invalid input", async () => {
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
        input: {
          paymentId: PAYMENT_A,
          amount: 0,
          method: "TRANSFER",
        },
        confirmed: true,
      });

    expect(res.status).toBe(422);
    expect(paymentFindFirst).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
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
        reason: "Routine stock issue test",
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

describe("Quick Operations routes - SOS", () => {
  beforeEach(() => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    permissionFindUnique.mockResolvedValue({
      id: "permission-1",
    } as never);
    userPermissionFindUnique.mockResolvedValue(null);
    rolePermissionFindUnique.mockResolvedValue({
      allowed: true,
    } as never);
  });

  it("executes a confirmed safe stop within the authenticated business and branch", async () => {
    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SOS",
        input: {
          pendingOfflineOperationCount: 0,
        },
        confirmed: true,
        reason: "Routine safe stop test",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        code: "SOS",
        result: {
          stopped: true,
          safeStateSaved: true,
          pendingOfflineOperationsPreserved: true,
          pendingOfflineOperationCount: 0,
          offlineQueueReconciled: false,
        },
      },
    });

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "quick_operation.executed",
        entityType: "QuickOperation",
        entityId: null,
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-1",
        metadata: expect.objectContaining({
          operationCode: "SOS",
          operationName: "Safe Stop / Safe Exit",
          safeStop: true,
          offlineQueueReconciled: false,
          pendingOfflineOperationCount: 0,
          pendingOfflineOperationsPreserved: true,
        }),
      }),
    );

    expect(orderFindFirst).not.toHaveBeenCalled();
  });

  it("rejects SOS without confirmation", async () => {
    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SOS",
        input: {},
        confirmed: false,
      });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe(
      "Confirmation is required for this quick operation",
    );
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("enforces the orders.update permission", async () => {
    rolePermissionFindUnique.mockResolvedValue({
      allowed: false,
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SOS",
        input: {
          pendingOfflineOperationCount: 0,
        },
        confirmed: true,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(
      "Insufficient permissions for this quick operation",
    );
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects unexpected SOS business-record input", async () => {
    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SOS",
        input: {
          orderId: ORDER_A,
          pendingOfflineOperationCount: 0,
        },
        confirmed: true,
        reason: "Routine safe stop validation test",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(
      "SOS does not accept business record input",
    );
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(orderFindFirst).not.toHaveBeenCalled();
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


describe("Quick Operations routes - SO", () => {
  it("switches to an existing order within the authenticated business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      customerId: CUSTOMER_A,
      orderNumber: "00042",
      status: "IN_PROGRESS",
      orderTotal: 9000,
      customer: {
        id: CUSTOMER_A,
        name: "Customer A",
        businessId: "biz-A",
      },
      branch: {
        id: BRANCH_A,
        name: "Main Branch",
        businessId: "biz-A",
      },
      items: [],
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SO",
        input: {
          orderId: ORDER_A,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("SO");
    expect(res.body.data.result.id).toBe(ORDER_A);
    expect(orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: ORDER_A,
          businessId: "biz-A",
          branchId: BRANCH_A,
        }),
      }),
    );
  });

  it("enforces the orders.view permission for SO", async () => {
    permissionFindUnique.mockResolvedValue({
      id: "permission-orders-view",
    } as never);
    userPermissionFindUnique.mockResolvedValue({
      allowed: false,
    } as never);

    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SO",
        input: {
          orderId: ORDER_A,
        },
      });

    expect(res.status).toBe(403);
    expect(orderFindFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the order is outside the authenticated business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    orderFindFirst.mockReset();
    orderFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SO",
        input: {
          orderId: ORDER_A,
        },
      });

    expect(res.status).toBe(404);
    expect(orderFindFirst).toHaveBeenCalledWith({
      where: {
        id: ORDER_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        customer: {
          is: {
            businessId: "biz-A",
            OR: [
              { ownerBranchId: { in: [BRANCH_A] } },
              { id: { in: [] } },
            ],
          },
        },
      },
      include: {
        customer: true,
        branch: true,
        items: true,
      },
    });
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed SO input before order lookup", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SO",
        input: {
          orderId: "not-a-uuid",
        },
      });

    expect(res.status).toBe(422);
    expect(orderFindFirst).not.toHaveBeenCalled();
  });

  it("does not mutate the order while switching", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      customerId: CUSTOMER_A,
      orderNumber: "00042",
      status: "IN_PROGRESS",
      orderTotal: 9000,
      customer: {
        id: CUSTOMER_A,
        name: "Customer A",
        businessId: "biz-A",
      },
      branch: {
        id: BRANCH_A,
        name: "Main Branch",
        businessId: "biz-A",
      },
      items: [],
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SO",
        input: {
          orderId: ORDER_A,
        },
      });

    expect(res.status).toBe(200);
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });
});

describe("Quick Operations routes - SC", () => {
  it("switches to an existing customer within the authenticated business", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    customerFindFirst.mockResolvedValue({
      id: CUSTOMER_A,
      name: "Customer A",
      businessId: "biz-A",
      ownerBranchId: BRANCH_A,
      isActive: true,
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SC",
        input: {
          customerId: CUSTOMER_A,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("SC");
    expect(res.body.data.result.id).toBe(CUSTOMER_A);

    expect(customerFindFirst).toHaveBeenCalledWith({
      where: {
        id: CUSTOMER_A,
        businessId: "biz-A",
        OR: [
          { ownerBranchId: { in: [BRANCH_A] } },
          { id: { in: [] } },
        ],
      },
      include: { ownerBranch: { select: { id: true, name: true } } },
    });
  });

  it("enforces the customers.view permission for SC", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    permissionFindUnique.mockResolvedValue({
      id: "permission-customers-view",
    } as never);
    userPermissionFindUnique.mockResolvedValue({
      allowed: false,
    } as never);
    rolePermissionFindUnique.mockResolvedValue({
      allowed: false,
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SC",
        input: {
          customerId: CUSTOMER_A,
        },
      });

    expect(res.status).toBe(403);
    expect(customerFindFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the customer is outside the authenticated business", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    customerFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SC",
        input: {
          customerId: CUSTOMER_A,
        },
      });

    expect(res.status).toBe(404);

    expect(customerFindFirst).toHaveBeenCalledWith({
      where: {
        id: CUSTOMER_A,
        businessId: "biz-A",
        OR: [
          { ownerBranchId: { in: [BRANCH_A] } },
          { id: { in: [] } },
        ],
      },
      include: { ownerBranch: { select: { id: true, name: true } } },
    });

    expect(customerUpdateMany).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed SC input before customer lookup", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SC",
        input: {
          customerId: "not-a-uuid",
        },
      });

    expect(res.status).toBe(422);
    expect(customerFindFirst).not.toHaveBeenCalled();
  });

  it("does not mutate the customer while switching", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    customerFindFirst.mockResolvedValue({
      id: CUSTOMER_A,
      name: "Customer A",
      businessId: "biz-A",
      isActive: true,
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "SC",
        input: {
          customerId: CUSTOMER_A,
        },
      });

    expect(res.status).toBe(200);
    expect(customerUpdateMany).not.toHaveBeenCalled();
  });
});


describe("Quick Operations routes - TC", () => {
  it("transfers only Customer A orders from the active branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    permissionFindUnique.mockResolvedValue({
      id: "permission-1",
    } as never);
    userPermissionFindUnique.mockResolvedValue(null);
    rolePermissionFindUnique.mockResolvedValue({
      allowed: true,
    } as never);

    customerFindFirst
      .mockResolvedValueOnce({
        id: CUSTOMER_A,
        name: "Customer A",
        businessId: "biz-A",
        ownerBranchId: BRANCH_A,
      } as never)
      .mockResolvedValueOnce({
        id: CUSTOMER_B,
        name: "Customer B",
        businessId: "biz-A",
        ownerBranchId: BRANCH_A,
      } as never);

    const transferredOrders = [
      {
        id: ORDER_A,
        orderNumber: "00042",
        branchId: BRANCH_A,
      },
    ];

    orderFindMany.mockResolvedValue(transferredOrders as never);
    orderUpdateMany.mockResolvedValue({
      count: transferredOrders.length,
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "TC",
        input: {
          customerId: CUSTOMER_A,
          targetCustomerId: CUSTOMER_B,
        },
        confirmed: true,
        reason: "Routine customer transfer test",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("TC");

    expect(orderFindMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        branchId: BRANCH_A,
        customerId: CUSTOMER_A,
      },
      select: {
        id: true,
        orderNumber: true,
        branchId: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        branchId: BRANCH_A,
        customerId: CUSTOMER_A,
      },
      data: {
        customerId: CUSTOMER_B,
      },
    });

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz-A",
        actorUserId: "user-1",
        entityType: "Customer",
        entityId: CUSTOMER_A,
        metadata: expect.objectContaining({
          operationCode: "TC",
          operationName: "Transfer Customer",
          targetCustomerId: CUSTOMER_B,
          transferredOrderCount: 1,
          transferredOrderIds: transferredOrders.map((order) => order.id),
          transferredOrderNumbers: ["00042"],
        }),
      }),
    );
  });

  it("does not allow TC to target a customer outside the authenticated business", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    customerFindFirst
      .mockResolvedValueOnce({
        id: CUSTOMER_A,
        name: "Customer A",
        businessId: "biz-A",
        ownerBranchId: BRANCH_A,
      } as never)
      .mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "TC",
        input: {
          customerId: CUSTOMER_A,
          targetCustomerId: CUSTOMER_B,
        },
        confirmed: true,
        reason: "Routine customer transfer isolation test",
      });

    expect(res.status).toBe(404);
    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects TC without confirmation", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "TC",
        input: {
          customerId: CUSTOMER_A,
          targetCustomerId: CUSTOMER_B,
        },
        confirmed: false,
      });

    expect(res.status).toBe(422);
    expect(customerFindFirst).not.toHaveBeenCalled();
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it("enforces the customers.update permission for TC", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

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
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "TC",
        input: {
          customerId: CUSTOMER_A,
          targetCustomerId: CUSTOMER_B,
        },
        confirmed: true,
      });

    expect(res.status).toBe(403);
    expect(customerFindFirst).not.toHaveBeenCalled();
    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });
});


describe("Quick Operations routes - MA", () => {
  it("merges Customer A into Customer B within the active branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    permissionFindUnique.mockResolvedValue({
      id: "permission-1",
    } as never);
    userPermissionFindUnique.mockResolvedValue(null);
    rolePermissionFindUnique.mockResolvedValue({
      allowed: true,
    } as never);

    customerFindFirst
      .mockResolvedValueOnce({
        id: CUSTOMER_A,
        name: "Customer A",
        businessId: "biz-A",
        ownerBranchId: BRANCH_A,
        isActive: true,
      } as never)
      .mockResolvedValueOnce({
        id: CUSTOMER_B,
        name: "Customer B",
        businessId: "biz-A",
        ownerBranchId: BRANCH_A,
        isActive: true,
      } as never);

    const mergedOrders = [
      {
        id: ORDER_A,
        orderNumber: "00042",
        branchId: BRANCH_A,
      },
    ];

    orderFindMany.mockResolvedValue(mergedOrders as never);
    orderUpdateMany.mockResolvedValue({
      count: mergedOrders.length,
    } as never);
    customerUpdateMany.mockResolvedValue({
      count: 1,
    } as never);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "MA",
        input: {
          customerId: CUSTOMER_A,
          targetCustomerId: CUSTOMER_B,
        },
        confirmed: true,
        reason: "Routine customer merge test",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("MA");

    expect(orderFindMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        branchId: BRANCH_A,
        customerId: CUSTOMER_A,
      },
      select: {
        id: true,
        orderNumber: true,
        branchId: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        branchId: BRANCH_A,
        customerId: CUSTOMER_A,
      },
      data: {
        customerId: CUSTOMER_B,
      },
    });

    expect(customerUpdateMany).toHaveBeenCalledWith({
      where: {
        id: CUSTOMER_A,
        businessId: "biz-A",
        ownerBranchId: BRANCH_A,
      },
      data: {
        isActive: false,
      },
    });

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz-A",
        actorUserId: "user-1",
        entityType: "Customer",
        entityId: CUSTOMER_A,
        metadata: expect.objectContaining({
          operationCode: "MA",
          operationName: "Merge Account",
          targetCustomerId: CUSTOMER_B,
          mergedOrderCount: 1,
          mergedOrderIds: mergedOrders.map((order) => order.id),
          mergedOrderNumbers: ["00042"],
          reason: "Routine customer merge test",
          sourceDeactivated: true,
        }),
      }),
    );
  });

  it("does not allow MA to target a customer outside the authenticated business", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    customerFindFirst
      .mockResolvedValueOnce({
        id: CUSTOMER_A,
        name: "Customer A",
        businessId: "biz-A",
        ownerBranchId: BRANCH_A,
        isActive: true,
      } as never)
      .mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "MA",
        input: {
          customerId: CUSTOMER_A,
          targetCustomerId: CUSTOMER_B,
        },
        confirmed: true,
        reason: "Routine customer merge isolation test",
      });

    expect(res.status).toBe(404);
    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(customerUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects MA without confirmation", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/quick-operations/execute")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "MA",
        input: {
          customerId: CUSTOMER_A,
          targetCustomerId: CUSTOMER_B,
        },
        confirmed: false,
      });

    expect(res.status).toBe(422);
    expect(customerFindFirst).not.toHaveBeenCalled();
    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(customerUpdateMany).not.toHaveBeenCalled();
  });

  it("enforces the customers.update permission for MA", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

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
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        code: "MA",
        input: {
          customerId: CUSTOMER_A,
          targetCustomerId: CUSTOMER_B,
        },
        confirmed: true,
      });

    expect(res.status).toBe(403);
    expect(customerFindFirst).not.toHaveBeenCalled();
    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(customerUpdateMany).not.toHaveBeenCalled();
});
});
