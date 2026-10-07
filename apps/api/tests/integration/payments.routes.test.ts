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
        automatedNotificationsEnabled: true,
        offlineSyncEnabled: true,
        version: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      update: vi.fn(),
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
    payment: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    invoice: {
      findFirst: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userBranch: {
      findUnique: vi.fn(),
    },
    sensitiveAuthorization: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
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
import { recordAuditEvent } from "../../src/lib/audit.js";
import { createApp } from "../../src/app.js";

const paymentFindMany = vi.mocked(prisma.payment.findMany);
const paymentCount = vi.mocked(prisma.payment.count);
const paymentFindFirst = vi.mocked(prisma.payment.findFirst);
const paymentCreate = vi.mocked(prisma.payment.create);
const invoiceFindFirst = vi.mocked(prisma.invoice.findFirst);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
const sensitiveAuthorizationFindUnique = vi.mocked(
  prisma.sensitiveAuthorization.findUnique,
);
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
const INVOICE_A = "88888888-8888-8888-8888-888888888888";
const PAYMENT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

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

function mockTransaction() {
  vi.mocked(prisma.$transaction).mockImplementation(
    async (callback) => callback(prisma as never),
  );
}

function allowSensitiveAuthorization(
  userId: string,
  businessId: string,
) {
  sensitiveAuthorizationFindUnique.mockResolvedValue({
    id: "sensitive-auth-1",
    tokenHash: "test-token-hash",
    userId,
    businessId,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    createdAt: new Date(),
  } as never);
}

const paymentFixture = {
  id: PAYMENT_A,
  businessId: "biz-A",
  branchId: BRANCH_A,
  invoiceId: INVOICE_A,
  amount: 4000,
  method: "TRANSFER",
  reference: "TRX-123",
  note: "Customer transfer",
  status: "POSTED",
  createdAt: new Date("2026-08-29T20:00:00.000Z"),
  invoice: {
    id: INVOICE_A,
    invoiceNumber: "00042",
    orderId: "77777777-7777-7777-7777-777777777777",
    totalAmount: 10000,
    status: "ISSUED",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction();

    (findPermission as any).mockImplementation(async ({ where }: any) => ({
      id: `permission-${where.code}`,
    }));

  findRoleOverride.mockResolvedValue(null);
  findUserOverride.mockResolvedValue(null);
  allowSensitiveAuthorization("user-1", "biz-A");
});

describe("Payments routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/payments");

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .get("/api/v1/payments")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });
});

describe("Payments routes - branch context", () => {
  it("rejects a request without X-Branch-Id", async () => {
    const res = await request(app)
      .get("/api/v1/payments")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
  });

  it("rejects a branch the authenticated user is not a member of", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/payments")
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
      .get("/api/v1/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
  });
});

