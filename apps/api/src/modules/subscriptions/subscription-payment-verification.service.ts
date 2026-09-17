import type { Prisma, SubscriptionPlan } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import { getSubscriptionPaymentProvider } from "./providers/payment-provider.registry.js";

function addPlanDuration(date: Date, plan: SubscriptionPlan) {
  const result = new Date(date);

  switch (plan) {
    case "WEEKLY":
      result.setDate(result.getDate() + 7);
      break;
    case "MONTHLY":
      result.setMonth(result.getMonth() + 1);
      break;
    case "QUARTERLY":
      result.setMonth(result.getMonth() + 3);
      break;
    case "YEARLY":
      result.setFullYear(result.getFullYear() + 1);
      break;
  }

  return result;
}

async function activateSubscriptionForVerifiedPayment(
  tx: Prisma.TransactionClient,
  businessId: string,
  plan: SubscriptionPlan,
) {
  const now = new Date();

  const existing = await tx.subscription.findUnique({
    where: { businessId },
  });

  const startsAt =
    existing && existing.endsAt > now ? existing.endsAt : now;

  const endsAt = addPlanDuration(startsAt, plan);

  return tx.subscription.upsert({
    where: { businessId },
    create: {
      businessId,
      plan,
      status: "ACTIVE",
      startsAt,
      endsAt,
    },
    update: {
      plan,
      status: "ACTIVE",
      startsAt,
      endsAt,
    },
  });
}

export async function verifySubscriptionPayment(
  businessId: string,
  intentId: string,
  actorUserId?: string | null,
  correlationId?: string | null,
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

  if (intent.origin !== "ONLINE") {
    throw new AppError(
      "Offline subscription payment intents require separate reconciliation",
      400,
    );
  }

  if (!intent.providerKey || !intent.paymentMethodKey) {
    throw new AppError(
      "Payment intent is missing its payment provider or payment method",
      400,
    );
  }

  const existingPayment = await prisma.subscriptionPayment.findUnique({
    where: { intentId: intent.id },
  });

  if (existingPayment?.status === "SUCCESSFUL") {
    return {
      intent,
      payment: existingPayment,
      subscription: await prisma.subscription.findUnique({
        where: { businessId },
      }),
      alreadyProcessed: true,
    };
  }

  const provider = getSubscriptionPaymentProvider(intent.providerKey);

  const verification = await provider.verifyPayment({
    paymentReference: intent.paymentReference,
    providerCheckoutReference: intent.providerCheckoutReference,
    expectedAmount: intent.amount,
    expectedCurrencyCode: intent.currencyCode,
  });

  if (verification.providerKey !== intent.providerKey) {
    throw new AppError(
      "Payment provider returned an unexpected provider identity",
      502,
    );
  }

  if (
    verification.amount !== intent.amount ||
    verification.currencyCode.toUpperCase() !== intent.currencyCode.toUpperCase()
  ) {
    throw new AppError(
      "Verified payment amount or currency does not match the payment intent",
      409,
    );
  }

  if (
    verification.paymentReference &&
    verification.paymentReference !== intent.paymentReference
  ) {
    throw new AppError(
      "Verified payment reference does not match the payment intent",
      409,
    );
  }

  if (verification.status === "PENDING") {
    const updatedIntent = await prisma.subscriptionPaymentIntent.update({
      where: { id: intent.id },
      data: { status: "PENDING" },
    });

    return {
      intent: updatedIntent,
      payment: null,
      subscription: null,
      alreadyProcessed: false,
    };
  }

  if (verification.status === "REQUIRES_VERIFICATION") {
    const updatedIntent = await prisma.subscriptionPaymentIntent.update({
      where: { id: intent.id },
      data: { status: "REQUIRES_VERIFICATION" },
    });

    return {
      intent: updatedIntent,
      payment: null,
      subscription: null,
      alreadyProcessed: false,
    };
  }

  if (verification.status === "FAILED") {
    const updatedIntent = await prisma.subscriptionPaymentIntent.update({
      where: { id: intent.id },
      data: { status: "FAILED" },
    });

    return {
      intent: updatedIntent,
      payment: null,
      subscription: null,
      alreadyProcessed: false,
    };
  }

  if (verification.status !== "SUCCESSFUL") {
    throw new AppError("Unsupported payment verification status", 502);
  }

  const result = await prisma.$transaction(async (tx) => {
    const currentIntent = await tx.subscriptionPaymentIntent.findUnique({
      where: { id: intent.id },
    });

    if (!currentIntent) {
      throw new AppError("Subscription payment intent not found", 404);
    }

    const alreadyRecorded = await tx.subscriptionPayment.findUnique({
      where: { intentId: currentIntent.id },
    });

    if (alreadyRecorded?.status === "SUCCESSFUL") {
      const subscription = await tx.subscription.findUnique({
        where: { businessId },
      });

      return {
        intent: currentIntent,
        payment: alreadyRecorded,
        subscription,
        alreadyProcessed: true,
      };
    }

    const subscription = await activateSubscriptionForVerifiedPayment(
      tx,
      businessId,
      currentIntent.plan,
    );

    const payment = await tx.subscriptionPayment.create({
      data: {
        businessId,
        subscriptionId: subscription.id,
        intentId: currentIntent.id,
        paymentReference: currentIntent.paymentReference,
        providerTransactionId: verification.providerTransactionId,
        providerKey: currentIntent.providerKey!,
        paymentMethodKey: verification.paymentMethodKey ?? currentIntent.paymentMethodKey!,
        amount: currentIntent.amount,
        currencyCode: currentIntent.currencyCode,
        status: "SUCCESSFUL",
        receivedAt: verification.receivedAt ?? new Date(),
        verifiedAt: new Date(),
        idempotencyKey: currentIntent.idempotencyKey,
        ...(verification.raw
          ? { metadata: { providerVerification: verification.raw } }
          : {}),
      },
    });

    const updatedIntent = await tx.subscriptionPaymentIntent.update({
      where: { id: currentIntent.id },
      data: { status: "SUCCESSFUL" },
    });

    return {
      intent: updatedIntent,
      payment,
      subscription,
      alreadyProcessed: false,
    };
  });

  await recordAuditEvent({
    action: "subscription.payment.verified",
    entityType: "SubscriptionPayment",
    entityId: result.payment.id,
    businessId,
    actorUserId: actorUserId ?? null,
    correlationId: correlationId ?? null,
    metadata: {
      paymentReference: result.payment.paymentReference,
      providerKey: result.payment.providerKey,
      providerTransactionId: result.payment.providerTransactionId,
      paymentMethodKey: result.payment.paymentMethodKey,
      amount: result.payment.amount,
      currencyCode: result.payment.currencyCode,
      subscriptionId: result.subscription?.id,
      subscriptionPlan: result.subscription?.plan,
      subscriptionEndsAt: result.subscription?.endsAt,
    },
  });

  return result;
}
