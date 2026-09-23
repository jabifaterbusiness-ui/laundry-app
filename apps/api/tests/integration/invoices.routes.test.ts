import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
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
    invoice: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    order: {
      findFirst: vi.fn(),
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
import { recordAuditEvent } from "../../src/lib/audit.js";
import { createApp } from "../../src/app.js";

const invoiceFindMany = vi.mocked(prisma.invoice.findMany);
const invoiceCount = vi.mocked(prisma.invoice.count);
const invoiceFindFirst = vi.mocked(prisma.invoice.findFirst);
const invoiceCreate = vi.mocked(prisma.invoice.create);
const orderFindFirst = vi.mocked(prisma.order.findFirst);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
const findPermission = vi.mocked(prisma.permission.findUnique);
const findRoleOverride = vi.mocked(prisma.businessRolePermission.findUnique);
const findUserOverride = vi.mocked(prisma.userPermissionOverride.findUnique);
const transaction = vi.mocked(prisma.$transaction);

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
const MANAGER_A = tokenFor("BRANCH_MANAGER", "biz-A", "user-mgr-a");
const OWNER_B = tokenFor("BUSINESS_OWNER", "biz-B", "user-owner-b");
const PLATFORM_ADMIN = tokenFor("PLATFORM_ADMIN", null, "user-admin");

const BRANCH_A = "33333333-3333-3333-3333-333333333333";
const BRANCH_B = "44444444-4444-4444-4444-444444444444";
const ORDER_A = "77777777-7777-7777-7777-777777777777";
const INVOICE_A = "88888888-8888-8888-8888-888888888888";
const CUSTOMER_A = "11111111-1111-1111-1111-111111111111";

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
  transaction.mockImplementation(async (callback) => {
    return callback(prisma as never);
  });
}

const invoiceFixture = {
  id: INVOICE_A,
  invoiceNumber: "00042",
  businessId: "biz-A",
  branchId: BRANCH_A,
  orderId: ORDER_A,
  status: "ISSUED",
  customerName: "Jane Doe",
  companyName: "Clean Laundry",
  companyPhone: "08000000000",
  companyEmail: "hello@example.com",
  companyWebsite: "https://example.com",
  companyAddress: "12 Main Street",
  totalAmount: 9000,
  garmentNote: null,
  internalNote: null,
  customerAgreement: "Please check garments before leaving.",
  items: [],
  order: {
    id: ORDER_A,
    customer: {
      id: CUSTOMER_A,
      name: "Jane Doe",
    },
    branch: {
      id: BRANCH_A,
      name: "Main Branch",
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction();

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
});

describe("Invoices routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/invoices");

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .get("/api/v1/invoices")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
  });
});

describe("Invoices routes - branch context", () => {
  it("rejects a request without X-Branch-Id", async () => {
    const res = await request(app)
      .get("/api/v1/invoices")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
  });

  it("rejects a branch the authenticated user is not a member of", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/invoices")
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
      .get("/api/v1/invoices")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(403);
  });
});

describe("Invoices routes - authorization", () => {
  it("STAFF can list invoices", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/invoices")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
  });

  it("BRANCH_MANAGER can list invoices", async () => {
    allowBranch("user-mgr-a", BRANCH_A, "biz-A");

    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/invoices")
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
  });

  it("BUSINESS_OWNER can list invoices", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/invoices")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
  });

  it("STAFF can create an invoice", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      businessId: "biz-A",
      branchId: BRANCH_A,
      orderTotal: 9000,
      garmentNote: null,
      internalNote: null,
      customer: { id: CUSTOMER_A, name: "Jane Doe" },
      branch: { id: BRANCH_A, name: "Main Branch" },
      business: {
        id: "biz-A",
        name: "Clean Laundry",
        phone: "08000000000",
        email: "hello@example.com",
        website: "https://example.com",
        address: "12 Main Street",
      },
      items: [
        {
          serviceName: "Shirt",
          piecesPerUnit: 1,
          quantity: 2,
          totalPieces: 2,
          unitPrice: 4500,
          lineTotal: 9000,
        },
      ],
      invoice: null,
    } as never);

    invoiceCreate.mockResolvedValue(invoiceFixture as never);

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        orderId: ORDER_A,
        customerAgreement: "Please check garments before leaving.",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(INVOICE_A);
  });

  it("allows PLATFORM_ADMIN to access invoices through permissions", async () => {
    const token = tokenFor("PLATFORM_ADMIN", "biz-A", "user-platform");

    const res = await request(app)
      .get("/api/v1/invoices")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
  });
});

