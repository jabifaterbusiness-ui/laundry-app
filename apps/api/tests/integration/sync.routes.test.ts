import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    offlineSyncOperation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    user: {
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

vi.mock("../../src/modules/permissions/permissions.service.js", () => ({
  hasPermission: vi.fn().mockResolvedValue(true),
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import { hasPermission } from "../../src/modules/permissions/permissions.service.js";
import { createApp } from "../../src/app.js";

const offlineSyncFindFirst = vi.mocked(prisma.offlineSyncOperation.findFirst);
const offlineSyncFindMany = vi.mocked(prisma.offlineSyncOperation.findMany);
const offlineSyncCount = vi.mocked(prisma.offlineSyncOperation.count);
const offlineSyncCreate = vi.mocked(prisma.offlineSyncOperation.create);
const branchFindFirst = vi.mocked(prisma.branch.findFirst);
const userFindFirst = vi.mocked(prisma.user.findFirst);

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
const BRANCH_B = "44444444-4444-4444-4444-444444444444";

const OPERATION_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OPERATION_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const CUSTOMER_A = "55555555-5555-5555-5555-555555555555";
const ORDER_A = "66666666-6666-6666-6666-666666666666";
const SERVICE_A = "77777777-7777-7777-7777-777777777777";

const app = createApp();

function allowBranch(
  userId: string,
  branchId: string,
  businessId: string,
) {
  branchFindFirst.mockResolvedValue({
    id: branchId,
    businessId,
  } as never);

  vi.mocked(prisma.userBranch.findUnique).mockResolvedValue({
    userId,
    branchId,
    branch: {
      id: branchId,
      businessId,
      name: "Main Branch",
    },
  } as never);
}

function mockContext(
  userId: string,
  branchId: string,
  businessId: string,
) {
  allowBranch(userId, branchId, businessId);

  userFindFirst.mockResolvedValue({
    id: userId,
    businessId,
  } as never);
}

function mockTransaction() {
  vi.mocked(prisma.$transaction).mockImplementation(
    async (callback) => callback(prisma as never),
  );
}

const customerCreatePayload = {
  name: "John Doe",
  phone: "08012345678",
};

const orderCreatePayload = {
  customerId: CUSTOMER_A,
  items: [
    {
      serviceId: SERVICE_A,
      quantity: 1,
    },
  ],
};

const operationFixture = {
  id: OPERATION_A,
  businessId: "biz-A",
  branchId: BRANCH_A,
  actorUserId: "user-1",
  clientOperationId: "client-op-001",
  operationType: "CUSTOMER_CREATE",
  status: "PENDING",
  payloadVersion: 1,
  payload: customerCreatePayload,
  attemptCount: 0,
  lastAttemptAt: null,
  processedAt: null,
  conflictReason: null,
  lastError: null,
  correlationId: "corr-001",
  createdAt: new Date("2026-09-07T10:00:00.000Z"),
  updatedAt: new Date("2026-09-07T10:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction();

  vi.mocked(prisma.userBranch.findUnique).mockResolvedValue({
    userId: "user-1",
    branchId: BRANCH_A,
    branch: {
      id: BRANCH_A,
      businessId: "biz-A",
      name: "Main Branch",
    },
  } as never);

  branchFindFirst.mockResolvedValue({
    id: BRANCH_A,
    businessId: "biz-A",
  } as never);

  userFindFirst.mockResolvedValue({
    id: "user-1",
    businessId: "biz-A",
  } as never);

  vi.mocked(hasPermission).mockResolvedValue(true);
});

describe("Sync routes - authentication", () => {
  it("rejects an unauthenticated enqueue request", async () => {
    const res = await request(app)
      .post("/api/v1/sync")
      .set("X-Branch-Id", BRANCH_A)
      .send({
        clientOperationId: "client-auth-001",
        operationType: "CUSTOMER_CREATE",
        payload: customerCreatePayload,
      });

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .get("/api/v1/sync")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });
});

describe("Sync routes - branch context", () => {
  it("rejects a request without X-Branch-Id", async () => {
    const res = await request(app)
      .get("/api/v1/sync")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
  });

  it("rejects a branch the authenticated user is not a member of", async () => {
    vi.mocked(prisma.userBranch.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/sync")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });

  it("rejects a branch belonging to another business", async () => {
    vi.mocked(prisma.userBranch.findUnique).mockResolvedValue({
      userId: "user-1",
      branchId: BRANCH_B,
      branch: {
        id: BRANCH_B,
        businessId: "biz-B",
        name: "Other Business Branch",
      },
    } as never);

    const res = await request(app)
      .get("/api/v1/sync")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
  });
});

describe("Sync routes - enqueue", () => {
  it("enqueues a valid CUSTOMER_CREATE operation", async () => {
    mockContext("user-1", BRANCH_A, "biz-A");

    offlineSyncFindFirst.mockResolvedValue(null);
    offlineSyncCreate.mockResolvedValue(operationFixture as never);

    const res = await request(app)
      .post("/api/v1/sync")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        clientOperationId: "client-op-001",
        operationType: "CUSTOMER_CREATE",
        payload: customerCreatePayload,
        correlationId: "corr-001",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(OPERATION_A);
    expect(res.body.status).toBe("PENDING");

    expect(offlineSyncCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          actorUserId: "user-1",
          clientOperationId: "client-op-001",
          operationType: "CUSTOMER_CREATE",
          status: "PENDING",
        }),
      }),
    );

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sync.operation_queued",
        entityType: "OfflineSyncOperation",
        entityId: OPERATION_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-1",
      }),
    );
  });

  it("rejects an invalid payload", async () => {
    mockContext("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/sync")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        clientOperationId: "client-invalid-001",
        operationType: "CUSTOMER_CREATE",
        payload: {
          name: "",
          phone: "123",
        },
      });

    expect(res.status).toBe(422);
    expect(offlineSyncCreate).not.toHaveBeenCalled();
  });

  it("rejects an unauthorized offline operation", async () => {
    mockContext("user-staff-a", BRANCH_A, "biz-A");
    vi.mocked(hasPermission).mockResolvedValue(false);

    const res = await request(app)
      .post("/api/v1/sync")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        clientOperationId: "client-denied-001",
        operationType: "ORDER_CREATE",
        payload: orderCreatePayload,
      });

    expect(res.status).toBe(403);
    expect(offlineSyncCreate).not.toHaveBeenCalled();
  });

  it("returns the existing operation for an idempotent duplicate", async () => {
    mockContext("user-1", BRANCH_A, "biz-A");

    offlineSyncFindFirst.mockResolvedValue(operationFixture as never);

    const res = await request(app)
      .post("/api/v1/sync")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        clientOperationId: "client-op-001",
        operationType: "CUSTOMER_CREATE",
        payload: {
          phone: "08012345678",
          name: "John Doe",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(OPERATION_A);
    expect(offlineSyncCreate).not.toHaveBeenCalled();
  });
});

