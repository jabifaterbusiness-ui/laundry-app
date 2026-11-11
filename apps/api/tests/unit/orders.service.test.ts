import { beforeEach, describe, expect, it, vi } from "vitest";

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
    branchResourceShare: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import {
  createOrder,
  getOrderForBusiness,
  listOrders,
  updateOrderStatus,
  transferOrder,
} from "../../src/modules/orders/orders.service.js";
import { AppError } from "../../src/middleware/error-handler.js";

const orderFindMany = vi.mocked(prisma.order.findMany);
const orderCount = vi.mocked(prisma.order.count);
const orderFindFirst = vi.mocked(prisma.order.findFirst);
const orderFindUnique = vi.mocked(prisma.order.findUnique);
const orderCreate = vi.mocked(prisma.order.create);
const orderUpdate = vi.mocked(prisma.order.update);
const transaction = vi.mocked(prisma.$transaction);

const CUSTOMER_A = "11111111-1111-1111-1111-111111111111";
const CUSTOMER_B = "22222222-2222-2222-2222-222222222222";

const BRANCH_A = "33333333-3333-3333-3333-333333333333";
const BRANCH_B = "44444444-4444-4444-4444-444444444444";

const SERVICE_SHIRT = "55555555-5555-5555-5555-555555555555";
const SERVICE_AGBADA = "66666666-6666-6666-6666-666666666666";

const ORDER_A = "77777777-7777-7777-7777-777777777777";