describe("Payments routes - sensitive authorization", () => {
  it("requires sensitive authorization before creating a payment", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    sensitiveAuthorizationFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        invoiceId: INVOICE_A,
        amount: 4000,
        method: "CASH",
      });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain(
      "Sensitive authorization is required",
    );
    expect(invoiceFindFirst).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("requires sensitive authorization before voiding a payment", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    sensitiveAuthorizationFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/payments/${PAYMENT_A}/void`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        reason: "Payment was posted in error",
      });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain(
      "Sensitive authorization is required",
    );
    expect(paymentFindFirst).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("Payments routes - authorization", () => {
  it("STAFF can create a payment", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");
    allowSensitiveAuthorization("user-staff-a", "biz-A");
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    invoiceFindFirst.mockResolvedValue({
      id: INVOICE_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      totalAmount: 10000,
      status: "ISSUED",
      payments: [{ amount: 3000 }],
    } as never);

    paymentCreate.mockResolvedValue(paymentFixture as never);

    const res = await request(app)
      .post("/api/v1/payments")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        invoiceId: INVOICE_A,
        amount: 4000,
        method: "TRANSFER",
        reference: "TRX-123",
        note: "Customer transfer",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(PAYMENT_A);

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payment.created",
        entityType: "Payment",
        entityId: PAYMENT_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-staff-a",
      }),
    );
  });

  it("BRANCH_MANAGER can create a payment", async () => {
    allowBranch("user-mgr-a", BRANCH_A, "biz-A");
    allowSensitiveAuthorization("user-mgr-a", "biz-A");
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    invoiceFindFirst.mockResolvedValue({
      id: INVOICE_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      totalAmount: 10000,
      status: "ISSUED",
      payments: [],
    } as never);

    paymentCreate.mockResolvedValue(paymentFixture as never);

    const res = await request(app)
      .post("/api/v1/payments")
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        invoiceId: INVOICE_A,
        amount: 4000,
        method: "CASH",
      });

    expect(res.status).toBe(201);
  });

  it("BUSINESS_OWNER can create a payment", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    invoiceFindFirst.mockResolvedValue({
      id: INVOICE_A,
      businessId: "biz-A",
      branchId: BRANCH_A,
      totalAmount: 10000,
      status: "ISSUED",
      payments: [],
    } as never);

    paymentCreate.mockResolvedValue(paymentFixture as never);

    const res = await request(app)
      .post("/api/v1/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        invoiceId: INVOICE_A,
        amount: 4000,
        method: "POS",
      });

    expect(res.status).toBe(201);
  });

  it("allows PLATFORM_ADMIN to access payments through permissions", async () => {
    const token = tokenFor("PLATFORM_ADMIN", "biz-A", "user-platform");

    const res = await request(app)
      .get("/api/v1/payments")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
  });
});

describe("Payments routes - permission enforcement", () => {
  it("denies payment creation when payments.manage is explicitly denied", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    findUserOverride.mockResolvedValue({
      allowed: false,
    } as never);

    const res = await request(app)
      .post("/api/v1/payments")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        invoiceId: INVOICE_A,
        amount: 4000,
        method: "CASH",
      });

    expect(res.status).toBe(403);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("denies payment listing when payments.view is explicitly denied", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    findUserOverride.mockResolvedValue({
      allowed: false,
    } as never);

    const res = await request(app)
      .get("/api/v1/payments")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
    expect(paymentFindMany).not.toHaveBeenCalled();
  });

  it("denies payment void when payments.manage is explicitly denied", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    findUserOverride.mockResolvedValue({
      allowed: false,
    } as never);

    const res = await request(app)
      .patch(`/api/v1/payments/${PAYMENT_A}/void`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
    expect(paymentFindFirst).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("Payments routes - creation validation", () => {
  it("rejects a missing invoiceId", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        amount: 5000,
        method: "CASH",
      });

    expect(res.status).toBe(422);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });

  it("rejects an invalid invoiceId", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        invoiceId: "not-a-uuid",
        amount: 5000,
        method: "CASH",
      });

    expect(res.status).toBe(422);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a zero payment amount", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        invoiceId: INVOICE_A,
        amount: 0,
        method: "CASH",
      });

    expect(res.status).toBe(422);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });

  it("rejects an unsupported payment method", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        invoiceId: INVOICE_A,
        amount: 5000,
        method: "CHEQUE",
      });

    expect(res.status).toBe(422);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });

  it("rejects unknown fields in the payment body", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        invoiceId: INVOICE_A,
        amount: 5000,
        method: "CASH",
        businessId: "biz-B",
      });

    expect(res.status).toBe(422);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });
});

describe("Payments routes - tenant and branch isolation", () => {
  it("business A lists only payments for its selected branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    paymentFindMany.mockResolvedValue([]);
    paymentCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
        }),
      }),
    );
  });

  it("business B cannot retrieve a payment from business A", async () => {
    allowBranch("user-owner-b", BRANCH_B, "biz-B");

    paymentFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payments/${PAYMENT_A}`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(404);

    expect(paymentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: PAYMENT_A,
          businessId: "biz-B",
          branchId: BRANCH_B,
        },
      }),
    );
  });

  it("a payment from another branch is not returned", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    paymentFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payments/${PAYMENT_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(404);

    expect(paymentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: PAYMENT_A,
          businessId: "biz-A",
          branchId: BRANCH_A,
        },
      }),
    );
  });
});

describe("Payments routes - list and filters", () => {
  it("lists payments successfully", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    paymentFindMany.mockResolvedValue([paymentFixture] as never);
    paymentCount.mockResolvedValue(1);

    const res = await request(app)
      .get("/api/v1/payments")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it("filters payments by invoice and status", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    paymentFindMany.mockResolvedValue([]);
    paymentCount.mockResolvedValue(0);

    const res = await request(app)
      .get(
        `/api/v1/payments?invoiceId=${INVOICE_A}&status=POSTED&page=2&pageSize=10`,
      )
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
          invoiceId: INVOICE_A,
          status: "POSTED",
        },
        skip: 10,
        take: 10,
      }),
    );
  });
});

