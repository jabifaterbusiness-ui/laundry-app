import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  subscriptionPaymentIntent: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  subscriptionPayment: {
    findUnique: vi.fn(),
  },
  subscription: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const auditMock = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(),
}));

const providerMock = vi.hoisted(() => ({
  verifyPayment: vi.fn(),
}));

const confirmationEmailMock = vi.hoisted(() => ({
  sendSubscriptionPaymentConfirmationEmail: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/lib/audit.js", () => auditMock);

vi.mock("../../src/modules/subscriptions/providers/payment-provider.registry.js", () => ({
  getSubscriptionPaymentProvider: vi.fn(() => providerMock),
}));

vi.mock(
  "../../src/modules/subscriptions/subscription-payment-confirmation-email.service.js",
  () => confirmationEmailMock,
);

import { verifySubscriptionPayment } from "../../src/modules/subscriptions/subscription-payment-verification.service.js";

describe("verifySubscriptionPayment", () => {
  const intent = {
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
  };

  const subscription = {
    id: "sub-1",
    businessId: "business-1",
    plan: "MONTHLY",
    status: "ACTIVE",
    startsAt: new Date("2026-09-17T00:00:00.000Z"),
    endsAt: new Date("2026-10-17T00:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValue(intent);

    providerMock.verifyPayment.mockResolvedValue({
      providerKey: "test-provider",
      providerTransactionId: "transaction-123",
      paymentReference: "LA-PAY-TEST-123",
      amount: 15000,
      currencyCode: "NGN",
      status: "SUCCESSFUL",
      paymentMethodKey: "card",
      receivedAt: new Date("2026-09-17T10:00:00.000Z"),
    });

    prismaMock.subscriptionPayment.findUnique.mockResolvedValue(null);
    prismaMock.subscription.findUnique.mockResolvedValue(subscription);

    confirmationEmailMock.sendSubscriptionPaymentConfirmationEmail.mockResolvedValue({
      sent: true,
      skipped: false,
      messageId: "email-123",
    });

    prismaMock.$transaction.mockImplementation(async (callback) => {
      const tx = {
        subscriptionPaymentIntent: {
          findUnique: vi.fn().mockResolvedValue(intent),
          update: vi.fn().mockResolvedValue({
            ...intent,
            status: "SUCCESSFUL",
          }),
        },
        subscriptionPayment: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "payment-1",
            businessId: "business-1",
            subscriptionId: "sub-1",
            intentId: intent.id,
            paymentReference: intent.paymentReference,
            providerTransactionId: "transaction-123",
            providerKey: "test-provider",
            paymentMethodKey: "card",
            amount: 15000,
            currencyCode: "NGN",
            status: "SUCCESSFUL",
            idempotencyKey: intent.idempotencyKey,
          }),
        },
        subscription: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue(subscription),
        },
      };

      return callback(tx);
    });
  });

  it("verifies payment and atomically activates the subscription", async () => {
    const result = await verifySubscriptionPayment(
      "business-1",
      intent.id,
      "owner-1",
      "correlation-1",
    );

    expect(providerMock.verifyPayment).toHaveBeenCalledWith({
      paymentReference: intent.paymentReference,
      providerCheckoutReference: intent.providerCheckoutReference,
      expectedAmount: intent.amount,
      expectedCurrencyCode: intent.currencyCode,
    });

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(result.payment).not.toBeNull();
    expect(result.payment?.status).toBe("SUCCESSFUL");
    expect(result.subscription?.status).toBe("ACTIVE");
    expect(
      confirmationEmailMock.sendSubscriptionPaymentConfirmationEmail,
    ).toHaveBeenCalledWith(
      "payment-1",
      "owner-1",
      "correlation-1",
    );
    expect(auditMock.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "subscription.payment.verified",
        businessId: "business-1",
      }),
    );
  });

  it("rejects a payment whose amount does not match the intent", async () => {
    providerMock.verifyPayment.mockResolvedValueOnce({
      providerKey: "test-provider",
      providerTransactionId: "transaction-123",
      paymentReference: intent.paymentReference,
      amount: 14000,
      currencyCode: "NGN",
      status: "SUCCESSFUL",
    });

    await expect(
      verifySubscriptionPayment("business-1", intent.id),
    ).rejects.toThrow(/amount or currency does not match/);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a payment whose reference does not match", async () => {
    providerMock.verifyPayment.mockResolvedValueOnce({
      providerKey: "test-provider",
      providerTransactionId: "transaction-123",
      paymentReference: "WRONG-REFERENCE",
      amount: 15000,
      currencyCode: "NGN",
      status: "SUCCESSFUL",
    });

    await expect(
      verifySubscriptionPayment("business-1", intent.id),
    ).rejects.toThrow(/payment reference does not match/);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("keeps the intent pending when the provider has not completed payment", async () => {
    providerMock.verifyPayment.mockResolvedValueOnce({
      providerKey: "test-provider",
      providerTransactionId: "transaction-123",
      paymentReference: intent.paymentReference,
      amount: 15000,
      currencyCode: "NGN",
      status: "PENDING",
    });

    prismaMock.subscriptionPaymentIntent.update.mockResolvedValue({
      ...intent,
      status: "PENDING",
    });

    const result = await verifySubscriptionPayment(
      "business-1",
      intent.id,
    );

    expect(result.intent.status).toBe("PENDING");
    expect(result.payment).toBeNull();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("does not activate access when the provider reports failure", async () => {
    providerMock.verifyPayment.mockResolvedValueOnce({
      providerKey: "test-provider",
      providerTransactionId: "transaction-123",
      paymentReference: intent.paymentReference,
      amount: 15000,
      currencyCode: "NGN",
      status: "FAILED",
    });

    prismaMock.subscriptionPaymentIntent.update.mockResolvedValue({
      ...intent,
      status: "FAILED",
    });

    const result = await verifySubscriptionPayment(
      "business-1",
      intent.id,
    );

    expect(result.intent.status).toBe("FAILED");
    expect(result.payment).toBeNull();
    expect(result.subscription).toBeNull();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns an already successful payment without processing it again", async () => {
    const payment = {
      id: "payment-existing",
      intentId: intent.id,
      status: "SUCCESSFUL",
      paymentReference: intent.paymentReference,
      confirmationEmailSentAt: new Date("2026-09-17T10:01:00.000Z"),
      confirmationEmailProviderMessageId: "email-existing",
    };

    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce(payment);

    const result = await verifySubscriptionPayment(
      "business-1",
      intent.id,
    );

    expect(result.alreadyProcessed).toBe(true);
    expect(result.payment).toBe(payment);
    expect(providerMock.verifyPayment).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(
      confirmationEmailMock.sendSubscriptionPaymentConfirmationEmail,
    ).toHaveBeenCalledWith(
      "payment-existing",
      undefined,
      undefined,
    );
  });

  it("retries a serialization conflict and does not duplicate the payment", async () => {
    const originalTransaction = prismaMock.$transaction.getMockImplementation();

    let calls = 0;
    prismaMock.$transaction.mockImplementation(async (callback) => {
      calls += 1;

      if (calls === 1) {
        throw new Prisma.PrismaClientKnownRequestError(
          "serialization conflict",
          {
            code: "P2034",
            clientVersion: "5.22.0",
          },
        );
      }

      const tx = {
        subscriptionPaymentIntent: {
          findUnique: vi.fn().mockResolvedValue(intent),
          update: vi.fn().mockResolvedValue({
            ...intent,
            status: "SUCCESSFUL",
          }),
        },
        subscriptionPayment: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "payment-retry",
            businessId: "business-1",
            subscriptionId: "sub-1",
            intentId: intent.id,
            paymentReference: intent.paymentReference,
            providerTransactionId: "transaction-123",
            providerKey: "test-provider",
            paymentMethodKey: "card",
            amount: 15000,
            currencyCode: "NGN",
            status: "SUCCESSFUL",
            idempotencyKey: intent.idempotencyKey,
          }),
        },
        subscription: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue(subscription),
        },
      };

      return callback(tx);
    });

    const result = await verifySubscriptionPayment(
      "business-1",
      intent.id,
    );

    expect(calls).toBe(2);
    expect(result.payment?.id).toBe("payment-retry");

    if (originalTransaction) {
      prismaMock.$transaction.mockImplementation(originalTransaction);
    }
  });

  it("does not fail successful payment verification when confirmation email delivery fails", async () => {
    confirmationEmailMock.sendSubscriptionPaymentConfirmationEmail.mockResolvedValueOnce({
      sent: false,
      skipped: false,
    });

    const result = await verifySubscriptionPayment(
      "business-1",
      intent.id,
    );

    expect(result.payment?.status).toBe("SUCCESSFUL");
    expect(result.subscription?.status).toBe("ACTIVE");
    expect(
      confirmationEmailMock.sendSubscriptionPaymentConfirmationEmail,
    ).toHaveBeenCalledWith(
      "payment-1",
      undefined,
      undefined,
    );
  });
});
