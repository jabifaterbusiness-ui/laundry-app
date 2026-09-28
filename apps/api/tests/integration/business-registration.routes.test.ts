import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    platformConfig: {
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/modules/businesses/business-provisioning.service.js", () => ({
  provisionBusiness: vi.fn(),
}));

vi.mock("../../src/modules/auth/auth.service.js", () => ({
  hashPassword: vi.fn(),
  issueTokenPair: vi.fn(),
}));

vi.mock("../../src/modules/permissions/permissions.service.js", () => ({
  getEffectivePermissionCodes: vi.fn(),
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import { provisionBusiness } from "../../src/modules/businesses/business-provisioning.service.js";
import { issueTokenPair } from "../../src/modules/auth/auth.service.js";
import { getEffectivePermissionCodes } from "../../src/modules/permissions/permissions.service.js";
import { createApp } from "../../src/app.js";

const app = createApp();

const PLATFORM_CONFIG = {
  id: "00000000-0000-4000-8000-000000000001",
  allowNewBusinessRegistration: true,
  maintenanceMode: false,
  whatsappMessagingEnabled: true,
  automatedNotificationsEnabled: true,
  offlineSyncEnabled: true,
  version: 1,
  createdAt: new Date("2026-09-15T00:00:00.000Z"),
  updatedAt: new Date("2026-09-15T00:00:00.000Z"),
};

const BUSINESS = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Fresh Laundry Abuja",
  slug: "fresh-laundry-abuja",
};

const BRANCH = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Gwarinpa Branch",
};

const USER = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  email: "owner@example.com",
  username: "owner",
  fullName: "Test Owner",
  role: "Business Owner",
  securityRole: "BUSINESS_OWNER",
  businessId: BUSINESS.id,
};

const TOKENS = {
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
};

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(prisma.platformConfig.upsert).mockResolvedValue(
    PLATFORM_CONFIG as never,
  );

  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

  vi.mocked(provisionBusiness).mockResolvedValue({
    business: BUSINESS,
    branch: BRANCH,
    user: USER,
  } as never);

  vi.mocked(issueTokenPair).mockResolvedValue(TOKENS);

  vi.mocked(getEffectivePermissionCodes).mockResolvedValue([
    "dashboard.view",
    "orders.view",
  ]);
});

describe("Business registration routes", () => {
  it("reports registration as enabled", async () => {
    const response = await request(app).get(
      "/api/v1/business-registration/status",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      registrationEnabled: true,
    });
  });

  it("reports registration as disabled when platform config disables it", async () => {
    vi.mocked(prisma.platformConfig.upsert).mockResolvedValue({
      ...PLATFORM_CONFIG,
      allowNewBusinessRegistration: false,
    } as never);

    const response = await request(app).get(
      "/api/v1/business-registration/status",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      registrationEnabled: false,
    });
  });

  it("rejects registration when the platform has disabled new businesses", async () => {
    vi.mocked(prisma.platformConfig.upsert).mockResolvedValue({
      ...PLATFORM_CONFIG,
      allowNewBusinessRegistration: false,
    } as never);

    const response = await request(app)
      .post("/api/v1/business-registration")
      .send({
        businessName: "Fresh Laundry Abuja",
        ownerName: "Test Owner",
        ownerEmail: "owner@example.com",
        username: "owner",
        password: "password123",
        confirmPassword: "password123",
        branchName: "Gwarinpa Branch",
      });

    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe(
      "New business registration is currently unavailable.",
    );
    expect(provisionBusiness).not.toHaveBeenCalled();
  });

  it("registers a business and returns an authenticated owner session", async () => {
    const response = await request(app)
      .post("/api/v1/business-registration")
      .send({
        businessName: "Fresh Laundry Abuja",
        businessPhone: "08001234567",
        businessEmail: "Business@Example.COM",
        businessWebsite: "https://example.com",
        businessAddress: "Gwarinpa, Abuja",
        countryCode: "ng",
        currencyCode: "ngn",
        timezone: "Africa/Lagos",
        locale: "en-NG",
        ownerName: "Test Owner",
        ownerEmail: "Owner@Example.COM",
        username: "Owner",
        password: "password123",
        confirmPassword: "password123",
        branchName: "Gwarinpa Branch",
      });

    expect(response.status).toBe(201);

    expect(response.body).toEqual({
      user: {
        id: USER.id,
        email: USER.email,
        username: USER.username,
        fullName: USER.fullName,
        role: USER.role,
        securityRole: USER.securityRole,
        businessId: BUSINESS.id,
        branches: [
          {
            id: BRANCH.id,
            name: BRANCH.name,
          },
        ],
        permissions: ["dashboard.view", "orders.view"],
      },
      accessToken: TOKENS.accessToken,
      refreshToken: TOKENS.refreshToken,
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "owner@example.com" },
      select: { id: true },
    });

    expect(provisionBusiness).toHaveBeenCalledWith({
      businessName: "Fresh Laundry Abuja",
      businessPhone: "08001234567",
      businessEmail: "business@example.com",
      businessWebsite: "https://example.com",
      businessAddress: "Gwarinpa, Abuja",
      countryCode: "NG",
      currencyCode: "NGN",
      timezone: "Africa/Lagos",
      locale: "en-NG",
      ownerName: "Test Owner",
      ownerEmail: "owner@example.com",
      username: "owner",
      password: "password123",
      branchName: "Gwarinpa Branch",
    });

    expect(issueTokenPair).toHaveBeenCalledWith(USER);

    expect(getEffectivePermissionCodes).toHaveBeenCalledWith(
      BUSINESS.id,
      USER.id,
      USER.securityRole,
    );

    expect(recordAuditEvent).toHaveBeenCalledWith({
      action: "business.registration.created",
      entityType: "Business",
      entityId: BUSINESS.id,
      businessId: BUSINESS.id,
      actorUserId: USER.id,
      metadata: {
        businessName: BUSINESS.name,
        ownerUserId: USER.id,
        branchId: BRANCH.id,
      },
    });
  });

  it("rejects a duplicate owner email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "existing-user",
    } as never);

    const response = await request(app)
      .post("/api/v1/business-registration")
      .send({
        businessName: "Another Laundry",
        ownerName: "Another Owner",
        ownerEmail: "Existing@Example.COM",
        password: "password123",
        confirmPassword: "password123",
        branchName: "Main Branch",
      });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe(
      "That email address is already registered",
    );
    expect(provisionBusiness).not.toHaveBeenCalled();
  });

  it("rejects a duplicate username", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "existing-user" } as never);

    const response = await request(app)
      .post("/api/v1/business-registration")
      .send({
        businessName: "Another Laundry",
        ownerName: "Another Owner",
        ownerEmail: "another@example.com",
        username: "ExistingUser",
        password: "password123",
        confirmPassword: "password123",
        branchName: "Main Branch",
      });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe(
      "That username is already registered",
    );
    expect(provisionBusiness).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords before provisioning", async () => {
    const response = await request(app)
      .post("/api/v1/business-registration")
      .send({
        businessName: "Fresh Laundry Abuja",
        ownerName: "Test Owner",
        ownerEmail: "owner@example.com",
        username: "owner",
        password: "password123",
        confirmPassword: "different123",
        branchName: "Gwarinpa Branch",
      });

    expect(response.status).toBe(422);
    expect(response.body.error.message).toBe("Validation failed");
    expect(provisionBusiness).not.toHaveBeenCalled();
  });
});
