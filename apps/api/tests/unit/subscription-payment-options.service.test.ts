import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    business: {
      findUnique: vi.fn(),
    },
    paymentProviderConfig: {
      findMany: vi.fn(),
    },
    paymentMethodConfig: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  getSubscriptionPaymentOptions,
} from "../../src/modules/subscriptions/subscription-payment-options.service.js";

describe("subscription payment options service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only enabled provider and method options supported by the business", async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      countryCode: "ng",
      currencyCode: "ngn",
    });

    prismaMock.paymentProviderConfig.findMany.mockResolvedValue([
      {
        providerKey: "paystack",
        displayName: "Paystack",
        enabled: true,
        supportedCountries: ["NG"],
        supportedCurrencies: ["NGN"],
        supportedMethods: ["CARD", "BANK_TRANSFER"],
        displayOrder: 1,
      },
      {
        providerKey: "unsupported",
        displayName: "Unsupported Provider",
        enabled: true,
        supportedCountries: ["GH"],
        supportedCurrencies: ["GHS"],
        supportedMethods: ["CARD"],
        displayOrder: 2,
      },
    ]);

    prismaMock.paymentMethodConfig.findMany.mockResolvedValue([
      {
        methodKey: "CARD",
        displayName: "Card",
        providerKey: "paystack",
        enabled: true,
        supportedCountries: ["NG"],
        supportedCurrencies: ["NGN"],
        displayOrder: 1,
      },
      {
        methodKey: "BANK_TRANSFER",
        displayName: "Bank Transfer",
        providerKey: "paystack",
        enabled: true,
        supportedCountries: ["NG"],
        supportedCurrencies: ["NGN"],
        displayOrder: 2,
      },
      {
        methodKey: "USSD",
        displayName: "USSD",
        providerKey: "paystack",
        enabled: true,
        supportedCountries: ["NG"],
        supportedCurrencies: ["NGN"],
        displayOrder: 3,
      },
      {
        methodKey: "GH_METHOD",
        displayName: "Ghana Method",
        providerKey: "unsupported",
        enabled: true,
        supportedCountries: ["GH"],
        supportedCurrencies: ["GHS"],
        displayOrder: 4,
      },
    ]);

    await expect(
      getSubscriptionPaymentOptions("business-1"),
    ).resolves.toEqual({
      countryCode: "NG",
      currencyCode: "NGN",
      providers: [
        {
          providerKey: "paystack",
          displayName: "Paystack",
        },
      ],
      methods: [
        {
          methodKey: "CARD",
          displayName: "Card",
          providerKey: "paystack",
        },
        {
          methodKey: "BANK_TRANSFER",
          displayName: "Bank Transfer",
          providerKey: "paystack",
        },
      ],
    });
  });

  it("keeps provider-neutral methods when they support the business", async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      countryCode: "NG",
      currencyCode: "NGN",
    });

    prismaMock.paymentProviderConfig.findMany.mockResolvedValue([]);

    prismaMock.paymentMethodConfig.findMany.mockResolvedValue([
      {
        methodKey: "MANUAL_TRANSFER",
        displayName: "Bank Transfer",
        providerKey: null,
        enabled: true,
        supportedCountries: ["NG"],
        supportedCurrencies: ["NGN"],
        displayOrder: 1,
      },
    ]);

    await expect(
      getSubscriptionPaymentOptions("business-1"),
    ).resolves.toMatchObject({
      countryCode: "NG",
      currencyCode: "NGN",
      providers: [],
      methods: [
        {
          methodKey: "MANUAL_TRANSFER",
          displayName: "Bank Transfer",
          providerKey: null,
        },
      ],
    });
  });

  it("rejects an unknown business", async () => {
    prismaMock.business.findUnique.mockResolvedValue(null);

    await expect(
      getSubscriptionPaymentOptions("missing-business"),
    ).rejects.toThrow("Business not found");
  });
});
