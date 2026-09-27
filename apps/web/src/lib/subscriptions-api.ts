import { apiFetch } from "./api-client.js";

export type SubscriptionPlan =
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY";

export type SubscriptionStatus = "ACTIVE" | "EXPIRED";

export interface Subscription {
  id: string;
  businessId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPrice {
  id: string;
  plan: SubscriptionPlan;
  countryCode: string;
  currencyCode: string;
  amount: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SubscriptionPricesResponse {
  countryCode: string;
  currencyCode: string;
  prices: SubscriptionPrice[];
}

export interface SubscriptionPaymentProviderOption {
  providerKey: string;
  displayName: string;
}

export interface SubscriptionPaymentMethodOption {
  methodKey: string;
  displayName: string;
  providerKey: string | null;
}

export interface SubscriptionPaymentOptionsResponse {
  countryCode: string;
  currencyCode: string;
  providers: SubscriptionPaymentProviderOption[];
  methods: SubscriptionPaymentMethodOption[];
}

export interface CreateSubscriptionPaymentIntentInput {
  plan: SubscriptionPlan;
  origin: "ONLINE" | "OFFLINE";
  idempotencyKey: string;
  providerKey?: string;
  paymentMethodKey?: string;
}

export interface SubscriptionPaymentIntent {
  id: string;
  businessId: string;
  plan: SubscriptionPlan;
  amount: number;
  currencyCode: string;
  paymentReference: string;
  idempotencyKey: string;
  origin: "ONLINE" | "OFFLINE";
  status:
    | "CREATED"
    | "PENDING"
    | "PROCESSING"
    | "SUCCESSFUL"
    | "FAILED"
    | "CANCELLED"
    | "EXPIRED"
    | "REQUIRES_VERIFICATION";
  providerKey: string | null;
  paymentMethodKey: string | null;
  providerCheckoutReference: string | null;
  providerCheckoutUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPaymentResult {
  intent: SubscriptionPaymentIntent;
  payment: {
    id: string;
    paymentReference: string;
    providerTransactionId: string;
    providerKey: string;
    paymentMethodKey: string;
    amount: number;
    currencyCode: string;
    status: "SUCCESSFUL";
    receivedAt: string;
    verifiedAt: string;
  } | null;
  subscription: Subscription | null;
  alreadyProcessed: boolean;
}

export async function getSubscription(
  accessToken: string,
): Promise<Subscription> {
  return apiFetch<Subscription>("/subscriptions", {
    accessToken,
  });
}

export async function getSubscriptionPrices(
  accessToken: string,
): Promise<SubscriptionPricesResponse> {
  return apiFetch<SubscriptionPricesResponse>("/subscriptions/prices", {
    accessToken,
  });
}

export async function getSubscriptionPaymentOptions(
  accessToken: string,
): Promise<SubscriptionPaymentOptionsResponse> {
  return apiFetch<SubscriptionPaymentOptionsResponse>(
    "/subscriptions/payment-options",
    {
      accessToken,
    },
  );
}

export async function createSubscriptionPaymentIntent(
  accessToken: string,
  input: CreateSubscriptionPaymentIntentInput,
): Promise<SubscriptionPaymentIntent> {
  return apiFetch<SubscriptionPaymentIntent>("/subscriptions/payment-intents", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export async function reconcileOfflineSubscriptionPayment(
  accessToken: string,
  input: {
    intentId: string;
    providerKey: string;
    paymentMethodKey: string;
    reason: string;
  },
): Promise<SubscriptionPaymentIntent> {
  return apiFetch<SubscriptionPaymentIntent>(
    "/subscriptions/payment-reconcile",
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

export async function initializeSubscriptionPayment(
  accessToken: string,
  intentId: string,
): Promise<SubscriptionPaymentIntent> {
  return apiFetch<SubscriptionPaymentIntent>(
    "/subscriptions/payment-initialize",
    {
      method: "POST",
      accessToken,
      body: JSON.stringify({ intentId }),
    },
  );
}

export async function verifySubscriptionPayment(
  accessToken: string,
  intentId: string,
): Promise<SubscriptionPaymentResult> {
  return apiFetch<SubscriptionPaymentResult>("/subscriptions/payment-verify", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ intentId }),
  });
}
