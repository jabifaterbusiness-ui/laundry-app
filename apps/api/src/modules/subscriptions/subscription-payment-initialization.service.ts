import { prisma } from "../../lib/prisma.js";
import { config } from "../../config/index.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import { getSubscriptionPaymentProvider } from "./providers/payment-provider.registry.js";

export async function initializeSubscriptionPayment(
  businessId: string,
  intentId: string,
  actorUserId?: string | null,
  correlationId?: string | null,
) {
  const intent = await prisma.subscriptionPaymentIntent.findUnique({
    where: { id: intentId },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!intent) {
    throw new AppError("Subscription payment intent not found", 404);
  }

  if (intent.businessId !== businessId) {
    throw new AppError("Subscription payment intent belongs to another business", 403);
  }

  if (intent.origin !== "ONLINE") {
    throw new AppError(
      "Offline subscription payment intents cannot be initialized through an online provider",
      400,
    );
  }

  if (!intent.providerKey || !intent.paymentMethodKey) {
    throw new AppError(
      "Payment intent is missing its payment provider or payment method",
      400,
    );
  }

  if (intent.status === "SUCCESSFUL") {
    throw new AppError("Subscription payment intent has already been completed", 409);
  }

  if (
    intent.providerCheckoutReference &&
    (intent.status === "PENDING" || intent.status === "PROCESSING")
  ) {
    return intent;
  }

  const provider = getSubscriptionPaymentProvider(intent.providerKey);

  const result = await provider.initializePayment({
    businessId,
    paymentReference: intent.paymentReference,
    plan: intent.plan,
    amount: intent.amount,
    currencyCode: intent.currencyCode,
    paymentMethodKey: intent.paymentMethodKey,
    customerEmail: intent.business.email,
    customerName: intent.business.name,
    callbackUrl: `${config.webAppUrl}/subscriptions?payment_intent=${encodeURIComponent(intent.id)}`,
  });

  if (result.providerKey !== intent.providerKey) {
    throw new AppError(
      "Payment provider returned an unexpected provider identity",
      502,
    );
  }

  if (!result.providerCheckoutReference) {
    throw new AppError(
      "Payment provider returned no checkout reference",
      502,
    );
  }

  const updatedIntent = await prisma.subscriptionPaymentIntent.update({
    where: { id: intent.id },
    data: {
      providerCheckoutReference: result.providerCheckoutReference,
      providerCheckoutUrl: result.checkoutUrl ?? null,
      status: result.status,
    },
  });

  await recordAuditEvent({
    action: "subscription.payment_initialization.created",
    entityType: "SubscriptionPaymentIntent",
    entityId: intent.id,
    businessId,
    actorUserId: actorUserId ?? null,
    correlationId: correlationId ?? null,
    metadata: {
      plan: intent.plan,
      amount: intent.amount,
      currencyCode: intent.currencyCode,
      paymentReference: intent.paymentReference,
      providerKey: intent.providerKey,
      paymentMethodKey: intent.paymentMethodKey,
      providerCheckoutReference: result.providerCheckoutReference,
      status: result.status,
    },
  });

  return updatedIntent;
}