function createTransactionClient() {
  return {
    customer: {
      findFirst: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    service: {
      findMany: vi.fn(),
    },
    customerServicePrice: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    branchResourceShare: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    taxRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    orderNumberSequence: {
      upsert: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    garment: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn(),
    },
    invoice: {
      create: vi.fn().mockResolvedValue({ totalAmount: 0 }),
    },
    auditLog: {
      create: vi.fn(),
    },
    business: {
      findUnique: vi.fn().mockResolvedValue({
        id: "biz-A",
        name: "Test Laundry",
        phone: null,
        email: null,
        website: null,
        address: null,
        logoUrl: null,
        receiptPrimaryColor: null,
        receiptAccentColor: null,
        receiptBackgroundColor: null,
        receiptTextColor: null,
        receiptHeaderStyle: null,
        defaultCustomerAgreement:
          "Customer agrees to the laundry service terms and conditions.",
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.branchResourceShare.findMany).mockResolvedValue([] as never);
});

describe("createOrder", () => {
  it("rejects an empty order", async () => {
    await expect(
      createOrder({
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-A",
        customerId: CUSTOMER_A,
        items: [],
      }),
    ).rejects.toThrow("An order must contain at least one item");

    expect(transaction).not.toHaveBeenCalled();
  });

  it("requires the customer to belong to the authenticated business", async () => {
    const tx = createTransactionClient();

    tx.customer.findFirst.mockResolvedValue(null);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await expect(
      createOrder({
        businessId: "biz-B",
        branchId: BRANCH_A,
        actorUserId: "user-A",
        customerId: CUSTOMER_A,
        items: [
          {
            serviceId: SERVICE_SHIRT,
            quantity: 1,
          },
        ],
      }),
    ).rejects.toThrow(AppError);

    expect(tx.customer.findFirst).toHaveBeenCalledWith({
      where: {
        id: CUSTOMER_A,
        businessId: "biz-B",
        OR: [
          { ownerBranchId: { in: [BRANCH_A] } },
          { id: { in: [] } },
        ],
      },
      select: {
        id: true,
        name: true,
      },
    });
  });

  it("requires the branch to belong to the authenticated business", async () => {
    const tx = createTransactionClient();

    tx.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_A,
      name: "Jane Doe",
    });

    tx.branch.findFirst.mockResolvedValue(null);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await expect(
      createOrder({
        businessId: "biz-B",
        branchId: BRANCH_B,
        actorUserId: "user-A",
        customerId: CUSTOMER_A,
        items: [
          {
            serviceId: SERVICE_SHIRT,
            quantity: 1,
          },
        ],
      }),
    ).rejects.toThrow(AppError);

    expect(tx.branch.findFirst).toHaveBeenCalledWith({
      where: {
        id: BRANCH_B,
        businessId: "biz-B",
      },
      select: {
        id: true,
        name: true,
      },
    });
  });

  it("requires every selected service to belong to the authenticated business", async () => {
    const tx = createTransactionClient();

    tx.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_A,
      name: "Jane Doe",
    });

    tx.branch.findFirst.mockResolvedValue({
      id: BRANCH_A,
      name: "Main Branch",
    });

    tx.service.findMany.mockResolvedValue([]);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await expect(
      createOrder({
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-A",
        customerId: CUSTOMER_A,
        items: [
          {
            serviceId: SERVICE_SHIRT,
            quantity: 1,
          },
        ],
      }),
    ).rejects.toThrow("One or more selected services were not found");

    expect(tx.service.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [SERVICE_SHIRT] },
        businessId: "biz-A",
        OR: [
          { ownerBranchId: null },
          { ownerBranchId: { in: [BRANCH_A] } },
          { id: { in: [] } },
        ],
      },
    });
  });

  it("rejects an inactive service", async () => {
    const tx = createTransactionClient();

    tx.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_A,
      name: "Jane Doe",
    });

    tx.branch.findFirst.mockResolvedValue({
      id: BRANCH_A,
      name: "Main Branch",
    });

    tx.service.findMany.mockResolvedValue([
      {
        id: SERVICE_SHIRT,
        name: "Shirt",
        pieces: 1,
        unitPrice: 1000,
        isActive: false,
      },
    ]);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await expect(
      createOrder({
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-A",
        customerId: CUSTOMER_A,
        items: [
          {
            serviceId: SERVICE_SHIRT,
            quantity: 1,
          },
        ],
      }),
    ).rejects.toThrow('Service "Shirt" is inactive and cannot be added to an order');

    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it("rejects zero quantity", async () => {
    const tx = createTransactionClient();

    tx.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_A,
      name: "Jane Doe",
    });

    tx.branch.findFirst.mockResolvedValue({
      id: BRANCH_A,
      name: "Main Branch",
    });

    tx.service.findMany.mockResolvedValue([
      {
        id: SERVICE_SHIRT,
        name: "Shirt",
        pieces: 1,
        unitPrice: 1000,
        isActive: true,
      },
    ]);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await expect(
      createOrder({
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-A",
        customerId: CUSTOMER_A,
        items: [
          {
            serviceId: SERVICE_SHIRT,
            quantity: 0,
          },
        ],
      }),
    ).rejects.toThrow("Quantity for \"Shirt\" must be a positive whole number");

    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it("rejects negative quantity", async () => {
    const tx = createTransactionClient();

    tx.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_A,
      name: "Jane Doe",
    });

    tx.branch.findFirst.mockResolvedValue({
      id: BRANCH_A,
      name: "Main Branch",
    });

    tx.service.findMany.mockResolvedValue([
      {
        id: SERVICE_SHIRT,
        name: "Shirt",
        pieces: 1,
        unitPrice: 1000,
        isActive: true,
      },
    ]);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await expect(
      createOrder({
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-A",
        customerId: CUSTOMER_A,
        items: [
          {
            serviceId: SERVICE_SHIRT,
            quantity: -2,
          },
        ],
      }),
    ).rejects.toThrow("Quantity for \"Shirt\" must be a positive whole number");
  });

  it("snapshots service pricing and calculates PCS and line total correctly", async () => {
    const tx = createTransactionClient();

    tx.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_A,
      name: "Jane Doe",
    });

    tx.branch.findFirst.mockResolvedValue({
      id: BRANCH_A,
      name: "Main Branch",
    });

    tx.service.findMany.mockResolvedValue([
      {
        id: SERVICE_AGBADA,
        name: "Complete Agbada",
        pieces: 3,
        unitPrice: 4500,
        isActive: true,
      },
    ]);

    tx.order.findUnique.mockResolvedValue(null);

    tx.orderNumberSequence.upsert.mockResolvedValue({
      nextNumber: 2,
    });

    tx.order.create.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "ORD-TEST-1000",
      orderTotal: 9000,
      customer: {
        id: CUSTOMER_A,
        name: "Jane Doe",
      },
      branch: {
        id: BRANCH_A,
        name: "Main Branch",
      },
      items: [
        {
          id: "order-item-agbada",
          serviceId: SERVICE_AGBADA,
          serviceName: "Complete Agbada",
          piecesPerUnit: 3,
          quantity: 2,
          totalPieces: 6,
          unitPrice: 4500,
          lineTotal: 9000,
          colors: [],
        },
      ],
    } as never);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    tx.branchResourceShare.findMany.mockImplementation(async (args) =>
      (args as unknown as { where: { resourceType?: string } }).where.resourceType === "CUSTOMER_PRICING"
        ? [{ ownerBranchId: BRANCH_B, resourceId: null, accessLevel: "READ" }] as never
        : [],
    );

    await createOrder({
      businessId: "biz-A",
      branchId: BRANCH_A,
      actorUserId: "user-A",
      customerId: CUSTOMER_A,
      items: [
        {
          serviceId: SERVICE_AGBADA,
          quantity: 2,
          colors: ["White", "Blue"],
        },
      ],
    });

    expect(tx.customer.findFirst).toHaveBeenCalledWith({
      where: {
        id: CUSTOMER_A,
        businessId: "biz-A",
        OR: [
          { ownerBranchId: null },
          { ownerBranchId: { in: [BRANCH_A] } },
          { id: { in: [] } },
        ],
      },
      select: { id: true, name: true },
    });
    expect(tx.service.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [SERVICE_AGBADA] },
        businessId: "biz-A",
        OR: [
          { ownerBranchId: null },
          { ownerBranchId: { in: [BRANCH_A] } },
          { id: { in: [] } },
        ],
      },
    });
    expect(tx.customerServicePrice.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        customerId: CUSTOMER_A,
        serviceId: { in: [SERVICE_AGBADA] },
        OR: [
          { branchId: null },
          { branchId: { in: [BRANCH_A, BRANCH_B] } },
          { id: { in: [] } },
        ],
      },
      select: { serviceId: true, unitPrice: true },
    });

    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderTotal: 9000,
          items: {
            create: [
              expect.objectContaining({
                serviceName: "Complete Agbada",
                piecesPerUnit: 3,
                quantity: 2,
                totalPieces: 6,
                unitPrice: 4500,
                lineTotal: 9000,
                colors: ["White", "Blue"],
              }),
            ],
          },
        }),
      }),
    );
  });

  it("calculates multiple order lines correctly", async () => {
    const tx = createTransactionClient();

    tx.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_A,
      name: "Jane Doe",
    });

    tx.branch.findFirst.mockResolvedValue({
      id: BRANCH_A,
      name: "Main Branch",
    });

    tx.service.findMany.mockResolvedValue([
      {
        id: SERVICE_AGBADA,
        name: "Complete Agbada",
        pieces: 3,
        unitPrice: 4500,
        isActive: true,
      },
      {
        id: SERVICE_SHIRT,
        name: "Shirt",
        pieces: 1,
        unitPrice: 1000,
        isActive: true,
      },
    ]);

    tx.order.findUnique.mockResolvedValue(null);

    tx.orderNumberSequence.upsert.mockResolvedValue({
      nextNumber: 2,
    });

    tx.order.create.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "ORD-TEST-1001",
      orderTotal: 12000,
      customer: {
        id: CUSTOMER_A,
        name: "Jane Doe",
      },
      branch: {
        id: BRANCH_A,
        name: "Main Branch",
      },
      items: [
        {
          id: "order-item-agbada",
          serviceId: SERVICE_AGBADA,
          serviceName: "Complete Agbada",
          piecesPerUnit: 3,
          quantity: 2,
          totalPieces: 6,
          unitPrice: 4500,
          lineTotal: 9000,
          colors: [],
        },
        {
          id: "order-item-shirt",
          serviceId: SERVICE_SHIRT,
          serviceName: "Shirt",
          piecesPerUnit: 1,
          quantity: 3,
          totalPieces: 3,
          unitPrice: 1000,
          lineTotal: 3000,
          colors: [],
        },
      ],
    } as never);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await createOrder({
      businessId: "biz-A",
      branchId: BRANCH_A,
      actorUserId: "user-A",
      customerId: CUSTOMER_A,
      items: [
        {
          serviceId: SERVICE_AGBADA,
          quantity: 2,
        },
        {
          serviceId: SERVICE_SHIRT,
          quantity: 3,
        },
      ],
    });

    const createCall = tx.order.create.mock.calls[0]![0];

    expect(createCall.data.orderTotal).toBe(12000);

    expect(createCall.data.items).toEqual({
      create: [
        expect.objectContaining({
          serviceName: "Complete Agbada",
          piecesPerUnit: 3,
          quantity: 2,
          totalPieces: 6,
          unitPrice: 4500,
          lineTotal: 9000,
        }),
        expect.objectContaining({
          serviceName: "Shirt",
          piecesPerUnit: 1,
          quantity: 3,
          totalPieces: 3,
          unitPrice: 1000,
          lineTotal: 3000,
        }),
      ],
    });
  });

  it("stores garmentNote and internalNote separately", async () => {
    const tx = createTransactionClient();

    tx.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_A,
      name: "Jane Doe",
    });

    tx.branch.findFirst.mockResolvedValue({
      id: BRANCH_A,
      name: "Main Branch",
    });

    tx.service.findMany.mockResolvedValue([
      {
        id: SERVICE_SHIRT,
        name: "Shirt",
        pieces: 1,
        unitPrice: 1000,
        isActive: true,
      },
    ]);

    tx.orderNumberSequence.upsert.mockResolvedValue({
      nextNumber: 2,
    });

    tx.order.findUnique.mockResolvedValue(null);
    tx.order.create.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "ORD-TEST-1002",
      orderTotal: 1000,
      customer: {
        id: CUSTOMER_A,
        name: "Jane Doe",
      },
      branch: {
        id: BRANCH_A,
        name: "Main Branch",
      },
      items: [
        {
          id: "order-item-shirt",
          serviceId: SERVICE_SHIRT,
          serviceName: "Shirt",
          piecesPerUnit: 1,
          quantity: 1,
          totalPieces: 1,
          unitPrice: 1000,
          lineTotal: 1000,
          colors: [],
        },
      ],
    } as never);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await createOrder({
      businessId: "biz-A",
      branchId: BRANCH_A,
      actorUserId: "user-A",
      customerId: CUSTOMER_A,
      items: [
        {
          serviceId: SERVICE_SHIRT,
          quantity: 1,
        },
      ],
      garmentNote: "Handle white shirt carefully",
      internalNote: "Customer has outstanding balance",
    });

    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          garmentNote: "Handle white shirt carefully",
          internalNote: "Customer has outstanding balance",
        }),
      }),
    );
  });

  it("lists orders scoped to business and branch", async () => {
    orderFindMany.mockResolvedValue([]);
    orderCount.mockResolvedValue(0);

    await listOrders({
      businessId: "biz-A",
      branchId: BRANCH_A,
      userId: "user-A",
      page: 1,
      pageSize: 25,
    });

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
          customer: { is: { businessId: "biz-A", OR: [{ ownerBranchId: { in: [BRANCH_A] } }, { id: { in: [] } }] } },
        },
      }),
    );

    expect(orderCount).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        branchId: BRANCH_A,
      },
    });
  });

  it("applies customer and status filters", async () => {
    orderFindMany.mockResolvedValue([]);
    orderCount.mockResolvedValue(0);

    await listOrders({
      businessId: "biz-A",
      branchId: BRANCH_A,
      customerId: CUSTOMER_A,
      status: "READY_FOR_PICKUP",
      page: 2,
      pageSize: 10,
    });

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
          customer: { is: { businessId: "biz-A", OR: [{ ownerBranchId: { in: [BRANCH_A] } }, { id: { in: [] } }] } },
          customerId: CUSTOMER_A,
          status: "READY_FOR_PICKUP",
        },
        skip: 10,
        take: 10,
      }),
    );
  });

  it("returns pagination metadata", async () => {
    orderFindMany.mockResolvedValue([]);
    orderCount.mockResolvedValue(47);

    const result = await listOrders({
      businessId: "biz-A",
      branchId: BRANCH_A,
      userId: "user-A",
      page: 2,
      pageSize: 20,
    });

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 47,
      totalPages: 3,
    });
  });

  it("gets an order using id, businessId and branchId together", async () => {
    orderFindFirst.mockResolvedValue(null);

    await getOrderForBusiness(
      ORDER_A,
      "biz-A",
      BRANCH_A,
      "user-A",
    );

    expect(orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ORDER_A,
          businessId: "biz-A",
          branchId: BRANCH_A,
          customer: { is: { businessId: "biz-A", OR: [{ ownerBranchId: { in: [BRANCH_A] } }, { id: { in: [] } }] } },
        },
      }),
    );
  });

  it("business B cannot retrieve business A's order", async () => {
    orderFindFirst.mockResolvedValue(null);

    const result = await getOrderForBusiness(
      ORDER_A,
      "biz-B",
      BRANCH_A,
      "user-A",
    );

    expect(result).toBeNull();

    expect(orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ORDER_A,
          businessId: "biz-B",
          branchId: BRANCH_A,
          customer: { is: { businessId: "biz-B", OR: [{ ownerBranchId: { in: [BRANCH_A] } }, { id: { in: [] } }] } },
        },
      }),
    );
  });

  it("branch A cannot retrieve an order from branch B", async () => {
    orderFindFirst.mockResolvedValue(null);

    const result = await getOrderForBusiness(
      ORDER_A,
      "biz-A",
      BRANCH_B,
      "user-A",
    );

    expect(result).toBeNull();

    expect(orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ORDER_A,
          businessId: "biz-A",
          branchId: BRANCH_B,
          customer: { is: { businessId: "biz-A", OR: [{ ownerBranchId: { in: [BRANCH_B] } }, { id: { in: [] } }] } },
        },
      }),
    );
  });

  it("updates an order status within the correct business and branch", async () => {
    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      status: "RECEIVED",
    } as never);

    orderUpdate.mockResolvedValue({
      id: ORDER_A,
      status: "READY_FOR_PICKUP",
    } as never);

    await updateOrderStatus(
      ORDER_A,
      "biz-A",
      BRANCH_A,
      "READY_FOR_PICKUP",
    );

    expect(orderFindFirst).toHaveBeenCalledWith({
      where: {
        id: ORDER_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
      },
    });

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ORDER_A },
        data: expect.objectContaining({
          status: "READY_FOR_PICKUP",
          readyAt: expect.any(Date),
        }),
      }),
    );
  });

  it("sets completedAt when an order becomes completed", async () => {
    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      status: "READY_FOR_PICKUP",
    } as never);

    orderUpdate.mockResolvedValue({
      id: ORDER_A,
      status: "COMPLETED",
    } as never);

    await updateOrderStatus(
      ORDER_A,
      "biz-A",
      BRANCH_A,
      "COMPLETED",
    );

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "COMPLETED",
          completedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("sets cancelledAt when an order becomes cancelled", async () => {
    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      status: "RECEIVED",
    } as never);

    orderUpdate.mockResolvedValue({
      id: ORDER_A,
      status: "CANCELLED",
    } as never);

    await updateOrderStatus(
      ORDER_A,
      "biz-A",
      BRANCH_A,
      "CANCELLED",
    );

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CANCELLED",
          cancelledAt: expect.any(Date),
        }),
      }),
    );
  });

  it("returns 404 when updating an order outside the business or branch", async () => {
    orderFindFirst.mockResolvedValue(null);

    await expect(
      updateOrderStatus(
        ORDER_A,
        "biz-B",
        BRANCH_B,
        "COMPLETED",
      ),
    ).rejects.toThrow("Order not found");

    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("writes the status transition history in the same serializable transaction", async () => {
    const tx = createTransactionClient();
    tx.order.findFirst.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      status: "RECEIVED",
    } as never);
    tx.order.update.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      status: "IN_PROGRESS",
      items: [],
    } as never);
    (tx as never as { auditLog: { create: ReturnType<typeof vi.fn> } }).auditLog.create = vi.fn().mockResolvedValue({ id: "history-1" });
    transaction.mockImplementation(async (callback) => callback(tx as never));

    const result = await updateOrderStatus(
      ORDER_A, "biz-A", BRANCH_A, "IN_PROGRESS", prisma,
      { actorUserId: "user-A", correlationId: "request-1" },
    );

    expect(result.status).toBe("IN_PROGRESS");
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect((tx as never as { auditLog: { create: ReturnType<typeof vi.fn> } }).auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "order.status_updated",
        entityType: "Order",
        entityId: ORDER_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-A",
        correlationId: "request-1",
        metadata: expect.objectContaining({
          previousStatus: "RECEIVED",
          status: "IN_PROGRESS",
        }),
      }),
    });
  });

  it("does not report a successful status change when its history write fails", async () => {
    const tx = createTransactionClient();
    tx.order.findFirst.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      status: "RECEIVED",
    } as never);
    tx.order.update.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      status: "IN_PROGRESS",
      items: [],
    } as never);
    (tx as never as { auditLog: { create: ReturnType<typeof vi.fn> } }).auditLog.create = vi.fn().mockRejectedValue(new Error("audit storage unavailable"));
    transaction.mockImplementation(async (callback) => callback(tx as never));

    await expect(updateOrderStatus(
      ORDER_A, "biz-A", BRANCH_A, "IN_PROGRESS", prisma,
      { actorUserId: "user-A" },
    )).rejects.toThrow("audit storage unavailable");

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

