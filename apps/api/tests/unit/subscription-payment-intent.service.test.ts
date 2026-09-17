import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock, identityMock, pricingMock, paymentConfigMock } = vi.hoisted(() => ({
  prismaMock: {
    subscriptionPaymentIntent: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
  },
  auditMock: vi.fn(),
  identityMock: vi.fn(),
  pricingMock: vi.fn(),
  paymentConfigMock: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: auditMock,
}));

vi.mock(
  "../../src/modules/payments/business-payment-identity.service.js",
  () => ({
    ensureBusinessPaymentIdentity: identityMock,
  }),
);

vi.mock("../../src/modules/subscriptions/subscription-pricing.service.js", () => ({
  getSubscriptionPrice: pricingMock,
}));

vi.mock("../../src/modules/platform/payment-config.service.js", () => ({
  validatePaymentSelection: paymentConfigMock,
}));

import { createSubscriptionPaymentIntent } from "../../src/modules/subscriptions/subscription-payment-intent.service.js";

describe("subscription payment intent service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentConfigMock.mockResolvedValue({ provider: null, method: null });
  });

  it("creates an intent using the authoritative business price", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValue(null);
    prismaMock.business.findUnique.mockResolvedValue({
      id: "business-1",
      countryCode: "NG",
      currencyCode: "NGN",
    });
    identityMock.mockResolvedValue({
      businessId: "business-1",
      businessCode: "LA-BIZ-AAAA1111",
      paymentCode: "LA-AAAA1111",
    });
    pricingMock.mockResolvedValue({
      id: "price-1",
      plan: "MONTHLY",
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 15000,
      isActive: true,
    });
    prismaMock.subscriptionPaymentIntent.create.mockResolvedValue({
      id: "intent-1",
      businessId: "business-1",
      plan: "MONTHLY",
      amount: 15000,
      currencyCode: "NGN",
      paymentReference: "LA-PAY-AAAA1111-ABCDEF1234",
      idempotencyKey: "client-key-12345",
      origin: "ONLINE",
      status: "CREATED",
      providerKey: null,
      paymentMethodKey: null,
    });

    const result = await createSubscriptionPaymentIntent("business-1", {
      plan: "MONTHLY",
      origin: "ONLINE",
      idempotencyKey: "client-key-12345",
    });

    expect(result.amount).toBe(15000);
    expect(result.currencyCode).toBe("NGN");
    expect(result.status).toBe("CREATED");

    const createCall = prismaMock.subscriptionPaymentIntent.create.mock
      .calls[0]?.[0];

    expect(createCall.data.businessId).toBe("business-1");
    expect(createCall.data.amount).toBe(15000);
    expect(createCall.data.currencyCode).toBe("NGN");
    expect(createCall.data.paymentReference).toMatch(
      /^LA-PAY-AAAA1111-[A-F0-9]{10}$/,
    );
  });

  it("returns the existing intent for a safe retry", async () => {
    const existing = {
      id: "intent-1",
      businessId: "business-1",
      plan: "MONTHLY",
      amount: 15000,
      currencyCode: "NGN",
      idempotencyKey: "client-key-12345",
      origin: "ONLINE",
      status: "CREATED",
    };

    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValue(existing);

    await expect(
      createSubscriptionPaymentIntent("business-1", {
        plan: "MONTHLY",
        origin: "ONLINE",
        idempotencyKey: "client-key-12345",
      }),
    ).resolves.toEqual(existing);

    expect(prismaMock.business.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.subscriptionPaymentIntent.create).not.toHaveBeenCalled();
  });

  it("rejects reuse of an idempotency key by another business", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValue({
      id: "intent-1",
      businessId: "business-2",
      plan: "MONTHLY",
    });

    await expect(
      createSubscriptionPaymentIntent("business-1", {
        plan: "MONTHLY",
        origin: "ONLINE",
        idempotencyKey: "client-key-12345",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("rejects changing the plan while reusing an idempotency key", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValue({
      id: "intent-1",
      businessId: "business-1",
      plan: "YEARLY",
    });

    await expect(
      createSubscriptionPaymentIntent("business-1", {
        plan: "MONTHLY",
        origin: "ONLINE",
        idempotencyKey: "client-key-12345",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("uses offline origin without activating subscription access", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValue(null);
    prismaMock.business.findUnique.mockResolvedValue({
      id: "business-1",
      countryCode: "NG",
      currencyCode: "NGN",
    });
    identityMock.mockResolvedValue({
      businessId: "business-1",
      businessCode: "LA-BIZ-AAAA1111",
      paymentCode: "LA-AAAA1111",
    });
    pricingMock.mockResolvedValue({
      id: "price-1",
      plan: "WEEKLY",
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 5000,
      isActive: true,
    });
    prismaMock.subscriptionPaymentIntent.create.mockResolvedValue({
      id: "intent-2",
      businessId: "business-1",
      plan: "WEEKLY",
      amount: 5000,
      currencyCode: "NGN",
      status: "CREATED",
      origin: "OFFLINE",
    });

    const result = await createSubscriptionPaymentIntent("business-1", {
      plan: "WEEKLY",
      origin: "OFFLINE",
      idempotencyKey: "offline-key-12345",
    });

    expect(result.status).toBe("CREATED");
    expect(result.origin).toBe("OFFLINE");
    expect(prismaMock.subscriptionPaymentIntent.create).toHaveBeenCalledTimes(1);
  });
  it("validates the configured provider and method for online payments", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValue(null);
    prismaMock.business.findUnique.mockResolvedValue({
      id: "business-1",
      countryCode: "NG",
      currencyCode: "NGN",
    });
    identityMock.mockResolvedValue({
      businessId: "business-1",
      businessCode: "LA-BIZ-AAAA1111",
      paymentCode: "LA-AAAA1111",
    });
    pricingMock.mockResolvedValue({
      id: "price-1",
      plan: "MONTHLY",
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 15000,
      isActive: true,
    });
    prismaMock.subscriptionPaymentIntent.create.mockResolvedValue({
      id: "intent-3",
      businessId: "business-1",
      plan: "MONTHLY",
      amount: 15000,
      currencyCode: "NGN",
      paymentReference: "LA-PAY-AAAA1111-ABCDEF1234",
      idempotencyKey: "online-key-12345",
      origin: "ONLINE",
      status: "CREATED",
      providerKey: "paystack",
      paymentMethodKey: "CARD",
    });

    await createSubscriptionPaymentIntent("business-1", {
      plan: "MONTHLY",
      origin: "ONLINE",
      idempotencyKey: "online-key-12345",
      providerKey: "paystack",
      paymentMethodKey: "CARD",
    });

    expect(paymentConfigMock).toHaveBeenCalledWith(
      "NG",
      "NGN",
      "paystack",
      "CARD",
    );
  });

  it("rejects an online payment without provider and method", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValue(null);
    prismaMock.business.findUnique.mockResolvedValue({
      id: "business-1",
      countryCode: "NG",
      currencyCode: "NGN",
    });
    identityMock.mockResolvedValue({
      businessId: "business-1",
      businessCode: "LA-BIZ-AAAA1111",
      paymentCode: "LA-AAAA1111",
    });
    pricingMock.mockResolvedValue({
      id: "price-1",
      plan: "MONTHLY",
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 15000,
      isActive: true,
    });
    paymentConfigMock.mockRejectedValue(
      Object.assign(new Error("Online subscription payments require both a payment provider and payment method"), {
        statusCode: 400,
      }),
    );

    await expect(
      createSubscriptionPaymentIntent("business-1", {
        plan: "MONTHLY",
        origin: "ONLINE",
        idempotencyKey: "online-key-12346",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prismaMock.subscriptionPaymentIntent.create).not.toHaveBeenCalled();
  });

});
