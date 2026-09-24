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
    permission: {
      findUnique: vi.fn(),
    },
    businessRolePermission: {
      findUnique: vi.fn(),
    },
    userPermissionOverride: {
      findUnique: vi.fn(),
    },
    customer: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import { createApp } from "../../src/app.js";

const findMany = vi.mocked(prisma.customer.findMany);
const count = vi.mocked(prisma.customer.count);
const findFirst = vi.mocked(prisma.customer.findFirst);
const create = vi.mocked(prisma.customer.create);
const updateMany = vi.mocked(prisma.customer.updateMany);
const findPermission = vi.mocked(prisma.permission.findUnique);
const findRoleOverride = vi.mocked(prisma.businessRolePermission.findUnique);
const findUserOverride = vi.mocked(prisma.userPermissionOverride.findUnique);

function tokenFor(role: string, businessId: string | null, userId = "user-1") {
  return jwt.sign(
    { sub: userId, email: "user@example.com", role, securityRole: role, businessId },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: "15m" },
  );
}

const OWNER_A = tokenFor("BUSINESS_OWNER", "biz-A");
const STAFF_A = tokenFor("STAFF", "biz-A", "user-staff-a");
const MANAGER_A = tokenFor("BRANCH_MANAGER", "biz-A", "user-mgr-a");
const OWNER_B = tokenFor("BUSINESS_OWNER", "biz-B", "user-owner-b");
const PLATFORM_ADMIN = tokenFor("PLATFORM_ADMIN", null, "user-admin");

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();

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
});

describe("Customers routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/customers");
    expect(res.status).toBe(401);
  });

  it("rejects a PLATFORM_ADMIN (no business context) from every customers route", async () => {
    const res = await request(app).get("/api/v1/customers").set("Authorization", `Bearer ${PLATFORM_ADMIN}`);
    expect(res.status).toBe(403);
  });
});

describe("Customers routes - tenant isolation end-to-end", () => {
  it("business A can list its own customers", async () => {
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    findMany.mockResolvedValue([{ id: "cust-1", businessId: "biz-A", name: "Jane" }] as never);
    count.mockResolvedValue(1);

    const res = await request(app).get("/api/v1/customers").set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: "biz-A" }) }));
  });

  it("business B cannot access business A's customer by id (404, not leaked)", async () => {
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    // The mocked findFirst simulates the real DB behavior: a query
    // scoped to {id, businessId: "biz-B"} finds nothing because the
    // record actually belongs to biz-A.
    findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/customers/11111111-1111-1111-1111-111111111111")
      .set("Authorization", `Bearer ${OWNER_B}`);

    expect(res.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "11111111-1111-1111-1111-111111111111", businessId: "biz-B" },
    });
  });

  it("security: a client-supplied businessId in the request body is ignored", async () => {
    findMany.mockResolvedValue([]);
    create.mockResolvedValue({ id: "cust-new", businessId: "biz-A", name: "Jane" } as never);

    await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ name: "Jane", phone: "555-123-4567", businessId: "biz-B" });

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ businessId: "biz-A" }) });
  });

  it("security: a client-supplied businessId in the query string does not change which business is queried", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await request(app)
      .get("/api/v1/customers?businessId=biz-B")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: "biz-A" }) }));
  });
});

describe("Customers routes - permission enforcement", () => {
  it("rejects a STAFF user when customers.create is explicitly denied", async () => {
    findRoleOverride.mockResolvedValue({
      allowed: false,
    } as never);

    const response = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .send({ name: "Blocked Customer" });

    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("Customers routes - authorization matrix", () => {
  it("STAFF can create a customer", async () => {
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    findMany.mockResolvedValue([]);
    create.mockResolvedValue({ id: "cust-1" } as never);

    const res = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .send({ name: "Jane", phone: "555-123-4567" });

    expect(res.status).toBe(201);
  });

  it("STAFF can list customers", async () => {
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    const res = await request(app).get("/api/v1/customers").set("Authorization", `Bearer ${STAFF_A}`);
    expect(res.status).toBe(200);
  });

  it("STAFF cannot activate a customer", async () => {
    const res = await request(app)
      .post("/api/v1/customers/11111111-1111-1111-1111-111111111111/activate")
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(res.status).toBe(403);
  });

  it("STAFF cannot deactivate a customer", async () => {
    const res = await request(app)
      .post("/api/v1/customers/11111111-1111-1111-1111-111111111111/deactivate")
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(res.status).toBe(403);
  });

  it("BRANCH_MANAGER can deactivate a customer", async () => {
    findUserOverride.mockResolvedValue({ allowed: true } as never);

    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: "cust-1", isActive: false } as never);

    const res = await request(app)
      .post("/api/v1/customers/11111111-1111-1111-1111-111111111111/deactivate")
      .set("Authorization", `Bearer ${MANAGER_A}`);

    expect(res.status).toBe(200);
  });

  it("BUSINESS_OWNER can activate a customer", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: "cust-1", isActive: true } as never);

    const res = await request(app)
      .post("/api/v1/customers/11111111-1111-1111-1111-111111111111/activate")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(res.status).toBe(200);
  });
});

