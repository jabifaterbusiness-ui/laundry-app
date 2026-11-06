
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    business: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    sensitiveAuthorization: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  clearBusinessLogo,
  getBusinessBranding,
  setBusinessLogo,
  updateBusinessBranding,
  getBusinessSecuritySettings,
  updateBusinessSecuritySettings,
} from "../../src/modules/businesses/businesses.service.js";
import { AppError } from "../../src/middleware/error-handler.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("business session security settings", () => {
  it("loads the configured inactivity timeout for the business", async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      sessionInactivityTimeoutMinutes: 8,
    });

    await expect(getBusinessSecuritySettings("biz-1")).resolves.toEqual({
      sessionInactivityTimeoutMinutes: 8,
    });
    expect(prismaMock.business.findUnique).toHaveBeenCalledWith({
      where: { id: "biz-1" },
      select: { sessionInactivityTimeoutMinutes: true },
    });
  });

  it("updates the timeout and revokes active sensitive authorizations immediately", async () => {
    prismaMock.business.findUnique
      .mockResolvedValueOnce({ sessionInactivityTimeoutMinutes: 3 })
      .mockResolvedValueOnce({ sessionInactivityTimeoutMinutes: 6 });
    prismaMock.business.updateMany.mockReturnValue("business-update" as never);
    prismaMock.sensitiveAuthorization.updateMany.mockReturnValue("revoke-authorizations" as never);
    prismaMock.$transaction.mockResolvedValue([{ count: 1 }, { count: 2 }]);

    await expect(updateBusinessSecuritySettings("biz-1", {
      sessionInactivityTimeoutMinutes: 6,
    })).resolves.toEqual({ sessionInactivityTimeoutMinutes: 6 });

    expect(prismaMock.$transaction).toHaveBeenCalledWith([
      "business-update",
      "revoke-authorizations",
    ]);
    expect(prismaMock.sensitiveAuthorization.updateMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("does not revoke active authorizations when the timeout is unchanged", async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      sessionInactivityTimeoutMinutes: 3,
    });

    await updateBusinessSecuritySettings("biz-1", {
      sessionInactivityTimeoutMinutes: 3,
    });

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.sensitiveAuthorization.updateMany).not.toHaveBeenCalled();
  });
});

describe("getBusinessBranding", () => {
  it("loads branding using the authenticated businessId", async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      id: "biz-1",
      name: "Clean Laundry",
      phone: "08000000000",
      email: "info@cleanlaundry.com",
      website: "https://cleanlaundry.com",
      address: "123 Main Street",
      logoUrl: "https://example.com/logo.png",
      receiptPrimaryColor: "#123456",
      receiptAccentColor: "#ABCDEF",
      receiptBackgroundColor: "#FFFFFF",
      receiptTextColor: "#111111",
      receiptHeaderStyle: "modern",
      defaultCustomerAgreement: "Thank you for choosing Clean Laundry.",
    });

    const result = await getBusinessBranding("biz-1");

    expect(result).toEqual({
      id: "biz-1",
      name: "Clean Laundry",
      phone: "08000000000",
      email: "info@cleanlaundry.com",
      website: "https://cleanlaundry.com",
      address: "123 Main Street",
      logoUrl: "https://example.com/logo.png",
      receiptPrimaryColor: "#123456",
      receiptAccentColor: "#ABCDEF",
      receiptBackgroundColor: "#FFFFFF",
      receiptTextColor: "#111111",
      receiptHeaderStyle: "modern",
      defaultCustomerAgreement: "Thank you for choosing Clean Laundry.",
    });

    expect(prismaMock.business.findUnique).toHaveBeenCalledWith({
      where: {
        id: "biz-1",
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        website: true,
        address: true,
        logoUrl: true,
        receiptPrimaryColor: true,
        receiptAccentColor: true,
        receiptBackgroundColor: true,
        receiptTextColor: true,
        receiptHeaderStyle: true,
        defaultCustomerAgreement: true,
      },
    });
  });

  it("throws 404 when the business does not exist", async () => {
    prismaMock.business.findUnique.mockResolvedValue(null);

    await expect(
      getBusinessBranding("missing-business"),
    ).rejects.toMatchObject({
      message: "Business not found",
      statusCode: 404,
    });
  });
});

