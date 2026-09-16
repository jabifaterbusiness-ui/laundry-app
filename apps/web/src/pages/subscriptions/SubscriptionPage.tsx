import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  createOrRenewSubscription,
  getSubscription,
  type SubscriptionPlan,
} from "../../lib/subscriptions-api.js";
import { useAuthStore } from "../../state/auth-store.js";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatPlan(plan: SubscriptionPlan) {
  switch (plan) {
    case "WEEKLY":
      return "Weekly";
    case "MONTHLY":
      return "Monthly";
    case "QUARTERLY":
      return "Quarterly";
    case "YEARLY":
      return "Yearly";
  }
}

function getRemainingDays(endsAt: string) {
  const difference = new Date(endsAt).getTime() - Date.now();

  if (difference <= 0) {
    return 0;
  }

  return Math.ceil(difference / (1000 * 60 * 60 * 24));
}

export function SubscriptionPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const isOwner = user?.role === "BUSINESS_OWNER";

  const subscriptionQuery = useQuery({
    queryKey: ["subscription"],
    enabled: Boolean(accessToken && isOwner),
    queryFn: () => getSubscription(accessToken ?? ""),
  });

  const renewalMutation = useMutation({
    mutationFn: (plan: SubscriptionPlan) =>
      createOrRenewSubscription(accessToken ?? "", { plan }),
    onSuccess: (subscription) => {
      queryClient.setQueryData(["subscription"], subscription);
    },
  });

  const subscription = subscriptionQuery.data;

  const remainingDays = useMemo(
    () => (subscription ? getRemainingDays(subscription.endsAt) : 0),
    [subscription],
  );

  if (!isOwner) {
    return (
      <main className="subscription-page">
        <section className="subscription-feedback subscription-error" role="alert">
          <h1>Subscription</h1>
          <p>
            Subscription management is available only to the business owner.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="subscription-page">
      <header className="subscription-header">
        <div>
          <p className="subscription-eyebrow">Billing & access</p>
          <h1>Subscription</h1>
          <p>
            Manage your Laundry Angel subscription and keep your business
            access active.
          </p>
        </div>
      </header>

      {subscriptionQuery.isLoading && (
        <section className="subscription-card">
          <p>Loading subscription...</p>
        </section>
      )}

      {subscriptionQuery.isError && (
        <section className="subscription-feedback subscription-error" role="alert">
          <div>
            <h2>Subscription not available</h2>
            <p>
              {subscriptionQuery.error instanceof ApiError
                ? subscriptionQuery.error.message
                : "Unable to load your subscription."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => subscriptionQuery.refetch()}
          >
            Try again
          </button>
        </section>
      )}

      {subscription && (
        <>
          <section className="subscription-overview">
            <article className="subscription-card subscription-plan-card">
              <div>
                <p className="subscription-card-label">Current plan</p>
                <h2>{formatPlan(subscription.plan)}</h2>
                <p>
                  {subscription.status === "ACTIVE"
                    ? "Your business subscription is active."
                    : "Your subscription has expired."}
                </p>
              </div>

              <span
                className={`subscription-status ${
                  subscription.status === "ACTIVE"
                    ? "subscription-status-active"
                    : "subscription-status-expired"
                }`}
              >
                {subscription.status}
              </span>
            </article>

            <article className="subscription-card">
              <p className="subscription-card-label">Subscription period</p>
              <strong>{formatDate(subscription.startsAt)}</strong>
              <span>Start date</span>

              <strong>{formatDate(subscription.endsAt)}</strong>
              <span>Expiry date</span>
            </article>

            <article className="subscription-card">
              <p className="subscription-card-label">Access remaining</p>
              <strong>
                {remainingDays > 0 ? remainingDays : 0}
              </strong>
              <span>
                {remainingDays === 1 ? "day remaining" : "days remaining"}
              </span>
            </article>
          </section>

          <section className="subscription-renewal">
            <div className="subscription-section-heading">
              <div>
                <p className="subscription-eyebrow">Renewal</p>
                <h2>Choose your subscription period</h2>
                <p>
                  Renewing an active subscription preserves its remaining paid
                  time and extends the selected plan from the current expiry.
                </p>
              </div>
            </div>

            {subscription.status === "EXPIRED" ? (
              <div className="subscription-expiry-banner">
                <strong>Your subscription has expired.</strong>
                <span>
                  Renew below to restore access to normal business operations.
                  Your business data remains preserved.
                </span>
              </div>
            ) : null}

            <div className="subscription-plan-options">
              <button
                type="button"
                className="subscription-plan-option"
                disabled={renewalMutation.isPending}
                onClick={() => renewalMutation.mutate("WEEKLY")}
              >
                <span className="subscription-plan-icon">W</span>
                <span>
                  <strong>Weekly</strong>
                  <small>Renew for one week</small>
                </span>
              </button>

              <button
                type="button"
                className="subscription-plan-option"
                disabled={renewalMutation.isPending}
                onClick={() => renewalMutation.mutate("MONTHLY")}
              >
                <span className="subscription-plan-icon">M</span>
                <span>
                  <strong>Monthly</strong>
                  <small>Renew for one month</small>
                </span>
              </button>

              <button
                type="button"
                className="subscription-plan-option"
                disabled={renewalMutation.isPending}
                onClick={() => renewalMutation.mutate("QUARTERLY")}
              >
                <span className="subscription-plan-icon">Q</span>
                <span>
                  <strong>Quarterly</strong>
                  <small>Renew for three months</small>
                </span>
              </button>

              <button
                type="button"
                className="subscription-plan-option subscription-plan-option-featured"
                disabled={renewalMutation.isPending}
                onClick={() => renewalMutation.mutate("YEARLY")}
              >
                <span className="subscription-plan-icon">Y</span>
                <span>
                  <strong>Yearly</strong>
                  <small>Renew for one year</small>
                </span>
              </button>
            </div>

            {renewalMutation.isPending && (
              <p className="subscription-action-message">
                Updating your subscription...
              </p>
            )}

            {renewalMutation.isSuccess && (
              <p className="subscription-success" role="status">
                Subscription updated successfully.
              </p>
            )}

            {renewalMutation.isError && (
              <p className="subscription-error-text" role="alert">
                {renewalMutation.error instanceof ApiError
                  ? renewalMutation.error.message
                  : "Unable to update your subscription. Please try again."}
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
