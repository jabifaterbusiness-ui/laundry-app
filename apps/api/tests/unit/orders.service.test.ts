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
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import {
  createOrder,
  getOrderForBusiness,
  listOrders,
  updateOrderStatus,
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
    order: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createOrder", () => {
  it("rejects an empty order", async () => {
    await expect(
      createOrder({
        businessId: "biz-A",
        branchId: BRANCH_A,
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

    tx.order.create.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "ORD-TEST-1000",
      orderTotal: 9000,
      items: [
        {
          serviceId: SERVICE_AGBADA,
          serviceName: "Complete Agbada",
          piecesPerUnit: 3,
          quantity: 2,
          totalPieces: 6,
          unitPrice: 4500,
          lineTotal: 9000,
        },
      ],
    } as never);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await createOrder({
      businessId: "biz-A",
      branchId: BRANCH_A,
      customerId: CUSTOMER_A,
      items: [
        {
          serviceId: SERVICE_AGBADA,
          quantity: 2,
        },
      ],
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

    tx.order.create.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "ORD-TEST-1001",
      orderTotal: 12000,
    } as never);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await createOrder({
      businessId: "biz-A",
      branchId: BRANCH_A,
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

    tx.order.findUnique.mockResolvedValue(null);
    tx.order.create.mockResolvedValue({ id: ORDER_A } as never);

    transaction.mockImplementation(async (callback) => callback(tx as never));

    await createOrder({
      businessId: "biz-A",
      branchId: BRANCH_A,
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
      page: 1,
      pageSize: 25,
    });

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
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
    );

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

  it("business B cannot retrieve business A's order", async () => {
    orderFindFirst.mockResolvedValue(null);

    const result = await getOrderForBusiness(
      ORDER_A,
      "biz-B",
      BRANCH_A,
    );

    expect(result).toBeNull();

    expect(orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ORDER_A,
          businessId: "biz-B",
          branchId: BRANCH_A,
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
    );

    expect(result).toBeNull();

    expect(orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ORDER_A,
          businessId: "biz-A",
          branchId: BRANCH_B,
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
});
