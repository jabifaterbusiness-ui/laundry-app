import { afterEach, describe, expect, it } from "vitest";
import {
  cacheSubscriptionBillingConfig,
  clearOfflineSubscriptionPaymentQueue,
  enqueueOfflineSubscriptionPayment,
  getCachedSubscriptionBillingConfig,
  listOfflineSubscriptionPayments,
  updateOfflineSubscriptionPayment,
} from "../src/lib/offline-subscription-payment-queue.js";

const BUSINESS_ID = "business-1";

afterEach(async () => {
  await clearOfflineSubscriptionPaymentQueue(BUSINESS_ID);
});

describe("offline-subscription-payment-queue", () => {
  it("stores an offline subscription payment durably", async () => {
    const entry = await enqueueOfflineSubscriptionPayment({
      businessId: BUSINESS_ID,
      actorUserId: "owner-1",
      plan: "MONTHLY",
      amount: 15000,
      currencyCode: "NGN",
      providerKey: "paystack",
      paymentMethodKey: "CARD",
      idempotencyKey: "offline-payment-123",
      reason: "Offline subscription payment test reason",
    });

    expect(entry.id).toBeTypeOf("number");
    expect(entry.status).toBe("PENDING");

    const pending = await listOfflineSubscriptionPayments(
      BUSINESS_ID,
      "PENDING",
    );

    expect(pending).toHaveLength(1);
    expect(pending[0]?.plan).toBe("MONTHLY");
  });

  it("does not duplicate the same business payment idempotency key", async () => {
    const first = await enqueueOfflineSubscriptionPayment({
      businessId: BUSINESS_ID,
      actorUserId: "owner-1",
      plan: "MONTHLY",
      amount: 15000,
      currencyCode: "NGN",
      providerKey: "paystack",
      paymentMethodKey: "CARD",
      idempotencyKey: "offline-payment-456",
      reason: "Offline subscription payment duplicate test reason",
    });

    const second = await enqueueOfflineSubscriptionPayment({
      businessId: BUSINESS_ID,
      actorUserId: "owner-1",
      plan: "MONTHLY",
      amount: 15000,
      currencyCode: "NGN",
      providerKey: "paystack",
      paymentMethodKey: "CARD",
      idempotencyKey: "offline-payment-456",
      reason: "Offline subscription payment duplicate test reason",
    });

    expect(second.id).toBe(first.id);

    const all = await listOfflineSubscriptionPayments(BUSINESS_ID);
    expect(all).toHaveLength(1);
  });

  it("updates the queued state without losing payment details", async () => {
    const entry = await enqueueOfflineSubscriptionPayment({
      businessId: BUSINESS_ID,
      actorUserId: "owner-1",
      plan: "YEARLY",
      amount: 80000,
      currencyCode: "NGN",
      providerKey: "paystack",
      paymentMethodKey: "BANK_TRANSFER",
      idempotencyKey: "offline-payment-789",
      reason: "Offline subscription payment update test reason",
    });

    await updateOfflineSubscriptionPayment(entry.id!, {
      status: "READY",
      intentId: "intent-1",
      paymentReference: "LA-PAY-TEST-789",
      providerCheckoutUrl: "https://example.com/pay",
    });

    const ready = await listOfflineSubscriptionPayments(
      BUSINESS_ID,
      "READY",
    );

    expect(ready[0]).toMatchObject({
      plan: "YEARLY",
      status: "READY",
      intentId: "intent-1",
      paymentReference: "LA-PAY-TEST-789",
      providerCheckoutUrl: "https://example.com/pay",
    });
  });

  it("caches authoritative billing configuration for offline use", async () => {
    await cacheSubscriptionBillingConfig({
      businessId: BUSINESS_ID,
      countryCode: "NG",
      currencyCode: "NGN",
      prices: [
        {
          id: "price-1",
          plan: "MONTHLY",
          countryCode: "NG",
          currencyCode: "NGN",
          amount: 15000,
          isActive: true,
        },
      ],
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
      ],
    });

    const cached = await getCachedSubscriptionBillingConfig(BUSINESS_ID);

    expect(cached?.currencyCode).toBe("NGN");
    expect(cached?.prices[0]?.amount).toBe(15000);
    expect(cached?.providers[0]?.providerKey).toBe("paystack");
  });
});