describe("Sync routes - list", () => {
  it("lists only operations for the authenticated branch", async () => {
    mockContext("user-1", BRANCH_A, "biz-A");

    offlineSyncFindMany.mockResolvedValue([operationFixture] as never);
    offlineSyncCount.mockResolvedValue(1);

    const res = await request(app)
      .get("/api/v1/sync")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .query({
        page: 1,
        pageSize: 25,
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);

    expect(offlineSyncFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
        }),
      }),
    );
  });

  it("supports status filtering", async () => {
    mockContext("user-1", BRANCH_A, "biz-A");

    offlineSyncFindMany.mockResolvedValue([] as never);
    offlineSyncCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/sync")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .query({
        status: "CONFLICT",
        page: 1,
        pageSize: 10,
      });

    expect(res.status).toBe(200);

    expect(offlineSyncFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
          status: "CONFLICT",
        },
      }),
    );
  });
});

describe("Sync routes - get one", () => {
  it("returns an operation in the authenticated business and branch", async () => {
    mockContext("user-1", BRANCH_A, "biz-A");

    offlineSyncFindFirst.mockResolvedValue(operationFixture as never);

    const res = await request(app)
      .get(`/api/v1/sync/${OPERATION_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(OPERATION_A);
  });

  it("does not expose an operation from another business or branch", async () => {
    mockContext("user-1", BRANCH_A, "biz-A");

    offlineSyncFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/sync/${OPERATION_B}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(404);

    expect(offlineSyncFindFirst).toHaveBeenCalledWith({
      where: {
        id: OPERATION_B,
        businessId: "biz-A",
        branchId: BRANCH_A,
      },
    });
  });
});
