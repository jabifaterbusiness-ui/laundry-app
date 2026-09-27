import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import { requireReason } from "../../lib/reason.js";
import { validatePaymentSelection } from "../platform/payment-config.service.js";
import type { ReconcileOfflineSubscriptionPaymentInput } from "./subscription-payment-reconciliation.validation.js";

export async function reconcileOfflineSubscriptionPayment(
  businessId: string,
  input: ReconcileOfflineSubscriptionPaymentInput,
  actorUserId?: string | null,
  correlationId?: string | null,
) {
  const reason = requireReason(input.reason);

  const intent = await prisma.subscriptionPaymentIntent.findUnique({
    where: { id: input.intentId },
    include: {
      business: {
        select: {
          id: true,
          countryCode: true,
          currencyCode: true,
        },
      },
    },
  });

  if (!intent) {
    throw new AppError("Subscription payment intent not found", 404);
  }

  if (intent.businessId !== businessId) {
    throw new AppError(
      "Subscription payment intent belongs to another business",
      403,
    );
  }

  if (intent.origin === "ONLINE") {
    if (
      intent.providerKey === input.providerKey &&
      intent.paymentMethodKey === input.paymentMethodKey
    ) {
      return intent;
    }

    throw new AppError(
      "Subscription payment intent has already been reconciled",
      409,
    );
  }

  if (intent.origin !== "OFFLINE") {
    throw new AppError(
      "Only offline subscription payment intents can be reconciled",
      409,
    );
  }

  if (intent.status !== "CREATED") {
    throw new AppError(
      `Offline subscription payment intent cannot be reconciled from status "${intent.status}"`,
      409,
    );
  }

  await validatePaymentSelection(
    intent.business.countryCode,
    intent.business.currencyCode,
    input.providerKey,
    input.paymentMethodKey,
  );

  const updated = await prisma.subscriptionPaymentIntent.updateMany({
    where: {
      id: intent.id,
      businessId,
      origin: "OFFLINE",
      status: "CREATED",
    },
    data: {
      origin: "ONLINE",
      providerKey: input.providerKey,
      paymentMethodKey: input.paymentMethodKey,
      status: "CREATED",
    },
  });

  if (updated.count !== 1) {
    const current = await prisma.subscriptionPaymentIntent.findUnique({
      where: { id: intent.id },
    });

    if (
      current?.businessId === businessId &&
      current.origin === "ONLINE" &&
      current.providerKey === input.providerKey &&
      current.paymentMethodKey === input.paymentMethodKey
    ) {
      return current;
    }

    throw new AppError(
      "Subscription payment intent could not be reconciled safely",
      409,
    );
  }

  const reconciled = await prisma.subscriptionPaymentIntent.findUniqueOrThrow({
    where: { id: intent.id },
  });

  await recordAuditEvent({
    action: "subscription.payment_intent.reconciled",
    entityType: "SubscriptionPaymentIntent",
    entityId: reconciled.id,
    businessId,
    actorUserId: actorUserId ?? null,
    correlationId: correlationId ?? null,
    metadata: {
      plan: reconciled.plan,
      amount: reconciled.amount,
      currencyCode: reconciled.currencyCode,
      paymentReference: reconciled.paymentReference,
      previousOrigin: "OFFLINE",
      origin: reconciled.origin,
      providerKey: reconciled.providerKey,
      paymentMethodKey: reconciled.paymentMethodKey,
      reason,
    },
  });

  return reconciled;
}

export async function getSubscriptionPaymentIntent(
  businessId: string,
  intentId: string,
) {
  const intent = await prisma.subscriptionPaymentIntent.findUnique({
    where: { id: intentId },
  });

  if (!intent) {
    throw new AppError("Subscription payment intent not found", 404);
  }

  if (intent.businessId !== businessId) {
    throw new AppError(
      "Subscription payment intent belongs to another business",
      403,
    );
  }

  return intent;
}
