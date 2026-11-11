import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    offlineSyncOperation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../src/modules/permissions/permissions.service.js", () => ({
  hasPermission: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/modules/customers/customers.service.js", () => ({
  createCustomer: vi.fn(),
  findPossibleDuplicates: vi.fn(),
  updateCustomer: vi.fn(),
}));

vi.mock("../../src/modules/orders/orders.service.js", () => ({
  createOrder: vi.fn(),
  transferOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    ...prismaMock,
    $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock),
    ),
  },
}));

import {
  enqueueSyncOperation,
  getSyncOperation,
  listSyncOperations,
  replaySyncOperation,
} from "../../src/modules/sync/sync.service.js";

import { hasPermission } from "../../src/modules/permissions/permissions.service.js";
import {
  createCustomer,
  findPossibleDuplicates,
  updateCustomer,
} from "../../src/modules/customers/customers.service.js";

import {
  createOrder,
  transferOrder,
  updateOrderStatus,
} from "../../src/modules/orders/orders.service.js";

const createCustomerMock = vi.mocked(createCustomer);
const findPossibleDuplicatesMock = vi.mocked(findPossibleDuplicates);
const updateCustomerMock = vi.mocked(updateCustomer);
const createOrderMock = vi.mocked(createOrder);
const transferOrderMock = vi.mocked(transferOrder);
const updateOrderStatusMock = vi.mocked(updateOrderStatus);

import { AppError } from "../../src/middleware/error-handler.js";

const validPayloads = {
  ORDER_CREATE: {
    customerId: "550e8400-e29b-41d4-a716-446655440000",
    items: [
      {
        serviceId: "550e8400-e29b-41d4-a716-446655440001",
        quantity: 1,
      },
    ],
  },
  ORDER_UPDATE: {
    action: "TRANSFER_CUSTOMER",
    orderId: "550e8400-e29b-41d4-a716-446655440002",
    customerId: "550e8400-e29b-41d4-a716-446655440003",
  },
  CUSTOMER_CREATE: {
    name: "Test Customer",
    phone: "08012345678",
  },
  CUSTOMER_UPDATE: {
    customerId: "550e8400-e29b-41d4-a716-446655440004",
    data: {
      name: "Updated Customer",
    },
  },
} as const;

const BUSINESS_A = "business-A";
const BUSINESS_B = "business-B";
const BRANCH_A = "branch-A";
const BRANCH_B = "branch-B";
const USER_A = "user-A";

const baseContext = {
  businessId: BUSINESS_A,
  branchId: BRANCH_A,
  actorUserId: USER_A,
  actorRole: "BUSINESS_OWNER" as const,
};

beforeEach(() => {
  vi.clearAllMocks();

  prismaMock.offlineSyncOperation.findFirst.mockReset();
  prismaMock.offlineSyncOperation.findMany.mockReset();
  prismaMock.offlineSyncOperation.count.mockReset();
  prismaMock.offlineSyncOperation.create.mockReset();
  prismaMock.offlineSyncOperation.updateMany.mockReset();
  prismaMock.offlineSyncOperation.update.mockReset();
  prismaMock.offlineSyncOperation.findUnique.mockReset();
  prismaMock.offlineSyncOperation.findUniqueOrThrow.mockReset();

  prismaMock.branch.findFirst.mockReset();
  prismaMock.user.findFirst.mockReset();

  vi.mocked(hasPermission).mockReset();
  vi.mocked(hasPermission).mockResolvedValue(true);

  vi.mocked(createCustomer).mockReset();
  vi.mocked(findPossibleDuplicates).mockReset();
  vi.mocked(updateCustomer).mockReset();
  vi.mocked(createOrder).mockReset();
  vi.mocked(transferOrder).mockReset();
  vi.mocked(updateOrderStatus).mockReset();

  prismaMock.branch.findFirst.mockResolvedValue({
    id: BRANCH_A,
  });

  prismaMock.user.findFirst.mockResolvedValue({
    id: USER_A,
  });
});