describe("Invoice payment summary route", () => {
  it("returns the payment summary for an invoice", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    invoiceFindFirst.mockResolvedValue({
      id: INVOICE_A,
      invoiceNumber: "00042",
      totalAmount: 10000,
      businessId: "biz-A",
      branchId: BRANCH_A,
      payments: [
        {
          id: PAYMENT_A,
          amount: 3000,
          method: "CASH",
          status: "POSTED",
        },
        {
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          amount: 2000,
          method: "TRANSFER",
          status: "VOID",
        },
      ],
    } as never);

    const res = await request(app)
      .get(`/api/v1/payments/invoice/${INVOICE_A}/summary`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.invoiceId).toBe(INVOICE_A);
    expect(res.body.invoiceNumber).toBe("00042");
    expect(res.body.totalAmount).toBe(10000);
    expect(res.body.amountPaid).toBe(3000);
    expect(res.body.balance).toBe(7000);
    expect(res.body.paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("does not expose an invoice from another business", async () => {
    allowBranch("user-owner-b", BRANCH_B, "biz-B");

    invoiceFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payments/invoice/${INVOICE_A}/summary`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(404);

    expect(invoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: INVOICE_A,
          businessId: "biz-B",
          branchId: BRANCH_B,
        },
      }),
    );
  });
});

describe("Payment void route", () => {
  it("BUSINESS_OWNER can void a posted payment and records an audit event", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    paymentFindFirst.mockResolvedValue(paymentFixture as never);

    const voidedPayment = {
      ...paymentFixture,
      status: "VOID",
    };

    vi.mocked(prisma.payment.update).mockResolvedValue(voidedPayment as never);

    const res = await request(app)
      .patch(`/api/v1/payments/${PAYMENT_A}/void`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        reason: "Payment was posted in error and needs to be voided",
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(PAYMENT_A);
    expect(res.body.status).toBe("VOID");

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payment.voided",
        entityType: "Payment",
        entityId: PAYMENT_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-1",
        metadata: expect.objectContaining({
          invoiceId: INVOICE_A,
          amount: 4000,
          method: "TRANSFER",
          status: "VOID",
        }),
      }),
    );
  });

  it("BRANCH_MANAGER can void a posted payment", async () => {
    allowBranch("user-mgr-a", BRANCH_A, "biz-A");
    allowSensitiveAuthorization("user-mgr-a", "biz-A");
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    paymentFindFirst.mockResolvedValue(paymentFixture as never);

    const voidedPayment = {
      ...paymentFixture,
      status: "VOID",
    };

    vi.mocked(prisma.payment.update).mockResolvedValue(voidedPayment as never);

    const res = await request(app)
      .patch(`/api/v1/payments/${PAYMENT_A}/void`)
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        reason: "Payment was posted in error and needs to be voided",
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(PAYMENT_A);
    expect(res.body.status).toBe("VOID");
  });

  it("STAFF can void a payment when payments.manage is allowed", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");
    allowSensitiveAuthorization("user-staff-a", "biz-A");
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    paymentFindFirst.mockResolvedValue(paymentFixture as never);

    const voidedPayment = {
      ...paymentFixture,
      status: "VOID",
    };

    vi.mocked(prisma.payment.update).mockResolvedValue(
      voidedPayment as never,
    );

    const res = await request(app)
      .patch(`/api/v1/payments/${PAYMENT_A}/void`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        reason: "Payment was posted in error and needs to be voided",
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(PAYMENT_A);
    expect(res.body.status).toBe("VOID");
    expect(recordAuditEvent).toHaveBeenCalled();
  });

  it("cannot void a payment outside the authenticated business and branch", async () => {
    allowBranch("user-owner-b", BRANCH_B, "biz-B");
    allowSensitiveAuthorization("user-owner-b", "biz-B");

    paymentFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/payments/${PAYMENT_A}/void`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_B)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        reason: "Payment was posted in error and needs to be voided",
      });

    expect(res.status).toBe(404);

    expect(paymentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: PAYMENT_A,
          businessId: "biz-B",
          branchId: BRANCH_B,
        },
      }),
    );

    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("Payment retrieval route", () => {
  it("returns a payment within the authenticated business and branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    paymentFindFirst.mockResolvedValue(paymentFixture as never);

    const res = await request(app)
      .get(`/api/v1/payments/${PAYMENT_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(PAYMENT_A);
    expect(res.body.amount).toBe(4000);
  });

  it("rejects an invalid payment id", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .get("/api/v1/payments/not-a-uuid")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(422);
    expect(paymentFindFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the payment does not exist", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    paymentFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/payments/${PAYMENT_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(404);
  });
});
