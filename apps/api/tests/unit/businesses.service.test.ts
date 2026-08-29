import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    business: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  getBusinessBranding,
  updateBusinessBranding,
} from "../../src/modules/businesses/businesses.service.js";
import { AppError } from "../../src/middleware/error-handler.js";

beforeEach(() => {
  vi.clearAllMocks();
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
