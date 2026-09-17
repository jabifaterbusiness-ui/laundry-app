import { randomBytes } from "node:crypto";
import type { PaymentIntentOrigin, SubscriptionPlan } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import { ensureBusinessPaymentIdentity } from "../payments/business-payment-identity.service.js";
import { getSubscriptionPrice } from "./subscription-pricing.service.js";
import { validatePaymentSelection } from "../platform/payment-config.service.js";
import type { CreateSubscriptionPaymentIntentInput } from "./subscription-payment-intent.validation.js";

const PAYMENT_REFERENCE_PREFIX = "LA-PAY-";

function generatePaymentReference(paymentCode: string) {
  const suffix = randomBytes(5).toString("hex").toUpperCase();
  return `${PAYMENT_REFERENCE_PREFIX}${paymentCode.replace(/^LA-/, "")}-${suffix}`;
}

export async function createSubscriptionPaymentIntent(
  businessId: string,
  input: CreateSubscriptionPaymentIntentInput,
  actorUserId?: string | null,
  correlationId?: string | null,
) {
  const existing = await prisma.subscriptionPaymentIntent.findUnique({
    where: {
      idempotencyKey: input.idempotencyKey,
    },
  });

  if (existing) {
    if (existing.businessId !== businessId) {
      throw new AppError("Idempotency key belongs to another business", 409);
    }

    if (existing.plan !== input.plan) {
      throw new AppError(
        "Idempotency key was already used for a different subscription plan",
        409,
      );
    }

    return existing;
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      countryCode: true,
      currencyCode: true,
    },
  });

  if (!business) {
    throw new AppError("Business not found", 404);
  }

  const [identity, price] = await Promise.all([
    ensureBusinessPaymentIdentity(businessId),
    getSubscriptionPrice(
      input.plan as SubscriptionPlan,
      business.countryCode,
      business.currencyCode,
    ),
  ]);

  if (input.origin === "ONLINE") {
    await validatePaymentSelection(
      business.countryCode,
      business.currencyCode,
      input.providerKey,
      input.paymentMethodKey,
    );
  }

  const paymentReference = generatePaymentReference(identity.paymentCode);

  try {
    const intent = await prisma.subscriptionPaymentIntent.create({
      data: {
        businessId,
        plan: input.plan,
        amount: price.amount,
        currencyCode: price.currencyCode,
        paymentReference,
        idempotencyKey: input.idempotencyKey,
        origin: input.origin as PaymentIntentOrigin,
        status: "CREATED",
        ...(input.providerKey !== undefined && {
          providerKey: input.providerKey,
        }),
        ...(input.paymentMethodKey !== undefined && {
          paymentMethodKey: input.paymentMethodKey,
        }),
      },
    });

    await recordAuditEvent({
      action: "subscription.payment_intent.created",
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
        origin: intent.origin,
        providerKey: intent.providerKey,
        paymentMethodKey: intent.paymentMethodKey,
      },
    });

    return intent;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const retryExisting =
        await prisma.subscriptionPaymentIntent.findUnique({
          where: {
            idempotencyKey: input.idempotencyKey,
          },
        });

      if (retryExisting?.businessId === businessId) {
        return retryExisting;
      }
    }

    throw error;
  }
}
