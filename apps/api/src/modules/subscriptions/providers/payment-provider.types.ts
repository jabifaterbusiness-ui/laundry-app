import type { SubscriptionPlan } from "@prisma/client";

export interface InitializeSubscriptionPaymentInput {
  businessId: string;
  paymentReference: string;
  plan: SubscriptionPlan;
  amount: number;
  currencyCode: string;
  paymentMethodKey: string;
  customerEmail?: string | null;
  customerName?: string | null;
  callbackUrl?: string | null;
}

export interface InitializeSubscriptionPaymentResult {
  providerKey: string;
  providerCheckoutReference: string;
  checkoutUrl?: string | null;
  status: "PENDING" | "PROCESSING";
  raw?: unknown;
}

export interface VerifySubscriptionPaymentInput {
  paymentReference: string;
  providerCheckoutReference?: string | null;
  providerTransactionId?: string | null;
  expectedAmount: number;
  expectedCurrencyCode: string;
}

export interface VerifySubscriptionPaymentResult {
  providerKey: string;
  providerTransactionId: string;
  paymentReference?: string | null;
  amount: number;
  currencyCode: string;
  status: "SUCCESSFUL" | "FAILED" | "PENDING" | "REQUIRES_VERIFICATION";
  paymentMethodKey?: string | null;
  receivedAt?: Date | null;
  raw?: unknown;
}

export interface SubscriptionPaymentProvider {
  readonly providerKey: string;

  initializePayment(
    input: InitializeSubscriptionPaymentInput,
  ): Promise<InitializeSubscriptionPaymentResult>;

  verifyPayment(
    input: VerifySubscriptionPaymentInput,
  ): Promise<VerifySubscriptionPaymentResult>;
}
