import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  paymentWebhookEvent: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  subscriptionPaymentIntent: {
    findUnique: vi.fn(),
  },
}));

const verifyPaymentMock = vi.hoisted(() => ({
  verifySubscriptionPayment: vi.fn(),
}));

const configMock = vi.hoisted(() => ({
  log: {
    level: "silent",
  },
  isProduction: false,
  paymentProviders: {
    paystack: {
      secretKey: "test-paystack-secret",
    },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/config/index.js", () => ({
  config: configMock,
}));

vi.mock(
  "../../src/modules/subscriptions/subscription-payment-verification.service.js",
  () => verifyPaymentMock,
);

import { processPaystackWebhook } from "../../src/modules/subscriptions/subscription-payment-webhook.service.js";

describe("processPaystackWebhook", () => {
  const intent = {
    id: "00000000-0000-4000-8000-000000000010",
    businessId: "business-1",
    providerKey: "paystack",
    origin: "ONLINE",
  };

  function createPayload(
    event = "charge.success",
    data: Record<string, unknown> = {
      id: 123456,
      reference: "LA-PAY-TEST-123",
      amount: 1500000,
      currency: "NGN",
    },
  ) {
    return Buffer.from(
      JSON.stringify({
        event,
        data,
      }),
    );
  }

  function sign(body: Buffer) {
    return createHmac("sha512", configMock.paymentProviders.paystack.secretKey)
      .update(body)
      .digest("hex");
  }

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.paymentWebhookEvent.findUnique.mockResolvedValue(null);

    prismaMock.paymentWebhookEvent.create.mockResolvedValue({
      id: "webhook-1",
      businessId: null,
      providerKey: "paystack",
      providerEventId: "123456",
      eventType: "charge.success",
      processed: false,
    });

    prismaMock.paymentWebhookEvent.update.mockResolvedValue({
      id: "webhook-1",
      businessId: "business-1",
      providerKey: "paystack",
      providerEventId: "123456",
      eventType: "charge.success",
      processed: true,
    });

    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValue(intent);

    verifyPaymentMock.verifySubscriptionPayment.mockResolvedValue({
      alreadyProcessed: false,
      intent: {
        id: intent.id,
        status: "SUCCESSFUL",
      },
      payment: {
        id: "payment-1",
        status: "SUCCESSFUL",
      },
      subscription: {
        id: "subscription-1",
        status: "ACTIVE",
      },
    });
  });

  it("rejects a webhook with no signature", async () => {
    const body = createPayload();

    await expect(
      processPaystackWebhook(body, undefined),
    ).rejects.toThrow(/Missing Paystack webhook signature/);

    expect(prismaMock.paymentWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("rejects a webhook with an invalid signature", async () => {
    const body = createPayload();

    await expect(
      processPaystackWebhook(body, "invalid-signature"),
    ).rejects.toThrow(/Invalid Paystack webhook signature/);

    expect(prismaMock.paymentWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("processes a valid charge.success webhook and verifies the payment", async () => {
    const body = createPayload();

    const result = await processPaystackWebhook(body, sign(body));

    expect(verifyPaymentMock.verifySubscriptionPayment).toHaveBeenCalledWith(
      intent.businessId,
      intent.id,
      null,
      null,
    );

    expect(prismaMock.paymentWebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerKey: "paystack",
          providerEventId: "123456",
          eventType: "charge.success",
        }),
      }),
    );

    expect(prismaMock.paymentWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "webhook-1" },
        data: expect.objectContaining({
          businessId: "business-1",
          processed: true,
        }),
      }),
    );

    expect(result).toEqual({
      status: "processed",
      eventId: "webhook-1",
      eventType: "charge.success",
      paymentReference: "LA-PAY-TEST-123",
      paymentId: "payment-1",
      subscriptionId: "subscription-1",
    });
  });

  it("acknowledges and ignores a valid successful event for an unrelated Paystack transaction", async () => {
    prismaMock.subscriptionPaymentIntent.findUnique.mockResolvedValueOnce(null);

    prismaMock.paymentWebhookEvent.update.mockResolvedValueOnce({
      id: "webhook-unrelated",
      providerKey: "paystack",
      providerEventId: "123456",
      eventType: "charge.success",
      processed: true,
    });

    prismaMock.paymentWebhookEvent.create.mockResolvedValueOnce({
      id: "webhook-unrelated",
      businessId: null,
      providerKey: "paystack",
      providerEventId: "123456",
      eventType: "charge.success",
      processed: false,
    });

    const body = createPayload();

    const result = await processPaystackWebhook(body, sign(body));

    expect(result).toEqual({
      status: "ignored",
      eventId: "webhook-unrelated",
      eventType: "charge.success",
      paymentReference: "LA-PAY-TEST-123",
    });

    expect(verifyPaymentMock.verifySubscriptionPayment).not.toHaveBeenCalled();
    expect(prismaMock.paymentWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "webhook-unrelated" },
        data: expect.objectContaining({
          processed: true,
        }),
      }),
    );
  });

  it("returns already_processed for a duplicate webhook event", async () => {
    prismaMock.paymentWebhookEvent.findUnique.mockResolvedValueOnce({
      id: "webhook-existing",
      providerKey: "paystack",
      providerEventId: "123456",
      eventType: "charge.success",
      processed: true,
    });

    const body = createPayload();

    const result = await processPaystackWebhook(body, sign(body));

    expect(result).toEqual({
      status: "already_processed",
      eventId: "webhook-existing",
      eventType: "charge.success",
    });

    expect(verifyPaymentMock.verifySubscriptionPayment).not.toHaveBeenCalled();
    expect(prismaMock.paymentWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("records and ignores non-success Paystack events", async () => {
    const body = createPayload("charge.failed");

    prismaMock.paymentWebhookEvent.findUnique.mockReset();
    prismaMock.paymentWebhookEvent.findUnique.mockResolvedValue(null);

    prismaMock.paymentWebhookEvent.create.mockReset();
    prismaMock.paymentWebhookEvent.create.mockResolvedValue({
      id: "webhook-failed",
      providerKey: "paystack",
      providerEventId: "123456",
      eventType: "charge.failed",
      processed: false,
    });

    prismaMock.paymentWebhookEvent.update.mockResolvedValue({
      id: "webhook-failed",
      providerKey: "paystack",
      providerEventId: "123456",
      eventType: "charge.failed",
      processed: true,
    });

    const result = await processPaystackWebhook(body, sign(body));

    expect(result).toEqual({
      status: "ignored",
      eventId: "webhook-failed",
      eventType: "charge.failed",
    });

    expect(verifyPaymentMock.verifySubscriptionPayment).not.toHaveBeenCalled();
    expect(prismaMock.paymentWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "webhook-failed" },
        data: expect.objectContaining({
          processed: true,
        }),
      }),
    );
  });
});
