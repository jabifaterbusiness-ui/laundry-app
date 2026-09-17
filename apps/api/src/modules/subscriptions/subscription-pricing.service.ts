import type { SubscriptionPlan } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";

const PLATFORM_CONFIG_ID = "00000000-0000-4000-8000-000000000001";

export type SubscriptionPricingInput = {
  plan: SubscriptionPlan;
  countryCode: string;
  currencyCode: string;
  amount: number;
  isActive?: boolean | undefined;
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function validateAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError("Subscription price must be a positive whole number", 400);
  }
}

export async function getBusinessSubscriptionPrices(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      countryCode: true,
      currencyCode: true,
    },
  });

  if (!business) {
    throw new AppError("Business not found", 404);
  }

  const prices = await prisma.subscriptionPlanPrice.findMany({
    where: {
      platformConfigId: PLATFORM_CONFIG_ID,
      countryCode: normalizeCode(business.countryCode),
      currencyCode: normalizeCode(business.currencyCode),
      isActive: true,
    },
    orderBy: { plan: "asc" },
  });

  return {
    countryCode: normalizeCode(business.countryCode),
    currencyCode: normalizeCode(business.currencyCode),
    prices,
  };
}

export async function getSubscriptionPrice(
  plan: SubscriptionPlan,
  countryCode: string,
  currencyCode: string,
) {
  const normalizedCountry = normalizeCode(countryCode);
  const normalizedCurrency = normalizeCode(currencyCode);

  const price = await prisma.subscriptionPlanPrice.findFirst({
    where: {
      platformConfigId: PLATFORM_CONFIG_ID,
      plan,
      countryCode: normalizedCountry,
      currencyCode: normalizedCurrency,
      isActive: true,
    },
  });

  if (!price) {
    throw new AppError(
      `No active ${plan} subscription price is configured for ${normalizedCountry}/${normalizedCurrency}`,
      404,
    );
  }

  return price;
}

export async function listSubscriptionPrices() {
  return prisma.subscriptionPlanPrice.findMany({
    where: {
      platformConfigId: PLATFORM_CONFIG_ID,
    },
    orderBy: [
      { countryCode: "asc" },
      { currencyCode: "asc" },
      { plan: "asc" },
    ],
  });
}

export async function upsertSubscriptionPrice(
  input: SubscriptionPricingInput,
  actorUserId: string,
  correlationId?: string,
) {
  const countryCode = normalizeCode(input.countryCode);
  const currencyCode = normalizeCode(input.currencyCode);

  validateAmount(input.amount);

  const price = await prisma.subscriptionPlanPrice.upsert({
    where: {
      plan_countryCode_currencyCode: {
        plan: input.plan,
        countryCode,
        currencyCode,
      },
    },
    create: {
      platformConfigId: PLATFORM_CONFIG_ID,
      plan: input.plan,
      countryCode,
      currencyCode,
      amount: input.amount,
      isActive: input.isActive ?? true,
    },
    update: {
      amount: input.amount,
      isActive: input.isActive ?? true,
    },
  });

  await recordAuditEvent({
    action: "subscription.pricing.updated",
    entityType: "SubscriptionPlanPrice",
    entityId: price.id,
    actorUserId,
    correlationId: correlationId ?? null,
    metadata: {
      plan: price.plan,
      countryCode: price.countryCode,
      currencyCode: price.currencyCode,
      amount: price.amount,
      isActive: price.isActive,
    },
  });

  return price;
}

export async function setSubscriptionPriceActive(
  id: string,
  isActive: boolean,
  actorUserId: string,
  correlationId?: string,
) {
  const existing = await prisma.subscriptionPlanPrice.findUnique({
    where: { id },
  });

  if (!existing || existing.platformConfigId !== PLATFORM_CONFIG_ID) {
    throw new AppError("Subscription price not found", 404);
  }

  const updated = await prisma.subscriptionPlanPrice.update({
    where: { id },
    data: { isActive },
  });

  await recordAuditEvent({
    action: "subscription.pricing.status_updated",
    entityType: "SubscriptionPlanPrice",
    entityId: updated.id,
    actorUserId,
    correlationId: correlationId ?? null,
    metadata: {
      plan: updated.plan,
      countryCode: updated.countryCode,
      currencyCode: updated.currencyCode,
      previousActive: existing.isActive,
      isActive: updated.isActive,
    },
  });

  return updated;
}
