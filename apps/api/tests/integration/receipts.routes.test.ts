import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
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
    invoice: {
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

import { prisma } from "../../src/lib/prisma.js";
import { createApp } from "../../src/app.js";

const invoiceFindFirst = vi.mocked(prisma.invoice.findFirst);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
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
const OWNER_B = tokenFor("BUSINESS_OWNER", "biz-B", "user-owner-b");
const PLATFORM_ADMIN = tokenFor("PLATFORM_ADMIN", null, "user-admin");

const BRANCH_A = "33333333-3333-3333-3333-333333333333";
const BRANCH_B = "44444444-4444-4444-4444-444444444444";
const INVOICE_A = "88888888-8888-8888-8888-888888888888";

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

const invoiceFixture = {
  id: INVOICE_A,
  invoiceNumber: "00042",
  businessId: "biz-A",
  branchId: BRANCH_A,
  branch: {
    name: "Main Branch",
  },
  orderId: "77777777-7777-7777-7777-777777777777",
  order: {
    orderNumber: "00017",
  },
  status: "ISSUED",
  customerName: "Jane Doe",
  companyName: "Clean Laundry",
  companyPhone: "08000000000",
  companyEmail: "hello@example.com",
  companyWebsite: "https://example.com",
  companyAddress: "12 Main Street",
  totalAmount: 9000,
  payments: [],
  garmentNote: "Small mark on sleeve",
  internalNote: "KEEP CUSTOMER'S WHITE SHIRT SEPARATE",
  customerAgreement: "Please check garments before leaving.",
  createdAt: new Date("2026-08-29T20:00:00.000Z"),
  items: [
    {
      id: "99999999-9999-9999-9999-999999999999",
      invoiceId: INVOICE_A,
      itemName: "Shirt",
      piecesPerUnit: 1,
      quantity: 2,
      totalPieces: 2,
      unitPrice: 4500,
      totalPrice: 9000,
      createdAt: new Date("2026-08-29T20:00:00.000Z"),
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();

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

describe("Receipt routes - authentication and context", () => {
  it("rejects an unauthenticated customer receipt request", async () => {
    const res = await request(app).get(
      `/api/v1/invoices/${INVOICE_A}/receipt/customer`,
    );

    expect(res.status).toBe(401);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });

  it("rejects PLATFORM_ADMIN because it has no business context", async () => {
    const res = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}/receipt/customer`)
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a request without branch context", async () => {
    const res = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}/receipt/customer`)
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(400);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a branch the authenticated user is not a member of", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}/receipt/customer`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });
});

describe("Customer receipt endpoint", () => {
  it("returns the customer-safe receipt projection", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    invoiceFindFirst.mockResolvedValue(invoiceFixture as never);

    const res = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}/receipt/customer`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(res.body).toEqual({
      businessId: "biz-A",
      receiptType: "CUSTOMER",
      invoiceNumber: "00042",
      orderNumber: "00017",
      companyName: "Clean Laundry",
      companyPhone: "08000000000",
      companyEmail: "hello@example.com",
      companyWebsite: "https://example.com",
      companyAddress: "12 Main Street",
      customerName: "Jane Doe",
      branchName: "Main Branch",
      createdAt: "2026-08-29T20:00:00.000Z",
      items: [
        {
          id: "99999999-9999-9999-9999-999999999999",
          quantity: 2,
          itemName: "Shirt",
          totalPieces: 2,
          unitPrice: 4500,
          totalPrice: 9000,
        },
      ],
      subtotal: 9000,
      adjustedSubtotal: 9000,
      adjustmentTotal: 0,
      additiveTaxTotal: 0,
      withholdingTaxTotal: 0,
      appliedAdjustments: [],
      appliedTaxes: [],
      totalAmount: 9000,
      totalPaid: 0,
      balanceDue: 9000,
      payments: [],
      garmentNote: "Small mark on sleeve",
      customerAgreement: "Please check garments before leaving.",
    });

    expect(res.body.internalNote).toBeUndefined();
  });

  it("never exposes the private internal note", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    invoiceFindFirst.mockResolvedValue(invoiceFixture as never);

    const res = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}/receipt/customer`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(
      "KEEP CUSTOMER'S WHITE SHIRT SEPARATE",
    );
  });

  it("returns 404 when the invoice is outside the tenant/branch scope", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    invoiceFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}/receipt/customer`)
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
});

describe("Company receipt endpoint", () => {
  it("returns the company receipt including the private internal note", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");
    findUserOverride.mockResolvedValue({ allowed: true } as never);
    invoiceFindFirst.mockResolvedValue(invoiceFixture as never);

    const res = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}/receipt/company`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);
    expect(res.body.receiptType).toBe("COMPANY");
    expect(res.body.internalNote).toBe(
      "KEEP CUSTOMER'S WHITE SHIRT SEPARATE",
    );
  });

  it("never exposes customer phone, email or address", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");
    findUserOverride.mockResolvedValue({ allowed: true } as never);
    invoiceFindFirst.mockResolvedValue(invoiceFixture as never);

    const res = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}/receipt/company`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(res.body.customerPhone).toBeUndefined();
    expect(res.body.customerEmail).toBeUndefined();
    expect(res.body.customerAddress).toBeUndefined();
  });

  it("preserves QTY, PCS, unit price and total price", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");
    invoiceFindFirst.mockResolvedValue(invoiceFixture as never);

    const res = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}/receipt/company`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(200);

    expect(res.body.items[0]).toEqual({
      id: "99999999-9999-9999-9999-999999999999",
      quantity: 2,
      itemName: "Shirt",
      totalPieces: 2,
      unitPrice: 4500,
      totalPrice: 9000,
    });
  });

  it("business B cannot retrieve business A's company receipt", async () => {
    allowBranch("user-owner-b", BRANCH_B, "biz-B");
    invoiceFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}/receipt/company`)
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

describe("Receipt routes - validation and authorization", () => {
  it("rejects an invalid invoice id", async () => {
    allowBranch("user-1", BRANCH_A, "biz-A");

    const res = await request(app)
      .get("/api/v1/invoices/not-a-uuid/receipt/customer")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(422);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });

  it("allows STAFF to access both receipt projections", async () => {
    allowBranch("user-staff-a", BRANCH_A, "biz-A");
    findUserOverride.mockResolvedValue({ allowed: true } as never);
    invoiceFindFirst.mockResolvedValue(invoiceFixture as never);

    const customerRes = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}/receipt/customer`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(customerRes.status).toBe(200);

    const companyRes = await request(app)
      .get(`/api/v1/invoices/${INVOICE_A}/receipt/company`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(companyRes.status).toBe(200);
  });
});
