import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  subscriptionPaymentIntent: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
}));

const auditMock = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(),
}));

const paymentConfigMock = vi.hoisted(() => ({
  validatePaymentSelection: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/lib/audit.js", () => auditMock);

vi.mock("../../src/modules/platform/payment-config.service.js", () => ({
  validatePaymentSelection: paymentConfigMock.validatePaymentSelection,
}));

import {
  getSubscriptionPaymentIntent,
  reconcileOfflineSubscriptionPayment,
} from "../../src/modules/subscriptions/subscription-payment-reconciliation.service.js";

describe("subscription payment reconciliation", () => {
  const offlineIntent = {
    id: "00000000-0000-4000-8000-000000000020",
    businessId: "business-1",
    plan: "MONTHLY",
    amount: 15000,
    currencyCode: "NGN",
    paymentReference: "LA-PAY-TEST-456",
    idempotencyKey: "offline-idempotency-123",
    origin: "OFFLINE",
    status: "CREATED",
    providerKey: null,
    paymentMethodKey: null,
    business: {
      id: "business-1",
      countryCode: "NG",
      currencyCode: "NGN",
    },
  };

  const reconciledIntent = {
    ...offlineIntent,
    origin: "ONLINE",
    providerKey: "paystack",
    paymentMethodKey: "CARD",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    paymentConfigMock.validatePaymentSelection.mockResolvedValue({
      provider: null,
      method: null,
    });
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValue(
      offlineIntent,
    );
    prismaMock.subscriptionPaymentIntent.updateMany.mockResolvedValue({
      count: 1,
    });
    prismaMock.subscriptionPaymentIntent.findUniqueOrThrow.mockResolvedValue(
      reconciledIntent,
    );
  });

  it("reconciles an offline intent into an online-verifiable intent", async () => {
    const result = await reconcileOfflineSubscriptionPayment(
      "business-1",
      {
        intentId: offlineIntent.id,
        providerKey: "paystack",
        paymentMethodKey: "CARD",
      },
      "owner-1",
      "correlation-1",
    );

    expect(
      paymentConfigMock.validatePaymentSelection,
    ).toHaveBeenCalledWith("NG", "NGN", "paystack", "CARD");

    expect(
      prismaMock.subscriptionPaymentIntent.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: offlineIntent.id,
        businessId: "business-1",
        origin: "OFFLINE",
        status: "CREATED",
      },
      data: {
        origin: "ONLINE",
        providerKey: "paystack",
        paymentMethodKey: "CARD",
        status: "CREATED",
      },
    });

    expect(result.origin).toBe("ONLINE");
    expect(result.providerKey).toBe("paystack");
    expect(auditMock.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "subscription.payment_intent.reconciled",
        businessId: "business-1",
      }),
    );
  });

  it("returns the same intent for an idempotent repeat with the same payment selection", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValueOnce({
      ...reconciledIntent,
    });

    const result = await reconcileOfflineSubscriptionPayment(
      "business-1",
      {
        intentId: reconciledIntent.id,
        providerKey: "paystack",
        paymentMethodKey: "CARD",
        reason: "Offline payment reconciliation test reason",
      },
    );

    expect(result).toEqual(reconciledIntent);
    expect(
      paymentConfigMock.validatePaymentSelection,
    ).not.toHaveBeenCalled();
    expect(
      prismaMock.subscriptionPaymentIntent.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("rejects an intent belonging to another business", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValueOnce({
      ...offlineIntent,
      businessId: "business-2",
    });

    await expect(
      reconcileOfflineSubscriptionPayment(
        "business-1",
        {
          intentId: offlineIntent.id,
          providerKey: "paystack",
          paymentMethodKey: "CARD",
        },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects a non-offline intent with a different payment selection", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValueOnce(
      reconciledIntent,
    );

    await expect(
      reconcileOfflineSubscriptionPayment(
        "business-1",
        {
          intentId: reconciledIntent.id,
          providerKey: "paystack",
          paymentMethodKey: "BANK_TRANSFER",
        },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects offline intents that are no longer in CREATED state", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValueOnce({
      ...offlineIntent,
      status: "FAILED",
    });

    await expect(
      reconcileOfflineSubscriptionPayment(
        "business-1",
        {
          intentId: offlineIntent.id,
          providerKey: "paystack",
          paymentMethodKey: "CARD",
        reason: "Offline payment reconciliation test reason",
        },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(
      paymentConfigMock.validatePaymentSelection,
    ).not.toHaveBeenCalled();
  });

  it("loads a payment intent only within the requesting business", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValueOnce(
      offlineIntent,
    );

    const result = await getSubscriptionPaymentIntent(
      "business-1",
      offlineIntent.id,
    );

    expect(result).toEqual(offlineIntent);
  });

  it("rejects payment-intent lookup across businesses", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValueOnce({
      ...offlineIntent,
      businessId: "business-2",
    });

    await expect(
      getSubscriptionPaymentIntent("business-1", offlineIntent.id),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
