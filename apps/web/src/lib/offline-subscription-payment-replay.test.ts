import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class TestApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
      this.name = "ApiError";
    }
  }

  class TestNetworkError extends Error {
    constructor(message = "Unable to reach the server") {
      super(message);
      this.name = "NetworkError";
    }
  }

  return {
    createSubscriptionPaymentIntent: vi.fn(),
    initializeSubscriptionPayment: vi.fn(),
    reconcileOfflineSubscriptionPayment: vi.fn(),
    listOfflineSubscriptionPayments: vi.fn(),
    updateOfflineSubscriptionPayment: vi.fn(),
    ApiError: TestApiError,
    NetworkError: TestNetworkError,
  };
});

vi.mock("./subscriptions-api.js", () => ({
  createSubscriptionPaymentIntent: mocks.createSubscriptionPaymentIntent,
  initializeSubscriptionPayment: mocks.initializeSubscriptionPayment,
  reconcileOfflineSubscriptionPayment:
    mocks.reconcileOfflineSubscriptionPayment,
}));

vi.mock("./offline-subscription-payment-queue.js", () => ({
  listOfflineSubscriptionPayments: mocks.listOfflineSubscriptionPayments,
  updateOfflineSubscriptionPayment:
    mocks.updateOfflineSubscriptionPayment,
}));

vi.mock("./api-client.js", () => ({
  ApiError: mocks.ApiError,
  NetworkError: mocks.NetworkError,
}));

import { replayOfflineSubscriptionPaymentQueue } from "./offline-subscription-payment-replay.js";

function makeEntry(overrides = {}) {
  return {
    id: 1,
    businessId: "business-1",
    actorUserId: "owner-1",
    plan: "MONTHLY" as const,
    amount: 15000,
    currencyCode: "NGN",
    providerKey: "paystack",
    paymentMethodKey: "CARD",
    idempotencyKey: "offline-payment-123",
    status: "PENDING" as const,
    intentId: null,
    paymentReference: null,
    providerCheckoutUrl: null,
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const context = {
  businessId: "business-1",
  actorUserId: "owner-1",
  accessToken: "token",
};

beforeEach(() => {
  vi.clearAllMocks();

  mocks.listOfflineSubscriptionPayments.mockResolvedValue([]);
  mocks.updateOfflineSubscriptionPayment.mockResolvedValue(undefined);
});

describe("replayOfflineSubscriptionPaymentQueue", () => {
  it("syncs an offline payment into a ready provider checkout", async () => {
    const entry = makeEntry();
    mocks.listOfflineSubscriptionPayments.mockResolvedValue([entry]);

    mocks.createSubscriptionPaymentIntent.mockResolvedValue({
      id: "intent-1",
      businessId: "business-1",
      plan: "MONTHLY",
      amount: 15000,
      currencyCode: "NGN",
      paymentReference: "LA-PAY-TEST-123",
      idempotencyKey: entry.idempotencyKey,
      origin: "OFFLINE",
      status: "CREATED",
      providerKey: "paystack",
      paymentMethodKey: "CARD",
      providerCheckoutReference: null,
      providerCheckoutUrl: null,
      expiresAt: null,
      createdAt: "2026-09-17T00:00:00.000Z",
      updatedAt: "2026-09-17T00:00:00.000Z",
    });

    mocks.reconcileOfflineSubscriptionPayment.mockResolvedValue({
      id: "intent-1",
      businessId: "business-1",
      plan: "MONTHLY",
      amount: 15000,
      currencyCode: "NGN",
      paymentReference: "LA-PAY-TEST-123",
      origin: "ONLINE",
      status: "CREATED",
      providerKey: "paystack",
      paymentMethodKey: "CARD",
    });

    mocks.initializeSubscriptionPayment.mockResolvedValue({
      id: "intent-1",
      paymentReference: "LA-PAY-TEST-123",
      providerCheckoutUrl: "https://example.com/pay/123",
      status: "PENDING",
    });

    const result = await replayOfflineSubscriptionPaymentQueue(context);

    expect(result).toEqual({
      processed: 1,
      ready: 1,
      completed: 0,
      failed: 0,
    });

    expect(mocks.createSubscriptionPaymentIntent).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        plan: "MONTHLY",
        origin: "OFFLINE",
        idempotencyKey: entry.idempotencyKey,
        providerKey: "paystack",
        paymentMethodKey: "CARD",
      }),
    );

    expect(mocks.reconcileOfflineSubscriptionPayment).toHaveBeenCalledWith(
      "token",
      {
        intentId: "intent-1",
        providerKey: "paystack",
        paymentMethodKey: "CARD",
      },
    );

    expect(mocks.initializeSubscriptionPayment).toHaveBeenCalledWith(
      "token",
      "intent-1",
    );

    expect(mocks.updateOfflineSubscriptionPayment).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({
        status: "READY",
        intentId: "intent-1",
        providerCheckoutUrl: "https://example.com/pay/123",
      }),
    );
  });

  it("fails safely when the authoritative price changed while offline", async () => {
    const entry = makeEntry();
    mocks.listOfflineSubscriptionPayments.mockResolvedValue([entry]);

    mocks.createSubscriptionPaymentIntent.mockResolvedValue({
      id: "intent-2",
      amount: 16000,
      currencyCode: "NGN",
      paymentReference: "LA-PAY-TEST-456",
    });

    const result = await replayOfflineSubscriptionPaymentQueue(context);

    expect(result.failed).toBe(1);
    expect(mocks.reconcileOfflineSubscriptionPayment).not.toHaveBeenCalled();
    expect(mocks.initializeSubscriptionPayment).not.toHaveBeenCalled();
    expect(mocks.updateOfflineSubscriptionPayment).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({
        status: "FAILED",
      }),
    );
  });

  it("returns temporary network failures to PENDING", async () => {
    const entry = makeEntry();
    mocks.listOfflineSubscriptionPayments.mockResolvedValue([entry]);
    mocks.createSubscriptionPaymentIntent.mockRejectedValue(
      new mocks.NetworkError(),
    );

    const result = await replayOfflineSubscriptionPaymentQueue(context);

    expect(result.failed).toBe(1);
    expect(mocks.updateOfflineSubscriptionPayment).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({
        status: "PENDING",
      }),
    );
  });

  it("marks a verified already-successful intent as completed", async () => {
    const entry = makeEntry();
    mocks.listOfflineSubscriptionPayments.mockResolvedValue([entry]);

    mocks.createSubscriptionPaymentIntent.mockResolvedValue({
      id: "intent-3",
      amount: 15000,
      currencyCode: "NGN",
      paymentReference: "LA-PAY-TEST-789",
    });

    mocks.reconcileOfflineSubscriptionPayment.mockResolvedValue({
      id: "intent-3",
      status: "SUCCESSFUL",
      paymentReference: "LA-PAY-TEST-789",
      amount: 15000,
      currencyCode: "NGN",
    });

    const result = await replayOfflineSubscriptionPaymentQueue(context);

    expect(result.completed).toBe(1);
    expect(mocks.initializeSubscriptionPayment).not.toHaveBeenCalled();
    expect(mocks.updateOfflineSubscriptionPayment).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({
        status: "COMPLETED",
        intentId: "intent-3",
        paymentReference: "LA-PAY-TEST-789",
      }),
    );
  });
});
