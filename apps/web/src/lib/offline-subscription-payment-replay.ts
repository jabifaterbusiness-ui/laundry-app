import {
  ApiError,
  NetworkError,
} from "./api-client.js";
import {
  createSubscriptionPaymentIntent,
  initializeSubscriptionPayment,
  reconcileOfflineSubscriptionPayment,
} from "./subscriptions-api.js";
import {
  listOfflineSubscriptionPayments,
  updateOfflineSubscriptionPayment,
} from "./offline-subscription-payment-queue.js";

export interface ReplayOfflineSubscriptionPaymentContext {
  businessId: string;
  actorUserId: string;
  accessToken: string;
}

export interface ReplayOfflineSubscriptionPaymentResult {
  processed: number;
  ready: number;
  completed: number;
  failed: number;
}

let replayRunning = false;

function isTemporaryFailure(error: unknown) {
  return (
    error instanceof NetworkError ||
    (error instanceof ApiError && error.status >= 500)
  );
}

async function replayOne(
  entry: Awaited<ReturnType<typeof listOfflineSubscriptionPayments>>[number],
  context: ReplayOfflineSubscriptionPaymentContext,
): Promise<"READY" | "COMPLETED" | "FAILED"> {
  if (entry.id === undefined) {
    return "FAILED";
  }

  await updateOfflineSubscriptionPayment(entry.id, {
    status: "SYNCING",
    attemptCount: entry.attemptCount + 1,
    lastAttemptAt: Date.now(),
    lastError: null,
  });

  try {
    const intent = await createSubscriptionPaymentIntent(
      context.accessToken,
      {
        plan: entry.plan,
        origin: "OFFLINE",
        idempotencyKey: entry.idempotencyKey,
        providerKey: entry.providerKey,
        paymentMethodKey: entry.paymentMethodKey,
      },
    );

    if (
      intent.amount !== entry.amount ||
      intent.currencyCode !== entry.currencyCode
    ) {
      throw new Error(
        "The configured subscription price changed while this payment was offline. Review the current price before paying.",
      );
    }

    const reconciled = await reconcileOfflineSubscriptionPayment(
      context.accessToken,
      {
        intentId: intent.id,
        providerKey: entry.providerKey,
        paymentMethodKey: entry.paymentMethodKey,
      },
    );

    if (reconciled.status === "SUCCESSFUL") {
      await updateOfflineSubscriptionPayment(entry.id, {
        status: "COMPLETED",
        intentId: reconciled.id,
        paymentReference: reconciled.paymentReference,
        lastError: null,
      });

      return "COMPLETED";
    }

    const initialized = await initializeSubscriptionPayment(
      context.accessToken,
      reconciled.id,
    );

    if (!initialized.providerCheckoutUrl) {
      throw new Error(
        "The payment provider did not return a checkout page. Please retry the payment.",
      );
    }

    await updateOfflineSubscriptionPayment(entry.id, {
      status: "READY",
      intentId: initialized.id,
      paymentReference: initialized.paymentReference,
      providerCheckoutUrl: initialized.providerCheckoutUrl,
      lastError: null,
    });

    return "READY";
  } catch (error) {
    if (entry.id === undefined) {
      return "FAILED";
    }

    if (isTemporaryFailure(error)) {
      await updateOfflineSubscriptionPayment(entry.id, {
        status: "PENDING",
        lastError:
          error instanceof Error ? error.message : "Temporary payment sync failure",
      });
      return "FAILED";
    }

    await updateOfflineSubscriptionPayment(entry.id, {
      status: "FAILED",
      lastError:
        error instanceof Error
          ? error.message
          : "Unable to synchronize the offline subscription payment",
    });

    return "FAILED";
  }
}

export async function replayOfflineSubscriptionPaymentQueue(
  context: ReplayOfflineSubscriptionPaymentContext,
): Promise<ReplayOfflineSubscriptionPaymentResult> {
  if (replayRunning) {
    return {
      processed: 0,
      ready: 0,
      completed: 0,
      failed: 0,
    };
  }

  replayRunning = true;

  try {
    const entries = await listOfflineSubscriptionPayments(
      context.businessId,
      "PENDING",
    );

    entries.sort((a, b) => a.createdAt - b.createdAt);

    const result: ReplayOfflineSubscriptionPaymentResult = {
      processed: entries.length,
      ready: 0,
      completed: 0,
      failed: 0,
    };

    for (const entry of entries) {
      const status = await replayOne(entry, context);

      if (status === "READY") {
        result.ready += 1;
      } else if (status === "COMPLETED") {
        result.completed += 1;
      } else {
        result.failed += 1;
      }
    }

    return result;
  } finally {
    replayRunning = false;
  }
}