describe("transferOrder", () => {
  it("transfers an order to another customer", async () => {
    const tx = createTransactionClient();

    tx.order.findFirst.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      customerId: CUSTOMER_A,
    });

    tx.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_B,
      name: "Customer B",
    });

    tx.order.update.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      customerId: CUSTOMER_B,
    });

    transaction.mockImplementation(async (callback) => callback(tx as never));

    const result = await transferOrder(
      ORDER_A,
      "biz-A",
      BRANCH_A,
      CUSTOMER_B,
      "user-A",
    );

    expect(result).toEqual({
      id: ORDER_A,
      orderNumber: "00042",
      customerId: CUSTOMER_B,
    });

    expect(tx.order.findFirst).toHaveBeenCalledWith({
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

    expect(tx.customer.findFirst).toHaveBeenCalledWith({
      where: {
        id: CUSTOMER_B,
        businessId: "biz-A",
        OR: [
          { ownerBranchId: null },
          { ownerBranchId: { in: [BRANCH_A] } },
          { id: { in: [] } },
        ],
      },
      select: {
        id: true,
        name: true,
      },
    });

    expect(tx.order.update).toHaveBeenCalledWith({
      where: {
        id: ORDER_A,
      },
      data: {
        customer: {
          connect: {
            id: CUSTOMER_B,
          },
        },
      },
      include: {
        customer: true,
        branch: true,
        items: true,
      },
    });
  });

  it("rejects an order outside the authenticated business or branch", async () => {
    const tx = createTransactionClient();

    tx.order.findFirst.mockResolvedValue(null);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await expect(
      transferOrder(
        ORDER_A,
        "biz-B",
        BRANCH_B,
        CUSTOMER_B,
        "user-A",
      ),
    ).rejects.toThrow("Order not found");

    expect(tx.customer.findFirst).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it("rejects a destination customer outside the authenticated business", async () => {
    const tx = createTransactionClient();

    tx.order.findFirst.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      customerId: CUSTOMER_A,
    });

    tx.customer.findFirst.mockResolvedValue(null);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await expect(
      transferOrder(
        ORDER_A,
        "biz-A",
        BRANCH_A,
        CUSTOMER_B,
        "user-A",
      ),
    ).rejects.toThrow("Customer not found");

    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it("rejects transferring to the same customer", async () => {
    const tx = createTransactionClient();

    tx.order.findFirst.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      customerId: CUSTOMER_A,
    });

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await expect(
      transferOrder(
        ORDER_A,
        "biz-A",
        BRANCH_A,
        CUSTOMER_A,
        "user-A",
      ),
    ).rejects.toThrow(
      "Order is already assigned to this customer",
    );

    expect(tx.customer.findFirst).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it("runs the transfer inside a Prisma transaction", async () => {
    const tx = createTransactionClient();

    tx.order.findFirst.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      customerId: CUSTOMER_A,
    });

    tx.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_B,
      name: "Customer B",
    });

    tx.order.update.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      customerId: CUSTOMER_B,
    });

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await transferOrder(
      ORDER_A,
      "biz-A",
      BRANCH_A,
      CUSTOMER_B,
      "user-A",
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.order.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.customer.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.order.update).toHaveBeenCalledTimes(1);
  });
});

});
