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
    customer: {
      findMany: vi.fn(),
    },
    branchResourceShare: { findMany: vi.fn().mockResolvedValue([]) },
    order: {
      findMany: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
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

const customerFindMany = vi.mocked(prisma.customer.findMany);
const orderFindMany = vi.mocked(prisma.order.findMany);
const invoiceFindMany = vi.mocked(prisma.invoice.findMany);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
const findPermission = vi.mocked(prisma.permission.findUnique);
const findRoleOverride = vi.mocked(
  prisma.businessRolePermission.findUnique,
);
const findUserOverride = vi.mocked(
  prisma.userPermissionOverride.findUnique,
);

const BUSINESS_A = "biz-A";
const BRANCH_A = "33333333-3333-3333-3333-333333333333";
const BRANCH_B = "44444444-4444-4444-4444-444444444444";
const USER_A = "user-staff-a";

function tokenFor(
  role: string,
  businessId: string | null,
  userId = USER_A,
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

const STAFF_A = tokenFor("STAFF", BUSINESS_A);

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

beforeEach(() => {
  vi.clearAllMocks();

  allowBranch(USER_A, BRANCH_A, BUSINESS_A);

  findPermission.mockImplementation(((args: {
    where: { code?: string };
  }) => {
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

  customerFindMany.mockResolvedValue([]);
  orderFindMany.mockResolvedValue([]);
  invoiceFindMany.mockResolvedValue([]);
});

describe("GET /api/v1/search", () => {
  it("requires authentication", async () => {
    const response = await request(app)
      .get("/api/v1/search")
      .set("X-Branch-Id", BRANCH_A)
      .query({ q: "John" });

    expect(response.status).toBe(401);
  });

  it("requires a branch context", async () => {
    const response = await request(app)
      .get("/api/v1/search")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .query({ q: "John" });

    expect(response.status).toBe(400);
  });

  it("validates the search query", async () => {
    const response = await request(app)
      .get("/api/v1/search")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .query({ q: "" });

    expect(response.status).toBe(422);
  });

  it("returns searchable results for an authorized staff user", async () => {
    findUserOverride.mockImplementation(((args: any) => {
      const code = args.where?.businessId_userId_permissionId
        ? undefined
        : undefined;
      return Promise.resolve({ allowed: true });
    }) as never);

    customerFindMany.mockResolvedValue([
      {
        id: "customer-1",
        name: "John Doe",
        phone: "08012345678",
      },
    ] as never);

    orderFindMany.mockResolvedValue([
      {
        id: "order-1",
        orderNumber: "00001",
        status: "RECEIVED",
        customer: {
          name: "John Doe",
        },
      },
    ] as never);

    invoiceFindMany.mockResolvedValue([
      {
        id: "invoice-1",
        invoiceNumber: "INV-00001",
        status: "ISSUED",
        customerName: "John Doe",
      },
    ] as never);

    const response = await request(app)
      .get("/api/v1/search")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .query({ q: "John", limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(
      response.body.data.map(
        (result: { type: string }) => result.type,
      ),
    ).toEqual(["CUSTOMER", "ORDER", "INVOICE"]);
  });

  it("does not return modules denied by permission", async () => {
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    findPermission.mockImplementation(((args: {
      where: { code?: string };
    }) => {
      const code = args.where.code ?? "";

      if (code === "invoices.view") {
        return Promise.resolve(null);
      }

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

    customerFindMany.mockResolvedValue([
      {
        id: "customer-1",
        name: "John Doe",
        phone: "08012345678",
      },
    ] as never);

    orderFindMany.mockResolvedValue([
      {
        id: "order-1",
        orderNumber: "00001",
        status: "RECEIVED",
        customer: {
          name: "John Doe",
        },
      },
    ] as never);

    const response = await request(app)
      .get("/api/v1/search")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .query({ q: "John" });

    expect(response.status).toBe(200);

    expect(
      response.body.data.map(
        (result: { type: string }) => result.type,
      ),
    ).toEqual(["CUSTOMER", "ORDER"]);

    expect(invoiceFindMany).not.toHaveBeenCalled();
  });

  it("rejects a branch the authenticated user cannot access", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const response = await request(app)
      .get("/api/v1/search")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .query({ q: "John" });

    expect(response.status).toBe(403);
    expect(customerFindMany).not.toHaveBeenCalled();
    expect(orderFindMany).not.toHaveBeenCalled();
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });
});