describe("enqueueSyncOperation", () => {
  it("creates a pending operation using authenticated business, branch and actor context", async () => {
    const operation = {
      id: "sync-1",
      businessId: BUSINESS_A,
      branchId: BRANCH_A,
      actorUserId: USER_A,
      clientOperationId: "client-001",
      operationType: "ORDER_CREATE",
      status: "PENDING",
      payloadVersion: 1,
      payload: {
        customerId: "550e8400-e29b-41d4-a716-446655440000",
        items: [
          {
            serviceId: "550e8400-e29b-41d4-a716-446655440001",
            quantity: 1,
          },
        ],
      },
    };

    prismaMock.offlineSyncOperation.create.mockResolvedValue(operation);

    const result = await enqueueSyncOperation({
      context: baseContext,
      clientOperationId: "client-001",
      operationType: "ORDER_CREATE",
      payload: validPayloads.ORDER_CREATE,
    });

    expect(result).toEqual(operation);
    expect(prismaMock.offlineSyncOperation.create).toHaveBeenCalledWith({
      data: {
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
        actorUserId: USER_A,
        clientOperationId: "client-001",
        operationType: "ORDER_CREATE",
        payloadVersion: 1,
        payload: {
          customerId: "550e8400-e29b-41d4-a716-446655440000",
          items: [
            {
              serviceId: "550e8400-e29b-41d4-a716-446655440001",
              quantity: 1,
            },
          ],
        },
        status: "PENDING",
        correlationId: null,
      },
    });
  });

  it.each([
    "ORDER_CREATE",
    "ORDER_UPDATE",
    "CUSTOMER_CREATE",
    "CUSTOMER_UPDATE",
  ] as const)("accepts the supported operation type %s", async (operationType) => {
    prismaMock.offlineSyncOperation.create.mockResolvedValue({
      id: "sync-supported",
      operationType,
      status: "PENDING",
    });

    await expect(
      enqueueSyncOperation({
        context: baseContext,
        clientOperationId: `client-${operationType}`,
        operationType,
        payload: validPayloads[operationType],
      }),
    ).resolves.toBeDefined();
  });

  it("returns the existing operation for a duplicate client operation id", async () => {
    const existing = {
      id: "sync-existing",
      businessId: BUSINESS_A,
      branchId: BRANCH_A,
      actorUserId: USER_A,
      clientOperationId: "client-duplicate",
      operationType: "ORDER_CREATE",
      status: "APPLIED",
      payloadVersion: 1,
      payload: validPayloads.ORDER_CREATE,
    };

    prismaMock.offlineSyncOperation.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        {
          code: "P2002",
          clientVersion: "5.22.0",
        },
      ),
    );
    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue(existing);

    const result = await enqueueSyncOperation({
      context: baseContext,
      clientOperationId: "client-duplicate",
      operationType: "ORDER_CREATE",
      payload: validPayloads.ORDER_CREATE,
    });

    expect(result).toEqual(existing);
    expect(prismaMock.offlineSyncOperation.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: BUSINESS_A,
        clientOperationId: "client-duplicate",
      },
    });
  });

  it("does not treat a duplicate from another business as the caller's operation", async () => {
    prismaMock.offlineSyncOperation.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        {
          code: "P2002",
          clientVersion: "5.22.0",
        },
      ),
    );
    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue(null);

    await expect(
      enqueueSyncOperation({
        context: {
          ...baseContext,
          businessId: BUSINESS_B,
        },
        clientOperationId: "client-duplicate",
        operationType: "ORDER_CREATE",
        payload: validPayloads.ORDER_CREATE,
      }),
    ).rejects.toThrow();
  });
});

describe("getSyncOperation", () => {
  it("enforces business and branch scope", async () => {
    const operation = {
      id: "sync-1",
      businessId: BUSINESS_A,
      branchId: BRANCH_A,
      actorUserId: USER_A,
      clientOperationId: "client-001",
      operationType: "ORDER_CREATE",
      status: "PENDING",
    };

    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue(operation);

    await expect(
      getSyncOperation("sync-1", {
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
      }),
    ).resolves.toEqual(operation);

    expect(prismaMock.offlineSyncOperation.findFirst).toHaveBeenCalledWith({
      where: {
        id: "sync-1",
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
      },
    });
  });

  it("does not expose an operation from another business", async () => {
    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue(null);

    await expect(
      getSyncOperation("sync-1", {
        businessId: BUSINESS_B,
        branchId: BRANCH_A,
      }),
    ).rejects.toThrow("Sync operation not found");
  });

  it("does not expose an operation from another branch", async () => {
    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue(null);

    await expect(
      getSyncOperation("sync-1", {
        businessId: BUSINESS_A,
        branchId: BRANCH_B,
      }),
    ).rejects.toThrow("Sync operation not found");
  });
});

describe("listSyncOperations", () => {
  it("lists only operations belonging to the authenticated business and branch", async () => {
    const operations = [
      {
        id: "sync-1",
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
        status: "PENDING",
      },
    ];

    prismaMock.offlineSyncOperation.findMany.mockResolvedValue(operations);
    prismaMock.offlineSyncOperation.count.mockResolvedValue(1);

    const result = await listSyncOperations({
      context: baseContext,
      page: 1,
      pageSize: 25,
    });

    expect(result).toEqual({
      data: operations,
      pagination: {
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      },
    });

    const expectedWhere = {
      businessId: BUSINESS_A,
      branchId: BRANCH_A,
    };

    expect(prismaMock.offlineSyncOperation.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      orderBy: {
        createdAt: "desc",
      },
      skip: 0,
      take: 25,
    });

    expect(prismaMock.offlineSyncOperation.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
  });

  it("supports status filtering and pagination", async () => {
    prismaMock.offlineSyncOperation.findMany.mockResolvedValue([]);
    prismaMock.offlineSyncOperation.count.mockResolvedValue(0);

    const result = await listSyncOperations({
      context: baseContext,
      status: "FAILED",
      page: 2,
      pageSize: 10,
    });

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });

    expect(prismaMock.offlineSyncOperation.findMany).toHaveBeenCalledWith({
      where: {
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
        status: "FAILED",
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: 10,
      take: 10,
    });
  });
});