describe("Customers routes - validation", () => {
  it("rejects a create with no name (422)", async () => {
    const res = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ phone: "555-123-4567" });

    expect(res.status).toBe(422);
  });

  it("rejects a create with an invalid phone (422)", async () => {
    const res = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ name: "Jane", phone: "abc" });

    expect(res.status).toBe(422);
  });

  it("rejects a create with an invalid email (422)", async () => {
    const res = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ name: "Jane", phone: "555-123-4567", email: "not-an-email" });

    expect(res.status).toBe(422);
  });

  it("rejects oversized notes (422)", async () => {
    const res = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ name: "Jane", phone: "555-123-4567", notes: "a".repeat(2001) });

    expect(res.status).toBe(422);
  });
});

describe("Customers routes - duplicate handling", () => {
  it("returns 409 when a likely duplicate exists", async () => {
    findMany.mockResolvedValue([{ id: "existing-1", name: "Jane Doe", phone: "5551234567" }] as never);

    const res = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ name: "Jane Doe", phone: "555-123-4567" });

    expect(res.status).toBe(409);
    expect(res.body.error.duplicates).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates anyway when confirmDuplicate is true", async () => {
    findMany.mockResolvedValue([{ id: "existing-1", name: "Jane Doe", phone: "5551234567" }] as never);
    create.mockResolvedValue({ id: "new-1", name: "Jane Doe" } as never);

    const res = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ name: "Jane Doe", phone: "555-123-4567", confirmDuplicate: true });

    expect(res.status).toBe(201);
  });
});

describe("Customers routes - update duplicate-phone handling", () => {
  const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";

  it("updating phone to a unique number succeeds", async () => {
    findMany.mockResolvedValue([]); // no duplicates in biz-A
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: CUSTOMER_ID, phone: "5559998888" } as never);

    const res = await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ phone: "555-999-8888" });

    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: CUSTOMER_ID, businessId: "biz-A" }, data: { phone: "5559998888" } });
  });

  it("updating phone to another active customer's number returns 409 and does not update", async () => {
    findMany.mockResolvedValue([{ id: "other-cust", name: "Other Person", phone: "5551234567" }] as never);

    const res = await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ phone: "555-123-4567" });

    expect(res.status).toBe(409);
    expect(res.body.error.duplicates).toHaveLength(1);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("the customer's own existing phone does not count as a duplicate of itself", async () => {
    // findMany simulates the DB honoring the excludeId - the customer
    // being edited is filtered out, so no matches come back even though
    // its own current row has this exact phone number.
    findMany.mockResolvedValue([]);
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: CUSTOMER_ID, phone: "5551234567" } as never);

    const res = await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ phone: "555-123-4567" });

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: CUSTOMER_ID } }) }),
    );
  });

  it("confirmDuplicate: true allows the update despite a match", async () => {
    findMany.mockResolvedValue([{ id: "other-cust", name: "Other Person", phone: "5551234567" }] as never);
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: CUSTOMER_ID, phone: "5551234567" } as never);

    const res = await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ phone: "555-123-4567", confirmDuplicate: true });

    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledOnce();
  });

  it("security: duplicate matches are scoped to the caller's own business, never another business's customers", async () => {
    findMany.mockResolvedValue([]);
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: CUSTOMER_ID, phone: "5551234567" } as never);

    await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .send({ phone: "555-123-4567" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: "biz-B" }) }));
  });

  it("the duplicate warning (409) does not write a customer.updated audit event", async () => {
    findMany.mockResolvedValue([{ id: "other-cust", name: "Other Person", phone: "5551234567" }] as never);

    await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ phone: "555-123-4567" });

    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("a successful confirmed update writes a customer.updated audit event", async () => {
    findMany.mockResolvedValue([{ id: "other-cust", name: "Other Person", phone: "5551234567" }] as never);
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: CUSTOMER_ID, phone: "5551234567" } as never);

    await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .send({ phone: "555-123-4567", confirmDuplicate: true });

    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "customer.updated" }));
  });
});

describe("Customers routes - list search/pagination", () => {
  it("passes search and pagination params through to the service", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await request(app)
      .get("/api/v1/customers?search=Jane&page=2&pageSize=5")
      .set("Authorization", `Bearer ${OWNER_A}`);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: "biz-A", OR: expect.any(Array) }),
        skip: 5,
        take: 5,
      }),
    );
  });
});
