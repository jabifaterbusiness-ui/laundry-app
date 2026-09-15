import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, hashPasswordMock, issueTokenPairMock } = vi.hoisted(() => ({
  prismaMock: {
    business: {
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    user: {
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    branch: {
      create: vi.fn(),
    },
    userBranch: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  hashPasswordMock: vi.fn(),
  issueTokenPairMock: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/modules/auth/auth.service.js", () => ({
  hashPassword: hashPasswordMock,
  issueTokenPair: issueTokenPairMock,
}));

import { completeSetup, getSetupStatus } from "../../src/modules/setup/setup.service.js";

const input = {
  businessName: "Fresh Press Laundry",
  businessPhone: "+2348012345678",
  businessEmail: "hello@freshpress.example",
  businessWebsite: "https://freshpress.example",
  businessAddress: "12 Independence Avenue",
  countryCode: "NG",
  currencyCode: "NGN",
  timezone: "Africa/Lagos",
  locale: "en-NG",
  ownerName: "Peter Jabi",
  ownerEmail: "owner@freshpress.example",
  password: "password123",
  branchName: "Main Branch",
};

beforeEach(() => {
  vi.clearAllMocks();

  prismaMock.business.count.mockResolvedValue(0);
  prismaMock.user.count.mockResolvedValue(0);
  prismaMock.business.findUnique.mockResolvedValue(null);
  prismaMock.user.findUnique.mockResolvedValue(null);
  hashPasswordMock.mockResolvedValue("hashed-password");

  prismaMock.$transaction.mockImplementation(async (callback) =>
    callback({
      business: {
        create: prismaMock.business.create,
      },
      branch: {
        create: prismaMock.branch.create,
      },
      user: {
        create: prismaMock.user.create,
      },
      userBranch: {
        create: prismaMock.userBranch.create,
      },
    }),
  );

  prismaMock.business.create.mockResolvedValue({
    id: "business-1",
    name: input.businessName,
    slug: "fresh-press-laundry",
    phone: input.businessPhone,
    email: input.businessEmail,
    website: input.businessWebsite,
    address: input.businessAddress,
    isActive: true,
  });

  prismaMock.branch.create.mockResolvedValue({
    id: "branch-1",
    businessId: "business-1",
    name: input.branchName,
    isActive: true,
  });

  prismaMock.user.create.mockResolvedValue({
    id: "user-1",
    email: input.ownerEmail,
    fullName: input.ownerName,
    role: "BUSINESS_OWNER",
    businessId: "business-1",
  });

  prismaMock.userBranch.create.mockResolvedValue({
    userId: "user-1",
    branchId: "branch-1",
  });

  issueTokenPairMock.mockResolvedValue({
    accessToken: "access-token",
    refreshToken: "refresh-token",
  });
});

describe("setup service", () => {
  it("reports setup as required only for an empty installation", async () => {
    await expect(getSetupStatus()).resolves.toEqual({
      setupRequired: true,
    });
  });

  it("creates the organisation with contact details and assigns the owner to its first branch", async () => {
    const result = await completeSetup(input);

    expect(prismaMock.business.create).toHaveBeenCalledWith({
      data: {
        name: input.businessName,
        slug: "fresh-press-laundry",
        phone: input.businessPhone,
        email: input.businessEmail,
        website: input.businessWebsite,
        address: input.businessAddress,
        countryCode: input.countryCode,
        currencyCode: input.currencyCode,
        timezone: input.timezone,
        locale: input.locale,
        isActive: true,
      },
    });

    expect(prismaMock.branch.create).toHaveBeenCalledWith({
      data: {
        businessId: "business-1",
        name: input.branchName,
        isActive: true,
      },
    });

    expect(result.user.branches).toEqual([
      {
        id: "branch-1",
        name: "Main Branch",
      },
    ]);

    expect(result.accessToken).toBe("access-token");
  });

  it("stores omitted optional organisation details as null", async () => {
    await completeSetup({
      ...input,
      businessPhone: "",
      businessEmail: "",
      businessWebsite: "",
      businessAddress: "",
    });

    expect(prismaMock.business.create).toHaveBeenCalledWith({
      data: {
        name: input.businessName,
        slug: "fresh-press-laundry",
        phone: null,
        email: null,
        website: null,
        address: null,
        countryCode: input.countryCode,
        currencyCode: input.currencyCode,
        timezone: input.timezone,
        locale: input.locale,
        isActive: true,
      },
    });
  });

  it("stores custom organisation market settings", async () => {
    await completeSetup({
      ...input,
      countryCode: "GB",
      currencyCode: "GBP",
      timezone: "Europe/London",
      locale: "en-GB",
    });

    expect(prismaMock.business.create).toHaveBeenCalledWith({
      data: {
        name: input.businessName,
        slug: "fresh-press-laundry",
        phone: input.businessPhone,
        email: input.businessEmail,
        website: input.businessWebsite,
        address: input.businessAddress,
        countryCode: "GB",
        currencyCode: "GBP",
        timezone: "Europe/London",
        locale: "en-GB",
        isActive: true,
      },
    });
  });

  it("rejects setup when the installation has already been initialized", async () => {
    prismaMock.business.count.mockResolvedValue(1);

    await expect(completeSetup(input)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("rejects an owner email that is already registered", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "existing-user",
    });

    await expect(completeSetup(input)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