describe("Invoices routes - permission enforcement", () => {
  it("rejects STAFF when invoices.manage is explicitly denied", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    findRoleOverride.mockResolvedValue({ allowed: false } as never);

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        orderId: ORDER_A,
        customerAgreement: "Agreement",
      });

    expect(res.status).toBe(403);
    expect(orderFindFirst).not.toHaveBeenCalled();
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("rejects STAFF when invoices.view is explicitly denied", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");

    findRoleOverride.mockResolvedValue({ allowed: false } as never);

    const res = await request(app)
      .get("/api/v1/invoices")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
    expect(invoiceFindMany).not.toHaveBeenCalled();
    expect(invoiceCount).not.toHaveBeenCalled();
  });

  it("rejects BRANCH_MANAGER when invoices.view is explicitly denied", async () => {
    allowBranch("user-mgr-a", BRANCH_A, "biz-A");

    findRoleOverride.mockResolvedValue({ allowed: false } as never);

    const res = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}`)
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });
});

describe("Invoices routes - tenant and branch isolation", () => {
  it("business A lists only invoices for its selected branch", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/invoices")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
        }),
      }),
    );
  });

  it("business B cannot retrieve an invoice from business A", async () => {
    allowBranch("user-owner-b", BRANCH_B, "biz-B");

    invoiceFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}`)
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

  it("an invoice from another branch is not returned", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    invoiceFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(404);

    expect(invoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: INVOICE_A,
          businessId: "biz-A",
          branchId: BRANCH_A,
        },
      }),
    );
  });

  it("business isolation is preserved when retrieving an invoice by order", async () => {
    allowBranch("user-owner-b", BRANCH_B, "biz-B");

    invoiceFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/invoices/order/${ORDER_A}`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_B);

    expect(res.status).toBe(404);

    expect(invoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orderId: ORDER_A,
          businessId: "biz-B",
          branchId: BRANCH_B,
        },
      }),
    );
  });
});

describe("Invoices routes - creation validation", () => {
  it("rejects a missing orderId", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        customerAgreement: "Agreement",
      });

    expect(res.status).toBe(422);
    expect(orderFindFirst).not.toHaveBeenCalled();
  });

  it("rejects an invalid orderId", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        orderId: "not-a-uuid",
        customerAgreement: "Agreement",
      });

    expect(res.status).toBe(422);
    expect(orderFindFirst).not.toHaveBeenCalled();
  });

  it("rejects an empty customer agreement", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        orderId: ORDER_A,
        customerAgreement: "   ",
      });

    expect(res.status).toBe(422);
    expect(orderFindFirst).not.toHaveBeenCalled();
  });

  it("rejects an oversized customer agreement", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        orderId: ORDER_A,
        customerAgreement: "a".repeat(2001),
      });

    expect(res.status).toBe(422);
    expect(orderFindFirst).not.toHaveBeenCalled();
  });
});

describe("Invoices routes - creation security", () => {
  it("ignores a client-supplied businessId", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      businessId: "biz-A",
      branchId: BRANCH_A,
      orderTotal: 9000,
      garmentNote: null,
      internalNote: null,
      customer: { id: CUSTOMER_A, name: "Jane Doe" },
      branch: { id: BRANCH_A, name: "Main Branch" },
      business: {
        id: "biz-A",
        name: "Clean Laundry",
        phone: null,
        email: null,
        website: null,
        address: null,
      },
      items: [
        {
          serviceName: "Shirt",
          piecesPerUnit: 1,
          quantity: 1,
          totalPieces: 1,
          unitPrice: 9000,
          lineTotal: 9000,
        },
      ],
      invoice: null,
    } as never);

    invoiceCreate.mockResolvedValue(invoiceFixture as never);

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        orderId: ORDER_A,
        customerAgreement: "Agreement",
        businessId: "biz-B",
        branchId: BRANCH_B,
        totalAmount: 1,
      });

    expect(res.status).toBe(201);

    expect(orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ORDER_A,
          businessId: "biz-A",
          branchId: BRANCH_A,
        },
      }),
    );

    expect(invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceNumber: "00042",
          totalAmount: 9000,
        }),
      }),
    );
  });

  it("does not create an invoice when the order belongs to another business", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    orderFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        orderId: ORDER_A,
        customerAgreement: "Agreement",
      });

    expect(res.status).toBe(404);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("does not create a duplicate invoice for the same order", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      invoice: {
        id: INVOICE_A,
      },
      items: [
        {
          serviceName: "Shirt",
          piecesPerUnit: 1,
          quantity: 1,
          totalPieces: 1,
          unitPrice: 9000,
          lineTotal: 9000,
        },
      ],
    } as never);

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        orderId: ORDER_A,
        customerAgreement: "Agreement",
      });

    expect(res.status).toBe(409);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("records an invoice.created audit event after successful creation", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    orderFindFirst.mockResolvedValue({
      id: ORDER_A,
      orderNumber: "00042",
      businessId: "biz-A",
      branchId: BRANCH_A,
      orderTotal: 9000,
      garmentNote: null,
      internalNote: null,
      customer: { id: CUSTOMER_A, name: "Jane Doe" },
      branch: { id: BRANCH_A, name: "Main Branch" },
      business: {
        id: "biz-A",
        name: "Clean Laundry",
        phone: null,
        email: null,
        website: null,
        address: null,
      },
      items: [
        {
          serviceName: "Shirt",
          piecesPerUnit: 1,
          quantity: 1,
          totalPieces: 1,
          unitPrice: 9000,
          lineTotal: 9000,
        },
      ],
      invoice: null,
    } as never);

    invoiceCreate.mockResolvedValue(invoiceFixture as never);

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .send({
        orderId: ORDER_A,
        customerAgreement: "Agreement",
      });

    expect(res.status).toBe(201);

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "invoice.created",
        entityType: "Invoice",
        entityId: INVOICE_A,
        businessId: "biz-A",
        branchId: BRANCH_A,
        actorUserId: "user-1",
      }),
    );
  });
});

describe("Invoices routes - list filters and pagination", () => {
  it("passes status, customerId and pagination filters through safely", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);

    const res = await request(app)
      .get(
        `/api/v1/invoices?status=ISSUED&customerId=${CUSTOMER_A}&page=2&pageSize=10`,
      )
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-A",
          branchId: BRANCH_A,
          status: "ISSUED",
          order: {
            customerId: CUSTOMER_A,
          },
        },
        skip: 10,
        take: 10,
      }),
    );

    expect(invoiceCount).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        branchId: BRANCH_A,
        status: "ISSUED",
        order: {
          customerId: CUSTOMER_A,
        },
      },
    });
  });

  it("rejects an invalid status filter", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .get("/api/v1/invoices?status=NOT_A_STATUS")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(422);
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });
});

describe("Invoices routes - lookup validation", () => {
  it("rejects an invalid invoice id", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .get("/api/v1/invoices/not-a-uuid")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(422);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });

  it("rejects an invalid order id for invoice lookup", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .get("/api/v1/invoices/order/not-a-uuid")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(422);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });
});
