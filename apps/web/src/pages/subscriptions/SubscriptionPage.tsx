import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  createSubscriptionPaymentIntent,
  getSubscription,
  getSubscriptionPaymentOptions,
  getSubscriptionPrices,
  initializeSubscriptionPayment,
  verifySubscriptionPayment,
  type SubscriptionPlan,
} from "../../lib/subscriptions-api.js";
import {
  cacheSubscriptionBillingConfig,
  enqueueOfflineSubscriptionPayment,
  getCachedSubscriptionBillingConfig,
  getOfflineSubscriptionPaymentByIntent,
  listOfflineSubscriptionPayments,
  updateOfflineSubscriptionPayment,
  type OfflineSubscriptionPaymentQueueEntry,
} from "../../lib/offline-subscription-payment-queue.js";
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

function formatPrice(amount: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toLocaleString()}`;
  }
}

export function SubscriptionPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [offlinePaymentReason, setOfflinePaymentReason] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [cachedBillingConfig, setCachedBillingConfig] = useState<Awaited<
    ReturnType<typeof getCachedSubscriptionBillingConfig>
  > | null>(null);
  const [offlinePayments, setOfflinePayments] = useState<
    OfflineSubscriptionPaymentQueueEntry[]
  >([]);

  const isOwner = user?.securityRole === "BUSINESS_OWNER";

  const subscriptionQuery = useQuery({
    queryKey: ["subscription"],
    enabled: Boolean(accessToken && isOwner),
    queryFn: () => getSubscription(accessToken ?? ""),
  });

  const subscriptionPricesQuery = useQuery({
    queryKey: ["subscription-prices"],
    enabled: Boolean(accessToken && isOwner),
    queryFn: () => getSubscriptionPrices(accessToken ?? ""),
  });

  const paymentOptionsQuery = useQuery({
    queryKey: ["subscription-payment-options"],
    enabled: Boolean(accessToken && isOwner),
    queryFn: () => getSubscriptionPaymentOptions(accessToken ?? ""),
  });

  const refreshOfflinePayments = useCallback(async () => {
    if (!user?.businessId) {
      setOfflinePayments([]);
      return;
    }

    const entries = await listOfflineSubscriptionPayments(user.businessId);
    entries.sort((a, b) => b.createdAt - a.createdAt);
    setOfflinePayments(entries);
  }, [user?.businessId]);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);

    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    if (!user?.businessId) {
      return;
    }

    void getCachedSubscriptionBillingConfig(user.businessId).then((cached) => {
      setCachedBillingConfig(cached ?? null);
    });

    void refreshOfflinePayments();
  }, [refreshOfflinePayments, user?.businessId]);

  useEffect(() => {
    if (
      !user?.businessId ||
      !subscriptionPricesQuery.data ||
      !paymentOptionsQuery.data
    ) {
      return;
    }

    void cacheSubscriptionBillingConfig({
      businessId: user.businessId,
      countryCode: subscriptionPricesQuery.data.countryCode,
      currencyCode: subscriptionPricesQuery.data.currencyCode,
      prices: subscriptionPricesQuery.data.prices,
      providers: paymentOptionsQuery.data.providers,
      methods: paymentOptionsQuery.data.methods,
    });
  }, [
    paymentOptionsQuery.data,
    subscriptionPricesQuery.data,
    user?.businessId,
  ]);

  const paymentMutation = useMutation({
    mutationFn: async (plan: SubscriptionPlan) => {
      if (!selectedProvider || !selectedMethod) {
        throw new Error("Select a payment provider and payment method.");
      }

      const idempotencyKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `subscription-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const intent = await createSubscriptionPaymentIntent(
        accessToken ?? "",
        {
          plan,
          origin: "ONLINE",
          idempotencyKey,
          providerKey: selectedProvider,
          paymentMethodKey: selectedMethod,
        },
      );

      return initializeSubscriptionPayment(accessToken ?? "", intent.id);
    },
    onSuccess: (intent) => {
      if (!intent.providerCheckoutUrl) {
        throw new Error(
          "The payment provider did not return a checkout page. Please try again.",
        );
      }

      setCheckoutMessage("Redirecting to secure payment checkout...");
      window.location.assign(intent.providerCheckoutUrl);
    },
  });

  const offlinePaymentMutation = useMutation({
    mutationFn: async (plan: SubscriptionPlan) => {
      if (!user?.businessId || !user.id) {
        throw new Error("Business account context is required.");
      }

      if (!selectedProvider || !selectedMethod) {
        throw new Error("Select a payment provider and payment method.");
      }

      const reason = offlinePaymentReason.trim();
      if (!reason) {
        throw new Error(
          "A reason is required to save a subscription payment offline.",
        );
      }

      const price = new Map(
        (
          subscriptionPricesQuery.data?.prices ??
          cachedBillingConfig?.prices ??
          []
        ).map((configuredPrice) => [configuredPrice.plan, configuredPrice]),
      ).get(plan);

      if (!price || !price.isActive) {
        throw new Error("The selected subscription price is not configured.");
      }

      return enqueueOfflineSubscriptionPayment({
        businessId: user.businessId,
        actorUserId: user.id,
        plan,
        amount: price.amount,
        currencyCode: price.currencyCode,
        providerKey: selectedProvider,
        paymentMethodKey: selectedMethod,
        reason,
        idempotencyKey:
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `offline-subscription-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2)}`,
      });
    },
    onSuccess: () => {
      setOfflinePaymentReason("");
      setCheckoutMessage(
        isOnline
          ? "Payment saved locally and will be prepared for secure checkout."
          : "Payment saved securely on this device. It will sync when internet returns.",
      );
      void refreshOfflinePayments();
    },
    onError: (error) => {
      setCheckoutMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the subscription payment offline.",
      );
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (intentId: string) =>
      verifySubscriptionPayment(accessToken ?? "", intentId),
    onSuccess: async (result) => {
      if (result.subscription) {
        queryClient.setQueryData(["subscription"], result.subscription);
      }

      if (result.intent?.id && user?.businessId) {
        const queuedPayment = await getOfflineSubscriptionPaymentByIntent(
          user.businessId,
          result.intent.id,
        );

        if (queuedPayment?.id !== undefined) {
          await updateOfflineSubscriptionPayment(queuedPayment.id, {
            status: "COMPLETED",
            lastError: null,
          });
          await refreshOfflinePayments();
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["subscription"] });
      setCheckoutMessage(
        result.alreadyProcessed
          ? "Payment was already verified and your subscription is active."
          : result.payment
            ? "Payment verified successfully. Your subscription is now active."
            : "Payment is still being processed. Please try again shortly.",
      );
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentIntentId = params.get("payment_intent");

    if (!paymentIntentId || !accessToken || !isOwner) {
      return;
    }

    setCheckoutMessage("Verifying your subscription payment...");
    verifyMutation.mutate(paymentIntentId);

    params.delete("payment_intent");
    const cleanedQuery = params.toString();
    const cleanUrl = `${window.location.pathname}${
      cleanedQuery ? `?${cleanedQuery}` : ""
    }${window.location.hash}`;

    window.history.replaceState({}, "", cleanUrl);
  }, [accessToken, isOwner]);

  const subscription = subscriptionQuery.data;

  const configuredPrices = useMemo(
    () =>
      new Map(
        (
          subscriptionPricesQuery.data?.prices ??
          cachedBillingConfig?.prices ??
          []
        )
          .filter((price) => price.isActive)
          .map((price) => [price.plan, price]),
      ),
    [cachedBillingConfig?.prices, subscriptionPricesQuery.data?.prices],
  );

  const paymentProviders = useMemo(
    () =>
      paymentOptionsQuery.data?.providers ??
      cachedBillingConfig?.providers ??
      [],
    [cachedBillingConfig?.providers, paymentOptionsQuery.data?.providers],
  );

  const paymentMethods = useMemo(
    () =>
      (
        paymentOptionsQuery.data?.methods ??
        cachedBillingConfig?.methods ??
        []
      ).filter(
        (method) =>
          !selectedProvider ||
          !method.providerKey ||
          method.providerKey === selectedProvider,
      ),
    [cachedBillingConfig?.methods, paymentOptionsQuery.data?.methods, selectedProvider],
  );

  const latestOfflinePayment = offlinePayments[0] ?? null;
  const hasCachedPaymentOptions =
    Boolean(paymentOptionsQuery.data) || Boolean(cachedBillingConfig);


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

          <button type="button" onClick={() => subscriptionQuery.refetch()}>
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
              <strong>{remainingDays}</strong>
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

            {paymentOptionsQuery.isLoading && !hasCachedPaymentOptions ? (
              <p className="subscription-action-message">
                Loading available payment methods...
              </p>
            ) : paymentOptionsQuery.isError && !hasCachedPaymentOptions ? (
              <p className="subscription-error-text" role="alert">
                Unable to load available payment methods. Please try again.
              </p>
            ) : (
              <>
                <div className="subscription-payment-selection">
                  <label>
                    <span>Payment provider</span>
                    <select
                      value={selectedProvider}
                      onChange={(event) => {
                        setSelectedProvider(event.target.value);
                        setSelectedMethod("");
                      }}
                      disabled={paymentMutation.isPending}
                    >
                      <option value="">Select provider</option>
                      {paymentProviders.map((provider) => (
                        <option
                          key={provider.providerKey}
                          value={provider.providerKey}
                        >
                          {provider.displayName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Payment method</span>
                    <select
                      value={selectedMethod}
                      onChange={(event) => setSelectedMethod(event.target.value)}
                      disabled={paymentMutation.isPending || !selectedProvider}
                    >
                      <option value="">Select payment method</option>
                      {paymentMethods.map((method) => (
                        <option key={method.methodKey} value={method.methodKey}>
                          {method.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {paymentProviders.length === 0 ? (
                  <p className="subscription-error-text" role="alert">
                    No online payment provider is currently configured for your
                    business country and currency.
                  </p>
                ) : null}

                <div className="subscription-offline-reason">
                  <label>
                    <span>Reason for saving payment offline</span>
                    <textarea
                      value={offlinePaymentReason}
                      onChange={(event) =>
                        setOfflinePaymentReason(event.target.value)
                      }
                      maxLength={1000}
                      rows={3}
                      placeholder="Explain why this subscription payment is being saved offline."
                      aria-label="Reason for saving payment offline"
                      disabled={offlinePaymentMutation.isPending}
                    />
                  </label>
                  <small>
                    A reason is required before an offline payment can be
                    synchronized and reconciled.
                  </small>
                </div>

                <div className="subscription-plan-options">
                  {(
                    [
                      ["WEEKLY", "W", "Weekly", "Renew for one week"],
                      ["MONTHLY", "M", "Monthly", "Renew for one month"],
                      ["QUARTERLY", "Q", "Quarterly", "Renew for three months"],
                      ["YEARLY", "Y", "Yearly", "Renew for one year"],
                    ] as const
                  ).map(([plan, icon, label, description]) => {
                    const price = configuredPrices.get(plan);

                    return (
                      <div className="subscription-plan-option-wrapper" key={plan}>
                        <button
                          type="button"
                          aria-label={`${label} subscription plan`}
                          className={`subscription-plan-option ${
                            plan === "YEARLY"
                              ? "subscription-plan-option-featured"
                              : ""
                          }`}
                          disabled={
                            paymentMutation.isPending ||
                            offlinePaymentMutation.isPending ||
                            !price ||
                            !selectedProvider ||
                            !selectedMethod ||
                            !isOnline
                          }
                          onClick={() => paymentMutation.mutate(plan)}
                        >
                          <span className="subscription-plan-icon">{icon}</span>
                          <span>
                            <strong>{label}</strong>
                            <small>{description}</small>
                            <small>
                              {price
                                ? formatPrice(price.amount, price.currencyCode)
                                : "Price not configured"}
                            </small>
                          </span>
                        </button>

                        <button
                          type="button"
                          className="subscription-plan-offline-button"
                          aria-label={`Save ${label} payment offline`}
                          disabled={
                            paymentMutation.isPending ||
                            offlinePaymentMutation.isPending ||
                            !price ||
                            !selectedProvider ||
                            !selectedMethod
                          }
                          onClick={() => offlinePaymentMutation.mutate(plan)}
                        >
                          {isOnline ? "Save offline" : "Save payment"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {latestOfflinePayment ? (
              <section className="subscription-offline-payment-panel">
                <div>
                  <p className="subscription-card-label">Offline payment queue</p>
                  <strong>
                    {formatPlan(latestOfflinePayment.plan)} ·{" "}
                    {formatPrice(
                      latestOfflinePayment.amount,
                      latestOfflinePayment.currencyCode,
                    )}
                  </strong>
                  <span>
                    Status: {latestOfflinePayment.status}
                    {latestOfflinePayment.lastError
                      ? ` · ${latestOfflinePayment.lastError}`
                      : ""}
                  </span>
                </div>

                {latestOfflinePayment.status === "READY" &&
                latestOfflinePayment.providerCheckoutUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      window.location.assign(
                        latestOfflinePayment.providerCheckoutUrl!,
                      )
                    }
                  >
                    Continue payment
                  </button>
                ) : latestOfflinePayment.status === "PENDING" ||
                  latestOfflinePayment.status === "SYNCING" ? (
                  <span className="subscription-action-message">
                    {isOnline
                      ? "Preparing secure checkout..."
                      : "Waiting for internet connection to sync this payment."}
                  </span>
                ) : latestOfflinePayment.status === "COMPLETED" ? (
                  <span className="subscription-success">
                    Payment verified and subscription activated.
                  </span>
                ) : null}
              </section>
            ) : null}

            {!selectedProvider || !selectedMethod ? (
              <p className="subscription-action-message">
                Select a payment provider and payment method to continue.
              </p>
            ) : null}

            {paymentMutation.isPending && (
              <p className="subscription-action-message">
                Creating secure payment checkout...
              </p>
            )}

            {!isOnline ? (
              <p className="subscription-action-message" role="status">
                You are offline. Use “Save payment” to securely queue a subscription
                payment on this device. Paid access will only activate after
                authoritative verification when the payment reaches the provider.
              </p>
            ) : null}

            {offlinePaymentMutation.isPending && (
              <p className="subscription-action-message">
                Saving subscription payment locally...
              </p>
            )}

            {offlinePaymentMutation.isError && (
              <p className="subscription-error-text" role="alert">
                {offlinePaymentMutation.error instanceof Error
                  ? offlinePaymentMutation.error.message
                  : "Unable to save the subscription payment offline."}
              </p>
            )}

            {checkoutMessage && (
              <p className="subscription-success" role="status">
                {checkoutMessage}
              </p>
            )}

            {verifyMutation.isPending && (
              <p className="subscription-action-message">
                Verifying your payment...
              </p>
            )}

            {paymentMutation.isError && (
              <p className="subscription-error-text" role="alert">
                {paymentMutation.error instanceof ApiError
                  ? paymentMutation.error.message
                  : paymentMutation.error instanceof Error
                    ? paymentMutation.error.message
                    : "Unable to start payment. Please try again."}
              </p>
            )}

            {verifyMutation.isError && (
              <p className="subscription-error-text" role="alert">
                {verifyMutation.error instanceof ApiError
                  ? verifyMutation.error.message
                  : "Unable to verify the payment. Please try again."}
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
