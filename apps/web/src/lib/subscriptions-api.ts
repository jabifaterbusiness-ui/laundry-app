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

export interface CreateSubscriptionInput {
  plan: SubscriptionPlan;
  startsAt?: string;
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

export async function createOrRenewSubscription(
  accessToken: string,
  input: CreateSubscriptionInput,
): Promise<Subscription> {
  return apiFetch<Subscription>("/subscriptions", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}
