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
  },
}));

vi.mock("../../src/modules/businesses/businesses.controller.js", () => ({
  getBranding: vi.fn((_req, res) => res.status(200).json({ ok: true })),
  updateBranding: vi.fn((_req, res) => res.status(200).json({ ok: true })),
  getLogo: vi.fn((_req, res) => res.status(200).send("logo")),
  uploadLogo: vi.fn((_req, res) => res.status(200).json({ ok: true })),
  removeLogo: vi.fn((_req, res) => res.status(200).json({ ok: true })),
}));

import { prisma } from "../../src/lib/prisma.js";
import {
  getBranding,
  updateBranding,
  getLogo,
  uploadLogo,
  removeLogo,
} from "../../src/modules/businesses/businesses.controller.js";
import { createApp } from "../../src/app.js";

const findPermission = vi.mocked(prisma.permission.findUnique);
const findRoleOverride = vi.mocked(prisma.businessRolePermission.findUnique);
const findUserOverride = vi.mocked(
  prisma.userPermissionOverride.findUnique,
);

function tokenFor(
  role: string,
  businessId = "biz-A",
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

const OWNER_A = tokenFor("BUSINESS_OWNER", "biz-A", "owner-a");
const STAFF_A = tokenFor("STAFF", "biz-A", "staff-a");

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();

  findPermission.mockImplementation(
    ((args: { where: { code?: string } }) => {
      const code = args.where.code ?? "";

      return Promise.resolve({
        id: `permission-${code}`,
        code,
        module: code.split(".")[0],
        action: code.split(".")[1] ?? "",
        description: null,
        createdAt: new Date(),
      });
    }) as never,
  );

  findRoleOverride.mockResolvedValue(null);
  findUserOverride.mockResolvedValue(null);
});

describe("Businesses routes - granular permission enforcement", () => {
  it("allows STAFF with an explicit business.view permission override", async () => {
    findUserOverride.mockResolvedValue({
      allowed: true,
    } as never);

    const response = await request(app)
      .get("/api/v1/businesses/branding")
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(response.status).toBe(200);
    expect(getBranding).toHaveBeenCalled();
  });

  it("denies a user whose business.view permission is explicitly denied", async () => {
    findUserOverride.mockResolvedValue({
      allowed: false,
    } as never);

    const response = await request(app)
      .get("/api/v1/businesses/branding")
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(response.status).toBe(403);
    expect(getBranding).not.toHaveBeenCalled();
  });

  it("allows STAFF with an explicit business.update permission override", async () => {
    findUserOverride.mockResolvedValue({
      allowed: true,
    } as never);

    const response = await request(app)
      .patch("/api/v1/businesses/branding")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .send({
        name: "Updated Laundry",
      });

    expect(response.status).toBe(200);
    expect(updateBranding).toHaveBeenCalled();
  });

  it("denies a user whose business.update permission is explicitly denied", async () => {
    findUserOverride.mockResolvedValue({
      allowed: false,
    } as never);

    const response = await request(app)
      .patch("/api/v1/businesses/branding")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .send({
        name: "Blocked Update",
      });

    expect(response.status).toBe(403);
    expect(updateBranding).not.toHaveBeenCalled();
  });

  it("uses business.view for logo reads", async () => {
    findUserOverride.mockResolvedValue({
      allowed: true,
    } as never);

    const response = await request(app)
      .get("/api/v1/businesses/logo")
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(response.status).toBe(200);
    expect(getLogo).toHaveBeenCalled();
  });

  it("uses business.update for logo upload", async () => {
    findUserOverride.mockResolvedValue({
      allowed: true,
    } as never);

    const response = await request(app)
      .post("/api/v1/businesses/logo")
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("Content-Type", "image/png")
      .send(Buffer.from("fake-image"));

    expect(response.status).toBe(200);
    expect(uploadLogo).toHaveBeenCalled();
  });

  it("uses business.update for logo removal", async () => {
    findUserOverride.mockResolvedValue({
      allowed: true,
    } as never);

    const response = await request(app)
      .delete("/api/v1/businesses/logo")
      .set("Authorization", `Bearer ${STAFF_A}`);

    expect(response.status).toBe(200);
    expect(removeLogo).toHaveBeenCalled();
  });
});
