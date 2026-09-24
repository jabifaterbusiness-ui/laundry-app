import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  hashPasswordMock,
  issueTokenPairMock,
  getEffectivePermissionCodesMock,
} = vi.hoisted(() => ({
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
    subscription: {
      create: vi.fn(),
    },
    businessPaymentIdentity: {
      create: vi.fn(),
    },
    color: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  hashPasswordMock: vi.fn(),
  issueTokenPairMock: vi.fn(),
  getEffectivePermissionCodesMock: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/modules/auth/auth.service.js", () => ({
  hashPassword: hashPasswordMock,
  issueTokenPair: issueTokenPairMock,
}));

vi.mock("../../src/modules/permissions/permissions.service.js", () => ({
  getEffectivePermissionCodes: getEffectivePermissionCodesMock,
}));

import { completeSetup, getSetupStatus } from "../../src/modules/setup/setup.service.js";

import { getEffectivePermissionCodes } from "../../src/modules/permissions/permissions.service.js";

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
      subscription: {
        create: prismaMock.subscription.create,
      },
      businessPaymentIdentity: {
        create: prismaMock.businessPaymentIdentity.create,
      },
      color: {
        createMany: prismaMock.color.createMany,
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
        securityRole: "BUSINESS_OWNER",
    businessId: "business-1",
  });

  prismaMock.userBranch.create.mockResolvedValue({
    userId: "user-1",
    branchId: "branch-1",
  });

  prismaMock.subscription.create.mockImplementation(async ({ data }) => ({
    id: "subscription-1",
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  prismaMock.businessPaymentIdentity.create.mockImplementation(async ({ data }) => ({
    id: "payment-identity-1",
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  prismaMock.color.createMany.mockResolvedValue({
    count: 26,
  });

  issueTokenPairMock.mockResolvedValue({
    accessToken: "access-token",
    refreshToken: "refresh-token",
  });

  getEffectivePermissionCodesMock.mockResolvedValue([
    "orders.view",
    "orders.create",
  ]);
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

    expect(prismaMock.businessPaymentIdentity.create).toHaveBeenCalledTimes(1);

    const paymentIdentityCreateCall =
      prismaMock.businessPaymentIdentity.create.mock.calls[0]?.[0];

    expect(paymentIdentityCreateCall).toEqual({
      data: {
        businessId: "business-1",
        businessCode: expect.stringMatching(/^LA-BIZ-[A-Z0-9]{8}$/),
        paymentCode: expect.stringMatching(/^LA-[A-Z0-9]{8}$/),
      },
    });

    expect(prismaMock.branch.create).toHaveBeenCalledWith({
      data: {
        businessId: "business-1",
        name: input.branchName,
        isActive: true,
      },
    });

    const subscriptionCreateCall =
      prismaMock.subscription.create.mock.calls[0]?.[0];

    expect(subscriptionCreateCall).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "business-1",
          plan: "MONTHLY",
          status: "ACTIVE",
        }),
      }),
    );

    const subscriptionData = subscriptionCreateCall?.data as
      | { startsAt: Date; endsAt: Date }
      | undefined;

    expect(subscriptionData).toBeDefined();

    if (subscriptionData) {
      const expectedEnd = new Date(subscriptionData.startsAt);
      expectedEnd.setMonth(expectedEnd.getMonth() + 1);

      expect(subscriptionData.endsAt).toEqual(expectedEnd);
    }

    expect(result.user.branches).toEqual([
      {
        id: "branch-1",
        name: "Main Branch",
      },
    ]);

    expect(result.accessToken).toBe("access-token");
    expect(result.user.permissions).toEqual([
      "orders.view",
      "orders.create",
    ]);
    expect(getEffectivePermissionCodesMock).toHaveBeenCalledWith(
      "business-1",
      "user-1",
      "BUSINESS_OWNER",
    );
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
