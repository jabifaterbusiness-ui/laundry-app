import { config } from "../../../config/index.js";
import { AppError } from "../../../middleware/error-handler.js";
import type {
  InitializeSubscriptionPaymentInput,
  InitializeSubscriptionPaymentResult,
  SubscriptionPaymentProvider,
  VerifySubscriptionPaymentInput,
  VerifySubscriptionPaymentResult,
} from "./payment-provider.types.js";

const PAYSTACK_PROVIDER_KEY = "paystack";

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

const PAYMENT_CHANNELS: Record<string, string> = {
  CARD: "card",
  BANK: "bank",
  BANK_TRANSFER: "bank_transfer",
  USSD: "ussd",
  QR: "qr",
  MOBILE_MONEY: "mobile_money",
  APPLE_PAY: "apple_pay",
  PAYATTITUDE: "payattitude",
  EFT: "eft",
};

function toSubunit(amount: number, currencyCode: string) {
  return ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase())
    ? Math.round(amount)
    : Math.round(amount * 100);
}

function mapStatus(status: string): VerifySubscriptionPaymentResult["status"] {
  switch (status.toLowerCase()) {
    case "success":
      return "SUCCESSFUL";
    case "failed":
    case "abandoned":
    case "reversed":
      return "FAILED";
    case "pending":
    case "ongoing":
    case "processing":
    case "queued":
      return "PENDING";
    default:
      return "REQUIRES_VERIFICATION";
  }
}

function assertConfigured() {
  if (!config.paymentProviders.paystack.secretKey) {
    throw new AppError(
      "Paystack is not configured on the server",
      503,
    );
  }
}

async function parseResponse(response: Response) {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new AppError(
      `Payment provider returned an invalid response (${response.status})`,
      502,
    );
  }

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : `Payment provider request failed (${response.status})`;

    throw new AppError(message, 502);
  }

  return body;
}

function getData(body: unknown) {
  if (
    typeof body !== "object" ||
    body === null ||
    !("status" in body) ||
    body.status !== true ||
    !("data" in body) ||
    typeof body.data !== "object" ||
    body.data === null
  ) {
    throw new AppError("Payment provider returned an unsuccessful response", 502);
  }

  return body.data as Record<string, unknown>;
}

function getString(data: Record<string, unknown>, key: string) {
  const value = data[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

export const paystackSubscriptionPaymentProvider: SubscriptionPaymentProvider = {
  providerKey: PAYSTACK_PROVIDER_KEY,

  async initializePayment(
    input: InitializeSubscriptionPaymentInput,
  ): Promise<InitializeSubscriptionPaymentResult> {
    assertConfigured();

    if (!input.customerEmail) {
      throw new AppError(
        "A business email is required to initialize a Paystack payment",
        400,
      );
    }

    const currencyCode = input.currencyCode.toUpperCase();
    const channel = PAYMENT_CHANNELS[input.paymentMethodKey.toUpperCase()];

    const payload: Record<string, unknown> = {
      email: input.customerEmail,
      amount: String(toSubunit(input.amount, currencyCode)),
      currency: currencyCode,
      reference: input.paymentReference,
      metadata: JSON.stringify({
        businessId: input.businessId,
        plan: input.plan,
        paymentReference: input.paymentReference,
      }),
    };

    if (channel) {
      payload.channels = [channel];
    }

    if (input.callbackUrl) {
      payload.callback_url = input.callbackUrl;
    }

    const response = await fetch(
      `${config.paymentProviders.paystack.baseUrl}/transaction/initialize`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.paymentProviders.paystack.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const body = await parseResponse(response);
    const data = getData(body);

    const authorizationUrl = getString(data, "authorization_url");
    const accessCode = getString(data, "access_code");
    const reference = getString(data, "reference");

    if (!authorizationUrl || !accessCode || !reference) {
      throw new AppError(
        "Paystack returned an incomplete checkout response",
        502,
      );
    }

    if (reference !== input.paymentReference) {
      throw new AppError(
        "Paystack returned a different payment reference",
        502,
      );
    }

    return {
      providerKey: PAYSTACK_PROVIDER_KEY,
      providerCheckoutReference: accessCode,
      checkoutUrl: authorizationUrl,
      status: "PENDING",
      raw: {
        reference,
        accessCode,
      },
    };
  },

  async verifyPayment(
    input: VerifySubscriptionPaymentInput,
  ): Promise<VerifySubscriptionPaymentResult> {
    assertConfigured();

    const response = await fetch(
      `${config.paymentProviders.paystack.baseUrl}/transaction/verify/${encodeURIComponent(input.paymentReference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.paymentProviders.paystack.secretKey}`,
        },
      },
    );

    const body = await parseResponse(response);
    const data = getData(body);

    const reference = getString(data, "reference");
    const providerTransactionId = data.id;

    if (
      typeof providerTransactionId !== "number" &&
      typeof providerTransactionId !== "string"
    ) {
      throw new AppError(
        "Paystack returned no transaction identifier",
        502,
      );
    }

    const amountSubunit = data.amount;

    if (typeof amountSubunit !== "number") {
      throw new AppError(
        "Paystack returned no transaction amount",
        502,
      );
    }

    const currencyCode = getString(data, "currency");

    if (!currencyCode) {
      throw new AppError(
        "Paystack returned no transaction currency",
        502,
      );
    }

    const divisor = ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase())
      ? 1
      : 100;

    const amount = amountSubunit / divisor;

    const receivedAtRaw = getString(data, "paid_at");

    return {
      providerKey: PAYSTACK_PROVIDER_KEY,
      providerTransactionId: String(providerTransactionId),
      paymentReference: reference,
      amount,
      currencyCode,
      status: mapStatus(String(data.status ?? "")),
      paymentMethodKey:
        getString(data, "channel")?.toUpperCase().replace(/-/g, "_") ?? null,
      receivedAt: receivedAtRaw ? new Date(receivedAtRaw) : null,
      raw: {
        status: data.status,
        channel: data.channel,
        gatewayResponse: data.gateway_response,
        paidAt: data.paid_at,
      },
    };
  },
};
