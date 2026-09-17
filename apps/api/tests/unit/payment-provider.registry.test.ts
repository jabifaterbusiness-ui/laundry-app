import { beforeEach, describe, expect, it } from "vitest";
import {
  getSubscriptionPaymentProvider,
  listSubscriptionPaymentProviders,
  registerSubscriptionPaymentProvider,
} from "../../src/modules/subscriptions/providers/payment-provider.registry.js";
import type { SubscriptionPaymentProvider } from "../../src/modules/subscriptions/providers/payment-provider.types.js";

describe("subscription payment provider registry", () => {
  const provider: SubscriptionPaymentProvider = {
    providerKey: "test-provider",
    initializePayment: async () => ({
      providerKey: "test-provider",
      providerCheckoutReference: "checkout-1",
      checkoutUrl: "https://example.com/checkout",
      status: "PENDING",
    }),
    verifyPayment: async () => ({
      providerKey: "test-provider",
      providerTransactionId: "transaction-1",
      amount: 15000,
      currencyCode: "NGN",
      status: "SUCCESSFUL",
    }),
  };

  beforeEach(() => {
    // The registry intentionally has process lifetime scope.
    // Re-registering the same provider replaces the previous implementation.
    registerSubscriptionPaymentProvider(provider);
  });

  it("registers and retrieves a provider", () => {
    expect(getSubscriptionPaymentProvider("test-provider")).toBe(provider);
  });

  it("replaces an existing provider with the same key", () => {
    const replacement = { ...provider };
    registerSubscriptionPaymentProvider(replacement);

    expect(getSubscriptionPaymentProvider("test-provider")).toBe(replacement);
  });

  it("rejects an unknown provider", () => {
    expect(() =>
      getSubscriptionPaymentProvider("missing-provider"),
    ).toThrowError(/not configured/);
  });

  it("lists registered providers", () => {
    expect(
      listSubscriptionPaymentProviders().some(
        (item) => item.providerKey === "test-provider",
      ),
    ).toBe(true);
  });
});
