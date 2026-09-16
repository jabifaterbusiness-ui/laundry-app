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

export async function getSubscription(
  accessToken: string,
): Promise<Subscription> {
  return apiFetch<Subscription>("/subscriptions", {
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