describe("updateBusinessBranding", () => {
  it("updates only supplied branding fields", async () => {
    prismaMock.business.updateMany.mockResolvedValue({ count: 1 });

    prismaMock.business.findUnique.mockResolvedValue({
      id: "biz-1",
      name: "Clean Laundry",
      receiptPrimaryColor: "#123456",
      receiptAccentColor: "#ABCDEF",
      receiptBackgroundColor: null,
      receiptTextColor: null,
      receiptHeaderStyle: "modern",
    });

    await updateBusinessBranding("biz-1", {
      receiptPrimaryColor: "#123456",
      receiptAccentColor: "#ABCDEF",
    });

    expect(prismaMock.business.updateMany).toHaveBeenCalledWith({
      where: {
        id: "biz-1",
      },
      data: {
        receiptPrimaryColor: "#123456",
        receiptAccentColor: "#ABCDEF",
      },
    });
  });

  it("allows explicitly clearing nullable branding fields", async () => {
    prismaMock.business.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.business.findUnique.mockResolvedValue({
      id: "biz-1",
      name: "Clean Laundry",
      receiptPrimaryColor: null,
      receiptAccentColor: null,
      receiptBackgroundColor: null,
      receiptTextColor: null,
      receiptHeaderStyle: null,
    });

    await updateBusinessBranding("biz-1", {
      receiptPrimaryColor: null,
      receiptAccentColor: null,
      receiptBackgroundColor: null,
      receiptTextColor: null,
      receiptHeaderStyle: null,
    });

    expect(prismaMock.business.updateMany).toHaveBeenCalledWith({
      where: {
        id: "biz-1",
      },
      data: {
        receiptPrimaryColor: null,
        receiptAccentColor: null,
        receiptBackgroundColor: null,
        receiptTextColor: null,
        receiptHeaderStyle: null,
      },
    });
  });

  it("does not send undefined fields to Prisma", async () => {
    prismaMock.business.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.business.findUnique.mockResolvedValue({
      id: "biz-1",
      name: "Clean Laundry",
    });

    await updateBusinessBranding("biz-1", {
      receiptPrimaryColor: "#123456",
      receiptAccentColor: undefined,
      receiptBackgroundColor: undefined,
      receiptTextColor: undefined,
      receiptHeaderStyle: undefined,
    });

    expect(prismaMock.business.updateMany).toHaveBeenCalledWith({
      where: {
        id: "biz-1",
      },
      data: {
        receiptPrimaryColor: "#123456",
      },
    });
  });

  it("throws 404 when the business does not exist", async () => {
    prismaMock.business.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateBusinessBranding("missing-business", {
        receiptPrimaryColor: "#123456",
      }),
    ).rejects.toMatchObject({
      message: "Business not found",
      statusCode: 404,
    });

    expect(prismaMock.business.findUnique).not.toHaveBeenCalled();
  });
});


describe("setBusinessLogo", () => {
  it("persists the authenticated business logo URL", async () => {
    prismaMock.business.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.business.findUnique.mockResolvedValue({
      id: "biz-1",
      name: "Clean Laundry",
      logoUrl: "http://localhost:4000/api/v1/businesses/logo",
    });

    const result = await setBusinessLogo(
      "biz-1",
      "http://localhost:4000/api/v1/businesses/logo",
    );

    expect(result.logoUrl).toBe(
      "http://localhost:4000/api/v1/businesses/logo",
    );

    expect(prismaMock.business.updateMany).toHaveBeenCalledWith({
      where: { id: "biz-1" },
      data: {
        logoUrl: "http://localhost:4000/api/v1/businesses/logo",
      },
    });
  });

  it("throws 404 when the business does not exist", async () => {
    prismaMock.business.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      setBusinessLogo("missing-business", "http://localhost:4000/api/v1/businesses/logo"),
    ).rejects.toMatchObject({
      message: "Business not found",
      statusCode: 404,
    });
  });
});

describe("clearBusinessLogo", () => {
  it("clears only the authenticated business logo URL", async () => {
    prismaMock.business.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.business.findUnique.mockResolvedValue({
      id: "biz-1",
      name: "Clean Laundry",
      logoUrl: null,
    });

    const result = await clearBusinessLogo("biz-1");

    expect(result.logoUrl).toBeNull();

    expect(prismaMock.business.updateMany).toHaveBeenCalledWith({
      where: { id: "biz-1" },
      data: {
        logoUrl: null,
      },
    });
  });
});
