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
    service: {
      findMany: vi.fn(),
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
import { createApp } from "../../src/app.js";

const findMany = vi.mocked(prisma.service.findMany);
const findFirst = vi.mocked(prisma.service.findFirst);
const create = vi.mocked(prisma.service.create);
const updateMany = vi.mocked(prisma.service.updateMany);
const findPermission = vi.mocked(prisma.permission.findUnique);
const findRoleOverride = vi.mocked(prisma.businessRolePermission.findUnique);
const findUserOverride = vi.mocked(prisma.userPermissionOverride.findUnique);

function tokenFor(
  role: string,
  businessId: string | null,
  userId = "user-1",
) {
  return jwt.sign(
    { sub: userId, email: "user@example.com", role, businessId },
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

describe("Services routes - authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/services");

    expect(res.status).toBe(401);
  });

  it("rejects PLATFORM_ADMIN without business context", async () => {
    const res = await request(app)
      .get("/api/v1/services")
      .set("Authorization", `Bearer ${PLATFORM_ADMIN}`);

    expect(res.status).toBe(403);
  });
});

describe("Services routes - tenant isolation", () => {
  it("business A can list its own services", async () => {
    findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/api/v1/services?status=all")
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
      },
      orderBy: {
        name: "asc",
      },
    });
  });

  it("business B cannot access business A service by id", async () => {
    findFirst.mockResolvedValue(null);

    const serviceId = "11111111-1111-4111-8111-111111111111";

    const res = await request(app)
      .get(`/api/v1/services/${serviceId}`)
      .set("Authorization", `Bearer ${OWNER_B}`);

    expect(res.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: serviceId,
        businessId: "biz-B",
      },
    });
  });
});

describe("Services routes - authorization", () => {
  it("allows STAFF to view services", async () => {
    findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/api/v1/services")
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(res.status).toBe(200);
  });

  it("allows BRANCH_MANAGER to create a service", async () => {
    create.mockResolvedValue({
      id: "service-1",
      businessId: "biz-A",
      name: "Shirt",
      pieces: 1,
      unitPrice: 500,
      isActive: true,
    } as never);

    const res = await request(app)
      .post("/api/v1/services")
      .set("Authorization", `Bearer ${MANAGER_A}`)
      .send({
        name: "Shirt",
        pieces: 1,
        unitPrice: 500,
      });

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalled();
  });

  it("rejects STAFF from activating a service", async () => {
    const res = await request(app)
      .post("/api/v1/services/service-1/activate")
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(res.status).toBe(403);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("Services routes - permission enforcement", () => {
  it("rejects STAFF when services.create is explicitly denied", async () => {
    findRoleOverride.mockResolvedValue({
      allowed: false,
    } as never);

    const res = await request(app)
      .post("/api/v1/services")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .send({
        name: "Blocked Service",
        pieces: 1,
        unitPrice: 500,
      });

    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects STAFF when services.view is explicitly denied", async () => {
    findRoleOverride.mockResolvedValue({
      allowed: false,
    } as never);

    const res = await request(app)
      .get("/api/v1/services")
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(res.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });
});
