import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  subscriptionPaymentIntent: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const auditMock = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(),
}));

const providerMock = vi.hoisted(() => ({
  initializePayment: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/lib/audit.js", () => auditMock);

vi.mock("../../src/modules/subscriptions/providers/payment-provider.registry.js", () => ({
  getSubscriptionPaymentProvider: vi.fn(() => providerMock),
}));

import { initializeSubscriptionPayment } from "../../src/modules/subscriptions/subscription-payment-initialization.service.js";

describe("initializeSubscriptionPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000010",
      businessId: "business-1",
      plan: "MONTHLY",
      amount: 15000,
      currencyCode: "NGN",
      paymentReference: "LA-PAY-TEST-123",
      idempotencyKey: "idempotency-123",
      origin: "ONLINE",
      status: "CREATED",
      providerKey: "test-provider",
      paymentMethodKey: "card",
      providerCheckoutReference: null,
      business: {
        id: "business-1",
        name: "Test Laundry",
        email: "owner@example.com",
      },
    });

    providerMock.initializePayment.mockResolvedValue({
      providerKey: "test-provider",
      providerCheckoutReference: "checkout-123",
      checkoutUrl: "https://example.com/checkout/123",
      status: "PENDING",
    });

    prismaMock.subscriptionPaymentIntent.update.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000010",
      businessId: "business-1",
      plan: "MONTHLY",
      amount: 15000,
      currencyCode: "NGN",
      paymentReference: "LA-PAY-TEST-123",
      idempotencyKey: "idempotency-123",
      origin: "ONLINE",
      status: "PENDING",
      providerKey: "test-provider",
      paymentMethodKey: "card",
      providerCheckoutReference: "checkout-123",
      providerCheckoutUrl: "https://example.com/checkout/123",
    });
  });

  it("initializes an online payment and stores the checkout reference", async () => {
    const result = await initializeSubscriptionPayment(
      "business-1",
      "00000000-0000-4000-8000-000000000010",
      "owner-1",
      "correlation-1",
    );

    expect(providerMock.initializePayment).toHaveBeenCalledWith({
      businessId: "business-1",
      paymentReference: "LA-PAY-TEST-123",
      plan: "MONTHLY",
      amount: 15000,
      currencyCode: "NGN",
      paymentMethodKey: "card",
      customerEmail: "owner@example.com",
      customerName: "Test Laundry",
      callbackUrl:
        "http://localhost:5173/subscriptions?payment_intent=00000000-0000-4000-8000-000000000010",
    });

    expect(prismaMock.subscriptionPaymentIntent.update).toHaveBeenCalledWith({
      where: {
        id: "00000000-0000-4000-8000-000000000010",
      },
      data: {
        providerCheckoutReference: "checkout-123",
        providerCheckoutUrl: "https://example.com/checkout/123",
        status: "PENDING",
      },
    });

    expect(auditMock.recordAuditEvent).toHaveBeenCalled();
    expect(result.status).toBe("PENDING");
  });

  it("returns an existing pending checkout without creating another provider payment", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValueOnce({
      id: "00000000-0000-4000-8000-000000000010",
      businessId: "business-1",
      plan: "MONTHLY",
      amount: 15000,
      currencyCode: "NGN",
      paymentReference: "LA-PAY-TEST-123",
      idempotencyKey: "idempotency-123",
      origin: "ONLINE",
      status: "PENDING",
      providerKey: "test-provider",
      paymentMethodKey: "card",
      providerCheckoutReference: "checkout-existing",
      business: {
        id: "business-1",
        name: "Test Laundry",
        email: "owner@example.com",
      },
    });

    const result = await initializeSubscriptionPayment(
      "business-1",
      "00000000-0000-4000-8000-000000000010",
    );

    expect(result.providerCheckoutReference).toBe("checkout-existing");
    expect(providerMock.initializePayment).not.toHaveBeenCalled();
    expect(prismaMock.subscriptionPaymentIntent.update).not.toHaveBeenCalled();
  });

  it("rejects an intent belonging to another business", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValueOnce({
      id: "00000000-0000-4000-8000-000000000010",
      businessId: "business-2",
      origin: "ONLINE",
    });

    await expect(
      initializeSubscriptionPayment(
        "business-1",
        "00000000-0000-4000-8000-000000000010",
      ),
    ).rejects.toThrow(/another business/);

    expect(providerMock.initializePayment).not.toHaveBeenCalled();
  });

  it("rejects offline intents", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValueOnce({
      id: "00000000-0000-4000-8000-000000000010",
      businessId: "business-1",
      origin: "OFFLINE",
    });

    await expect(
      initializeSubscriptionPayment(
        "business-1",
        "00000000-0000-4000-8000-000000000010",
      ),
    ).rejects.toThrow(/Offline subscription payment intents/);

    expect(providerMock.initializePayment).not.toHaveBeenCalled();
  });

  it("rejects a provider response with the wrong provider identity", async () => {
    providerMock.initializePayment.mockResolvedValueOnce({
      providerKey: "different-provider",
      providerCheckoutReference: "checkout-123",
      status: "PENDING",
    });

    await expect(
      initializeSubscriptionPayment(
        "business-1",
        "00000000-0000-4000-8000-000000000010",
      ),
    ).rejects.toThrow(/unexpected provider identity/);

    expect(prismaMock.subscriptionPaymentIntent.update).not.toHaveBeenCalled();
  });
});