describe("enqueueSyncOperation validation and safety", () => {
  it("rejects an invalid payload", async () => {
    await expect(
      enqueueSyncOperation({
        context: baseContext,
        clientOperationId: "client-invalid-payload",
        operationType: "ORDER_CREATE",
        payload: {},
      }),
    ).rejects.toMatchObject({
      message: "Invalid offline sync operation payload",
      statusCode: 422,
    });

    expect(prismaMock.offlineSyncOperation.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid UUID inside an order payload", async () => {
    await expect(
      enqueueSyncOperation({
        context: baseContext,
        clientOperationId: "client-invalid-uuid",
        operationType: "ORDER_CREATE",
        payload: {
          customerId: "not-a-uuid",
          items: [
            {
              serviceId: "550e8400-e29b-41d4-a716-446655440001",
              quantity: 1,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      message: "Invalid offline sync operation payload",
      statusCode: 422,
    });
  });

  it("rejects an unsupported operation type", async () => {
    await expect(
      enqueueSyncOperation({
        context: baseContext,
        clientOperationId: "client-unsupported",
        operationType: "PAYMENT_CREATE" as never,
        payload: {},
      }),
    ).rejects.toThrow();
    
    expect(prismaMock.offlineSyncOperation.create).not.toHaveBeenCalled();
  });

  it("rejects reuse of a client operation id with a different payload", async () => {
    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue({
      id: "sync-existing",
      businessId: BUSINESS_A,
      branchId: BRANCH_A,
      actorUserId: USER_A,
      clientOperationId: "client-reused",
      operationType: "ORDER_CREATE",
      payloadVersion: 1,
      payload: {
        customerId: "550e8400-e29b-41d4-a716-446655440000",
        items: [
          {
            serviceId: "550e8400-e29b-41d4-a716-446655440001",
            quantity: 1,
          },
        ],
      },
      status: "PENDING",
    });

    await expect(
      enqueueSyncOperation({
        context: baseContext,
        clientOperationId: "client-reused",
        operationType: "ORDER_CREATE",
        payload: {
          customerId: "550e8400-e29b-41d4-a716-446655440000",
          items: [
            {
              serviceId: "550e8400-e29b-41d4-a716-446655440001",
              quantity: 2,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      message:
        "Client operation ID is already used for a different sync operation",
      statusCode: 409,
    });

    expect(prismaMock.offlineSyncOperation.create).not.toHaveBeenCalled();
  });

  it("rejects reuse of a client operation id with a different operation type", async () => {
    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue({
      id: "sync-existing",
      businessId: BUSINESS_A,
      branchId: BRANCH_A,
      actorUserId: USER_A,
      clientOperationId: "client-reused-type",
      operationType: "CUSTOMER_CREATE",
      payloadVersion: 1,
      payload: {
        name: "Test Customer",
        phone: "08012345678",
      },
      status: "PENDING",
    });

    await expect(
      enqueueSyncOperation({
        context: baseContext,
        clientOperationId: "client-reused-type",
        operationType: "ORDER_CREATE",
        payload: validPayloads.ORDER_CREATE,
      }),
    ).rejects.toMatchObject({
      message:
        "Client operation ID is already used for a different sync operation",
      statusCode: 409,
    });

    expect(prismaMock.offlineSyncOperation.create).not.toHaveBeenCalled();
  });

  it("rejects a branch that does not belong to the authenticated business", async () => {
    prismaMock.branch.findFirst.mockResolvedValue(null);

    await expect(
      enqueueSyncOperation({
        context: {
          ...baseContext,
          branchId: BRANCH_B,
        },
        clientOperationId: "client-wrong-branch",
        operationType: "ORDER_CREATE",
        payload: validPayloads.ORDER_CREATE,
      }),
    ).rejects.toMatchObject({
      message: "Branch is not part of the business context",
      statusCode: 403,
    });

    expect(prismaMock.offlineSyncOperation.create).not.toHaveBeenCalled();
  });

  it("rejects an actor that does not belong to the authenticated business", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(
      enqueueSyncOperation({
        context: {
          ...baseContext,
          actorUserId: "foreign-user",
        },
        clientOperationId: "client-wrong-actor",
        operationType: "ORDER_CREATE",
        payload: validPayloads.ORDER_CREATE,
      }),
    ).rejects.toMatchObject({
      message: "Actor is not part of the business context",
      statusCode: 403,
    });

    expect(prismaMock.offlineSyncOperation.create).not.toHaveBeenCalled();
  });

  it("treats equivalent JSON with different object key order as the same operation", async () => {
    const payload = {
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      items: [
        {
          serviceId: "550e8400-e29b-41d4-a716-446655440001",
          quantity: 1,
        },
      ],
    };

    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue({
      id: "sync-equivalent",
      businessId: BUSINESS_A,
      branchId: BRANCH_A,
      actorUserId: USER_A,
      clientOperationId: "client-equivalent",
      operationType: "ORDER_CREATE",
      payloadVersion: 1,
      payload,
      status: "PENDING",
    });

    await expect(
      enqueueSyncOperation({
        context: baseContext,
        clientOperationId: "client-equivalent",
        operationType: "ORDER_CREATE",
        payload: {
          items: [
            {
              serviceId: "550e8400-e29b-41d4-a716-446655440001",
              quantity: 1,
            },
          ],
          customerId: "550e8400-e29b-41d4-a716-446655440000",
        },
      }),
    ).resolves.toMatchObject({
      id: "sync-equivalent",
    });

    expect(prismaMock.offlineSyncOperation.create).not.toHaveBeenCalled();
  });
});

describe("replaySyncOperation", () => {
  const customerCreateOperation = {
    id: "sync-replay-1",
    businessId: BUSINESS_A,
    branchId: BRANCH_A,
    actorUserId: USER_A,
    clientOperationId: "client-replay-001",
    operationType: "CUSTOMER_CREATE" as const,
    status: "PENDING" as const,
    payloadVersion: 1,
    payload: {
      name: "Replay Customer",
      phone: "08012345678",
    },
    attemptCount: 0,
    lastAttemptAt: null,
    processedAt: null,
    conflictReason: null,
    lastError: null,
    correlationId: "corr-replay-001",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("replays a customer create, marks it applied, and preserves the operation", async () => {
    const appliedOperation = {
      ...customerCreateOperation,
      status: "APPLIED" as const,
      attemptCount: 1,
      processedAt: new Date(),
      lastAttemptAt: new Date(),
    };

    prismaMock.offlineSyncOperation.findFirst
      .mockResolvedValueOnce({
        operationType: "CUSTOMER_CREATE",
        payload: customerCreateOperation.payload,
        status: "PENDING",
      })
      .mockResolvedValueOnce(customerCreateOperation);

    prismaMock.offlineSyncOperation.updateMany.mockResolvedValue({
      count: 1,
    });

    prismaMock.offlineSyncOperation.findUniqueOrThrow.mockResolvedValue(
      customerCreateOperation,
    );

    findPossibleDuplicatesMock.mockResolvedValue([]);
    createCustomerMock.mockResolvedValue({
      id: "customer-replay-1",
    } as Awaited<ReturnType<typeof createCustomer>>);

    prismaMock.offlineSyncOperation.update.mockResolvedValue(
      appliedOperation,
    );

    const result = await replaySyncOperation({
      id: customerCreateOperation.id,
      context: baseContext,
    });

    expect(hasPermission).toHaveBeenCalledWith(
      USER_A,
      BUSINESS_A,
      "BUSINESS_OWNER",
      "customers.create",
    );

    expect(findPossibleDuplicates).toHaveBeenCalledWith(
      BUSINESS_A,
      BRANCH_A,
      USER_A,
      "08012345678",
      undefined,
      prismaMock,
    );

    expect(createCustomer).toHaveBeenCalledWith(
      {
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
        name: "Replay Customer",
        phone: "08012345678",
      },
      prismaMock,
    );

    expect(prismaMock.offlineSyncOperation.update).toHaveBeenCalledWith({
      where: {
        id: customerCreateOperation.id,
      },
      data: {
        status: "APPLIED",
        processedAt: expect.any(Date),
        lastError: null,
        conflictReason: null,
      },
    });

    expect(result).toMatchObject({
      status: "APPLIED",
      operation: appliedOperation,
      result: {
        id: "customer-replay-1",
      },
    });
  });

  it("does not replay an operation outside the authenticated business and branch", async () => {
    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue(null);

    await expect(
      replaySyncOperation({
        id: "sync-foreign",
        context: {
          ...baseContext,
          businessId: BUSINESS_B,
        },
      }),
    ).rejects.toMatchObject({
      message: "Sync operation not found",
      statusCode: 404,
    });

    expect(prismaMock.offlineSyncOperation.updateMany).not.toHaveBeenCalled();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("re-checks the current permission before replaying", async () => {
    const { hasPermission: permissionMock } =
      await import("../../src/modules/permissions/permissions.service.js");

    vi.mocked(permissionMock).mockResolvedValueOnce(false);

    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue({
      operationType: "CUSTOMER_CREATE",
      payload: customerCreateOperation.payload,
      status: "PENDING",
    });

    await expect(
      replaySyncOperation({
        id: customerCreateOperation.id,
        context: baseContext,
      }),
    ).rejects.toMatchObject({
      message:
        "Insufficient permissions to replay this offline sync operation",
      statusCode: 403,
    });

    expect(prismaMock.offlineSyncOperation.updateMany).not.toHaveBeenCalled();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("returns the existing applied operation without replaying it again", async () => {
    const appliedOperation = {
      ...customerCreateOperation,
      status: "APPLIED" as const,
      attemptCount: 1,
    };

    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue({
      operationType: "CUSTOMER_CREATE",
      payload: customerCreateOperation.payload,
      status: "APPLIED",
    });

    prismaMock.offlineSyncOperation.findFirst.mockResolvedValueOnce({
      operationType: "CUSTOMER_CREATE",
      payload: customerCreateOperation.payload,
      status: "APPLIED",
    });

    prismaMock.offlineSyncOperation.findFirst.mockResolvedValueOnce(
      appliedOperation,
    );

    const result = await replaySyncOperation({
      id: customerCreateOperation.id,
      context: baseContext,
    });

    expect(result).toEqual({
      status: "APPLIED",
      operation: appliedOperation,
    });

    expect(prismaMock.offlineSyncOperation.updateMany).not.toHaveBeenCalled();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("marks a duplicate customer create as a conflict and preserves the historical operation", async () => {
    const conflictOperation = {
      ...customerCreateOperation,
      status: "CONFLICT" as const,
      attemptCount: 1,
      conflictReason: "A customer with this phone number already exists",
      lastError: null,
    };

    prismaMock.offlineSyncOperation.findFirst
      .mockResolvedValueOnce({
        operationType: "CUSTOMER_CREATE",
        payload: customerCreateOperation.payload,
        status: "PENDING",
      })
      .mockResolvedValueOnce(customerCreateOperation);

    prismaMock.offlineSyncOperation.updateMany.mockResolvedValue({
      count: 1,
    });

    prismaMock.offlineSyncOperation.findUniqueOrThrow.mockResolvedValue(
      customerCreateOperation,
    );

    findPossibleDuplicatesMock.mockResolvedValue([
      {
        id: "existing-customer",
        name: "Existing Customer",
        phone: "08012345678",
      },
    ]);

    prismaMock.offlineSyncOperation.update.mockResolvedValue(
      conflictOperation,
    );

    const result = await replaySyncOperation({
      id: customerCreateOperation.id,
      context: baseContext,
    });

    expect(result).toEqual({
      status: "CONFLICT",
      operation: conflictOperation,
    });

    expect(prismaMock.offlineSyncOperation.update).toHaveBeenCalledWith({
      where: {
        id: customerCreateOperation.id,
      },
      data: {
        status: "CONFLICT",
        conflictReason: "A customer with this phone number already exists",
        lastError: null,
      },
    });

    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("replays a customer update through the customer service", async () => {
    const operation = {
      ...customerCreateOperation,
      id: "sync-customer-update",
      clientOperationId: "client-customer-update",
      operationType: "CUSTOMER_UPDATE" as const,
      payload: {
        customerId: "550e8400-e29b-41d4-a716-446655440004",
        data: {
          name: "Updated Replay Customer",
        },
      },
    };

    const applied = {
      ...operation,
      status: "APPLIED" as const,
      attemptCount: 1,
    };

    prismaMock.offlineSyncOperation.findFirst
      .mockResolvedValueOnce({
        operationType: operation.operationType,
        payload: operation.payload,
        status: "PENDING",
      })
      .mockResolvedValueOnce(operation);

    prismaMock.offlineSyncOperation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.offlineSyncOperation.findUniqueOrThrow.mockResolvedValue(operation);
    updateCustomerMock.mockResolvedValue({} as Awaited<ReturnType<typeof updateCustomer>>);
    prismaMock.offlineSyncOperation.update.mockResolvedValue(applied);

    const result = await replaySyncOperation({
      id: operation.id,
      context: baseContext,
    });

    expect(hasPermission).toHaveBeenCalledWith(
      USER_A,
      BUSINESS_A,
      "BUSINESS_OWNER",
      "customers.update",
    );

    expect(updateCustomer).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440004",
      BUSINESS_A,
      BRANCH_A,
      USER_A,
      { name: "Updated Replay Customer" },
      prismaMock,
    );

    expect(result).toMatchObject({
      status: "APPLIED",
      operation: applied,
    });
  });

  it("replays an order create through the order service", async () => {
    const operation = {
      ...customerCreateOperation,
      id: "sync-order-create",
      clientOperationId: "client-order-create",
      operationType: "ORDER_CREATE" as const,
      payload: {
        customerId: "550e8400-e29b-41d4-a716-446655440000",
        items: [
          {
            serviceId: "550e8400-e29b-41d4-a716-446655440001",
            quantity: 2,
          },
        ],
        expectedReadyAt: "2026-09-10T12:00:00.000Z",
        garmentNote: "Handle carefully",
        internalNote: "Offline order",
      },
    };

    const applied = {
      ...operation,
      status: "APPLIED" as const,
      attemptCount: 1,
    };

    prismaMock.offlineSyncOperation.findFirst
      .mockResolvedValueOnce({
        operationType: operation.operationType,
        payload: operation.payload,
        status: "PENDING",
      })
      .mockResolvedValueOnce(operation);

    prismaMock.offlineSyncOperation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.offlineSyncOperation.findUniqueOrThrow.mockResolvedValue(operation);
    createOrderMock.mockResolvedValue({} as Awaited<ReturnType<typeof createOrder>>);
    prismaMock.offlineSyncOperation.update.mockResolvedValue(applied);

    const result = await replaySyncOperation({
      id: operation.id,
      context: baseContext,
    });

    expect(hasPermission).toHaveBeenCalledWith(
      USER_A,
      BUSINESS_A,
      "BUSINESS_OWNER",
      "orders.create",
    );

    expect(createOrder).toHaveBeenCalledWith(
      {
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
        actorUserId: USER_A,
        customerId: "550e8400-e29b-41d4-a716-446655440000",
        items: [
          {
            serviceId: "550e8400-e29b-41d4-a716-446655440001",
            quantity: 2,
          },
        ],
        expectedReadyAt: new Date("2026-09-10T12:00:00.000Z"),
        garmentNote: "Handle carefully",
        internalNote: "Offline order",
      },
      prismaMock,
    );

    expect(result).toMatchObject({
      status: "APPLIED",
      operation: applied,
    });
  });

  it("replays an order customer transfer through the order service", async () => {
    const operation = {
      ...customerCreateOperation,
      id: "sync-order-transfer",
      clientOperationId: "client-order-transfer",
      operationType: "ORDER_UPDATE" as const,
      payload: {
        action: "TRANSFER_CUSTOMER" as const,
        orderId: "550e8400-e29b-41d4-a716-446655440002",
        customerId: "550e8400-e29b-41d4-a716-446655440003",
      },
    };

    const applied = {
      ...operation,
      status: "APPLIED" as const,
      attemptCount: 1,
    };

    prismaMock.offlineSyncOperation.findFirst
      .mockResolvedValueOnce({
        operationType: operation.operationType,
        payload: operation.payload,
        status: "PENDING",
      })
      .mockResolvedValueOnce(operation);

    prismaMock.offlineSyncOperation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.offlineSyncOperation.findUniqueOrThrow.mockResolvedValue(operation);
    transferOrderMock.mockResolvedValue({} as Awaited<ReturnType<typeof transferOrder>>);
    prismaMock.offlineSyncOperation.update.mockResolvedValue(applied);

    const result = await replaySyncOperation({
      id: operation.id,
      context: baseContext,
    });

    expect(hasPermission).toHaveBeenCalledWith(
      USER_A,
      BUSINESS_A,
      "BUSINESS_OWNER",
      "orders.update",
    );

    expect(transferOrder).toHaveBeenCalledWith(
      operation.payload.orderId,
      BUSINESS_A,
      BRANCH_A,
      operation.payload.customerId,
      USER_A,
      prismaMock,
    );

    expect(result).toMatchObject({
      status: "APPLIED",
      operation: applied,
    });
  });

  it("replays an order status update through the order service", async () => {
    const operation = {
      ...customerCreateOperation,
      id: "sync-order-status",
      clientOperationId: "client-order-status",
      operationType: "ORDER_UPDATE" as const,
      payload: {
        action: "UPDATE_STATUS" as const,
        orderId: "550e8400-e29b-41d4-a716-446655440002",
        status: "COMPLETED" as const,
      },
    };

    const applied = {
      ...operation,
      status: "APPLIED" as const,
      attemptCount: 1,
    };

    prismaMock.offlineSyncOperation.findFirst
      .mockResolvedValueOnce({
        operationType: operation.operationType,
        payload: operation.payload,
        status: "PENDING",
      })
      .mockResolvedValueOnce(operation);

    prismaMock.offlineSyncOperation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.offlineSyncOperation.findUniqueOrThrow.mockResolvedValue(operation);
    updateOrderStatusMock.mockResolvedValue({} as Awaited<ReturnType<typeof updateOrderStatus>>);
    prismaMock.offlineSyncOperation.update.mockResolvedValue(applied);

    const result = await replaySyncOperation({
      id: operation.id,
      context: baseContext,
    });

    expect(hasPermission).toHaveBeenCalledWith(
      USER_A,
      BUSINESS_A,
      "BUSINESS_OWNER",
      "orders.change_status",
    );

    expect(updateOrderStatus).toHaveBeenCalledWith(
      operation.payload.orderId,
      BUSINESS_A,
      BRANCH_A,
      "COMPLETED",
      prismaMock,
    );

    expect(result).toMatchObject({
      status: "APPLIED",
      operation: applied,
    });
  });

  it("rejects a missing domain record without marking it as a conflict", async () => {
    const operation = {
      ...customerCreateOperation,
      id: "sync-missing-customer",
      clientOperationId: "client-missing-customer",
      operationType: "CUSTOMER_UPDATE" as const,
      payload: {
        customerId: "550e8400-e29b-41d4-a716-446655440004",
        data: {
          name: "Missing Customer",
        },
      },
    };

    const rejected = {
      ...operation,
      status: "REJECTED" as const,
      attemptCount: 1,
      lastError: "Customer not found",
    };

    prismaMock.offlineSyncOperation.findFirst
      .mockResolvedValueOnce({
        operationType: operation.operationType,
        payload: operation.payload,
        status: "PENDING",
      })
      .mockResolvedValueOnce(operation);

    prismaMock.offlineSyncOperation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.offlineSyncOperation.findUniqueOrThrow.mockResolvedValue(operation);

    updateCustomerMock.mockRejectedValue(
      new AppError("Customer not found", 404),
    );

    prismaMock.offlineSyncOperation.update.mockResolvedValue(rejected);

    const result = await replaySyncOperation({
      id: operation.id,
      context: baseContext,
    });

    expect(result).toMatchObject({
      status: "REJECTED",
      operation: rejected,
    });
  });

  it("rejects replay of an already conflicted operation", async () => {
    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue({
      operationType: "CUSTOMER_CREATE",
      payload: customerCreateOperation.payload,
      status: "CONFLICT",
    });

    await expect(
      replaySyncOperation({
        id: customerCreateOperation.id,
        context: baseContext,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(prismaMock.offlineSyncOperation.updateMany).not.toHaveBeenCalled();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("blocks a non-stale processing operation from being replayed concurrently", async () => {
    const processingOperation = {
      ...customerCreateOperation,
      status: "PROCESSING" as const,
      attemptCount: 1,
      lastAttemptAt: new Date(),
    };

    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue(
      processingOperation,
    );

    await expect(
      replaySyncOperation({
        id: processingOperation.id,
        context: baseContext,
      }),
    ).rejects.toMatchObject({
      message: "Sync operation is already being processed",
      statusCode: 409,
    });

    expect(prismaMock.offlineSyncOperation.updateMany).not.toHaveBeenCalled();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("reclaims a stale processing operation and replays it", async () => {
    const staleDate = new Date(Date.now() - 10 * 60 * 1000);

    const processingOperation = {
      ...customerCreateOperation,
      status: "PROCESSING" as const,
      attemptCount: 1,
      lastAttemptAt: staleDate,
    };

    const reclaimedOperation = {
      ...processingOperation,
      status: "PROCESSING" as const,
      attemptCount: 2,
      lastAttemptAt: new Date(),
    };

    const appliedOperation = {
      ...reclaimedOperation,
      status: "APPLIED" as const,
      processedAt: new Date(),
    };

    prismaMock.offlineSyncOperation.findFirst
      .mockResolvedValueOnce({
        operationType: "CUSTOMER_CREATE",
        payload: customerCreateOperation.payload,
        status: "PROCESSING",
      })
      .mockResolvedValueOnce(processingOperation);

    prismaMock.offlineSyncOperation.updateMany.mockResolvedValue({
      count: 1,
    });

    prismaMock.offlineSyncOperation.findUniqueOrThrow.mockResolvedValue(
      reclaimedOperation,
    );

    findPossibleDuplicatesMock.mockResolvedValue([]);
    createCustomerMock.mockResolvedValue({} as Awaited<ReturnType<typeof createCustomer>>);

    prismaMock.offlineSyncOperation.update.mockResolvedValue(
      appliedOperation,
    );

    const result = await replaySyncOperation({
      id: processingOperation.id,
      context: baseContext,
    });

    expect(prismaMock.offlineSyncOperation.updateMany).toHaveBeenCalledWith({
      where: {
        id: processingOperation.id,
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
        status: "PROCESSING",
        lastAttemptAt: staleDate,
      },
      data: {
        status: "PROCESSING",
        attemptCount: {
          increment: 1,
        },
        lastAttemptAt: expect.any(Date),
        lastError: null,
        conflictReason: null,
      },
    });

    expect(createCustomer).toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "APPLIED",
      operation: appliedOperation,
    });
  });

  it.each([
    "REJECTED",
    "CONFLICT",
  ] as const)("does not replay an operation already in terminal state %s", async (status) => {
    const operation = {
      ...customerCreateOperation,
      status,
    };

    prismaMock.offlineSyncOperation.findFirst.mockResolvedValue({
      operationType: operation.operationType,
      payload: operation.payload,
      status,
    });

    await expect(
      replaySyncOperation({
        id: operation.id,
        context: baseContext,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(prismaMock.offlineSyncOperation.updateMany).not.toHaveBeenCalled();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("retries a FAILED operation and can apply it successfully", async () => {
    const failedOperation = {
      ...customerCreateOperation,
      id: "sync-retry",
      clientOperationId: "client-retry",
      status: "FAILED" as const,
      attemptCount: 1,
      lastAttemptAt: new Date(Date.now() - 10 * 60 * 1000),
      lastError: "Temporary database failure",
    };

    const claimedOperation = {
      ...failedOperation,
      status: "PROCESSING" as const,
      attemptCount: 2,
      lastAttemptAt: new Date(),
      lastError: null,
      conflictReason: null,
    };

    const appliedOperation = {
      ...claimedOperation,
      status: "APPLIED" as const,
      processedAt: new Date(),
    };

    prismaMock.offlineSyncOperation.findFirst
      .mockResolvedValueOnce({
        operationType: failedOperation.operationType,
        payload: failedOperation.payload,
        status: "FAILED",
      })
      .mockResolvedValueOnce(failedOperation);

    prismaMock.offlineSyncOperation.updateMany.mockResolvedValue({
      count: 1,
    });

    prismaMock.offlineSyncOperation.findUniqueOrThrow.mockResolvedValue(
      claimedOperation,
    );

    findPossibleDuplicatesMock.mockResolvedValue([]);

    createCustomerMock.mockResolvedValue({} as Awaited<ReturnType<typeof createCustomer>>);

    prismaMock.offlineSyncOperation.update.mockResolvedValue(
      appliedOperation,
    );

    const result = await replaySyncOperation({
      id: failedOperation.id,
      context: baseContext,
    });

    expect(prismaMock.offlineSyncOperation.updateMany).toHaveBeenCalledWith({
      where: {
        id: failedOperation.id,
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
        status: "FAILED",
      },
      data: {
        status: "PROCESSING",
        attemptCount: {
          increment: 1,
        },
        lastAttemptAt: expect.any(Date),
        lastError: null,
        conflictReason: null,
      },
    });

    expect(createCustomer).toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "APPLIED",
      operation: appliedOperation,
    });
  });

  it("marks an unrelated 409 AppError as FAILED rather than CONFLICT", async () => {
    const operation = {
      ...customerCreateOperation,
      id: "sync-replay-unrelated-409",
      clientOperationId: "client-replay-unrelated-409",
    };

    prismaMock.offlineSyncOperation.findFirst
      .mockResolvedValueOnce({
        operationType: "CUSTOMER_CREATE",
        payload: operation.payload,
        status: "PENDING",
      })
      .mockResolvedValueOnce(operation);

    prismaMock.offlineSyncOperation.updateMany.mockResolvedValue({
      count: 1,
    });

    prismaMock.offlineSyncOperation.findUniqueOrThrow.mockResolvedValue(
      operation,
    );

    findPossibleDuplicatesMock.mockResolvedValue([]);
    createCustomerMock.mockRejectedValue(
      new AppError("Another business conflict", 409),
    );

    const failedOperation = {
      ...operation,
      status: "FAILED" as const,
      attemptCount: 1,
      lastError: "Another business conflict",
    };

    prismaMock.offlineSyncOperation.update.mockResolvedValue(
      failedOperation,
    );

    const result = await replaySyncOperation({
      id: operation.id,
      context: baseContext,
    });

    expect(result).toMatchObject({
      status: "FAILED",
      operation: failedOperation,
    });

    expect(result).not.toMatchObject({
      status: "CONFLICT",
    });

    expect(prismaMock.offlineSyncOperation.update).toHaveBeenCalledWith({
      where: {
        id: operation.id,
      },
      data: {
        status: "FAILED",
        lastError: "Another business conflict",
      },
    });
  });

  it("records an unexpected replay failure as FAILED", async () => {
    const operation = {
      ...customerCreateOperation,
      id: "sync-failed",
      clientOperationId: "client-failed",
    };

    const failedOperation = {
      ...operation,
      status: "FAILED" as const,
      attemptCount: 1,
      lastError: "Database temporarily unavailable",
    };

    prismaMock.offlineSyncOperation.findFirst
      .mockResolvedValueOnce({
        operationType: operation.operationType,
        payload: operation.payload,
        status: "PENDING",
      })
      .mockResolvedValueOnce(operation);

    prismaMock.offlineSyncOperation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.offlineSyncOperation.findUniqueOrThrow.mockResolvedValue(operation);

    findPossibleDuplicatesMock.mockResolvedValue([]);

    createCustomerMock.mockRejectedValue(
      new Error("Database temporarily unavailable"),
    );

    prismaMock.offlineSyncOperation.update.mockResolvedValue(failedOperation);

    const result = await replaySyncOperation({
      id: operation.id,
      context: baseContext,
    });

    expect(result).toMatchObject({
      status: "FAILED",
      operation: failedOperation,
    });

    expect(prismaMock.offlineSyncOperation.update).toHaveBeenCalledWith({
      where: {
        id: operation.id,
      },
      data: {
        status: "FAILED",
        lastError: "Database temporarily unavailable",
      },
    });
  });

});

describe("offline sync permission enforcement", () => {
  it.each([
    ["ORDER_CREATE", "orders.create"],
    ["CUSTOMER_CREATE", "customers.create"],
  ] as const)(
    "requires %s permission for %s",
    async (operationType, permission) => {
      const { hasPermission } = await import(
        "../../src/modules/permissions/permissions.service.js"
      );

      vi.mocked(hasPermission).mockResolvedValueOnce(false);

      await expect(
        enqueueSyncOperation({
          context: baseContext,
          clientOperationId: `client-denied-${operationType}`,
          operationType,
          payload: validPayloads[operationType],
        }),
      ).rejects.toMatchObject({
        message: "Insufficient permissions for this offline sync operation",
        statusCode: 403,
      });

      expect(hasPermission).toHaveBeenCalledWith(
        USER_A,
        BUSINESS_A,
        "BUSINESS_OWNER",
        permission,
      );
      expect(prismaMock.offlineSyncOperation.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["TRANSFER_CUSTOMER", "orders.update"],
    ["UPDATE_STATUS", "orders.change_status"],
  ] as const)(
    "requires %s permission for ORDER_UPDATE",
    async (action, permission) => {
      const { hasPermission } = await import(
        "../../src/modules/permissions/permissions.service.js"
      );

      vi.mocked(hasPermission).mockResolvedValueOnce(false);

      const payload =
        action === "TRANSFER_CUSTOMER"
          ? {
              action,
              orderId: "550e8400-e29b-41d4-a716-446655440000",
              customerId: "550e8400-e29b-41d4-a716-446655440002",
            }
          : {
              action,
              orderId: "550e8400-e29b-41d4-a716-446655440000",
              status: "COMPLETED" as const,
            };

      await expect(
        enqueueSyncOperation({
          context: baseContext,
          clientOperationId: `client-denied-${action}`,
          operationType: "ORDER_UPDATE",
          payload,
        }),
      ).rejects.toMatchObject({
        message: "Insufficient permissions for this offline sync operation",
        statusCode: 403,
      });

      expect(hasPermission).toHaveBeenCalledWith(
        USER_A,
        BUSINESS_A,
        "BUSINESS_OWNER",
        permission,
      );
      expect(prismaMock.offlineSyncOperation.create).not.toHaveBeenCalled();
    },
  );

  it("requires customers.update for CUSTOMER_UPDATE", async () => {
    const { hasPermission } = await import(
      "../../src/modules/permissions/permissions.service.js"
    );

    vi.mocked(hasPermission).mockResolvedValueOnce(false);

    await expect(
      enqueueSyncOperation({
        context: baseContext,
        clientOperationId: "client-denied-CUSTOMER_UPDATE",
        operationType: "CUSTOMER_UPDATE",
        payload: validPayloads.CUSTOMER_UPDATE,
      }),
    ).rejects.toMatchObject({
      message: "Insufficient permissions for this offline sync operation",
      statusCode: 403,
    });

    expect(hasPermission).toHaveBeenCalledWith(
      USER_A,
      BUSINESS_A,
      "BUSINESS_OWNER",
      "customers.update",
    );
    expect(prismaMock.offlineSyncOperation.create).not.toHaveBeenCalled();
  });
});
