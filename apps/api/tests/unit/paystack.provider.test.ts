import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/index.js", () => ({
  config: {
    env: "test",
    isProduction: false,
    isTest: true,
    port: 4000,
    appUrl: "http://localhost:4000",
    webAppUrl: "http://localhost:5173",
    cors: {
      origin: "http://localhost:5173",
    },
    auth: {
      accessTokenSecret: "test-access-secret",
      refreshTokenSecret: "test-refresh-secret",
      accessTokenExpiresIn: "15m",
      refreshTokenExpiresIn: "7d",
    },
    log: {
      level: "silent",
    },
    migrations: {
      storageDir: "./data/migrations",
      storageKey: "test-migration-storage-key",
      maxUploadBytes: 250 * 1024 * 1024,
      maxUncompressedBytes: 500 * 1024 * 1024,
    },
    businessBranding: {
      storageDir: "./data/business-branding",
      maxUploadBytes: 5 * 1024 * 1024,
    },
    receiptDelivery: {
      resendApiKey: undefined,
      emailFrom: undefined,
      whatsappApiVersion: undefined,
      whatsappPhoneNumberId: undefined,
      whatsappAccessToken: undefined,
      whatsappVerifyToken: undefined,
    },
    paymentProviders: {
      paystack: {
        secretKey: "sk_test_example",
        baseUrl: "https://api.paystack.co",
      },
    },
  },
}));

import { paystackSubscriptionPaymentProvider } from "../../src/modules/subscriptions/providers/paystack.provider.js";

describe("paystack subscription payment provider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes a transaction with the expected amount, reference and channel", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          message: "Authorization URL created",
          data: {
            authorization_url: "https://checkout.paystack.com/test",
            access_code: "access-123",
            reference: "LA-PAY-123",
          },
        }),
        { status: 200 },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await paystackSubscriptionPaymentProvider.initializePayment({
      businessId: "biz-1",
      paymentReference: "LA-PAY-123",
      plan: "MONTHLY",
      amount: 5000,
      currencyCode: "NGN",
      paymentMethodKey: "CARD",
      customerEmail: "owner@example.com",
      customerName: "Test Laundry",
    });

    expect(result).toEqual({
      providerKey: "paystack",
      providerCheckoutReference: "access-123",
      checkoutUrl: "https://checkout.paystack.com/test",
      status: "PENDING",
      raw: {
        reference: "LA-PAY-123",
        accessCode: "access-123",
      },
    });

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();

    const request = firstCall?.[1];
    expect(request).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk_test_example",
        }),
      }),
    );

    const payload = JSON.parse(request.body as string);
    expect(payload.amount).toBe("500000");
    expect(payload.currency).toBe("NGN");
    expect(payload.reference).toBe("LA-PAY-123");
    expect(payload.channels).toEqual(["card"]);
  });

  it("verifies a successful NGN transaction and converts kobo to naira", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          message: "Verification successful",
          data: {
            id: 4099260516,
            status: "success",
            reference: "LA-PAY-123",
            amount: 500000,
            currency: "NGN",
            channel: "card",
            paid_at: "2026-09-17T10:00:00.000Z",
            gateway_response: "Successful",
          },
        }),
        { status: 200 },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await paystackSubscriptionPaymentProvider.verifyPayment({
      paymentReference: "LA-PAY-123",
      providerCheckoutReference: "access-123",
      expectedAmount: 5000,
      expectedCurrencyCode: "NGN",
    });

    expect(result).toMatchObject({
      providerKey: "paystack",
      providerTransactionId: "4099260516",
      paymentReference: "LA-PAY-123",
      amount: 5000,
      currencyCode: "NGN",
      status: "SUCCESSFUL",
      paymentMethodKey: "CARD",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.paystack.co/transaction/verify/LA-PAY-123",
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer sk_test_example",
        },
      }),
    );
  });

  it("maps an in-progress Paystack transaction to pending", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          data: {
            id: 123,
            status: "pending",
            reference: "LA-PAY-123",
            amount: 500000,
            currency: "NGN",
            channel: "bank_transfer",
          },
        }),
        { status: 200 },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await paystackSubscriptionPaymentProvider.verifyPayment({
      paymentReference: "LA-PAY-123",
      expectedAmount: 5000,
      expectedCurrencyCode: "NGN",
    });

    expect(result.status).toBe("PENDING");
    expect(result.paymentMethodKey).toBe("BANK_TRANSFER");
  });
});
