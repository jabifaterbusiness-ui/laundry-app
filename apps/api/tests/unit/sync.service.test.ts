import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    offlineSyncOperation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
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

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  enqueueSyncOperation,
  getSyncOperation,
  listSyncOperations,
} from "../../src/modules/sync/sync.service.js";

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
