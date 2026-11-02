import type { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import type { CreateSubscriptionInput } from "./subscriptions.validation.js";

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

export function getSubscriptionStatus(
  endsAt: Date,
  status: SubscriptionStatus,
  now = new Date(),
  cancelAtPeriodEnd = false,
): SubscriptionStatus {
  if (status === "CANCELLED") {
    return "CANCELLED";
  }

  if (endsAt <= now) {
    return cancelAtPeriodEnd ? "CANCELLED" : "EXPIRED";
  }

  if (status === "EXPIRED") {
    return "EXPIRED";
  }

  return "ACTIVE";
}

export async function getBusinessSubscription(businessId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
  });

  if (!subscription) {
    throw new AppError("Business subscription not found", 404);
  }

  const effectiveStatus = getSubscriptionStatus(
    subscription.endsAt,
    subscription.status,
    new Date(),
    subscription.cancelAtPeriodEnd,
  );

  if (effectiveStatus !== subscription.status) {
    return prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: effectiveStatus },
    });
  }

  return subscription;
}

export async function createOrRenewSubscription(
  businessId: string,
  input: CreateSubscriptionInput,
) {
  const now = new Date();
  const existing = await prisma.subscription.findUnique({
    where: { businessId },
  });

  let startsAt: Date;

  if (existing && existing.endsAt > now) {
    // Preserve all remaining paid time by extending from the current end.
    startsAt = existing.endsAt;
  } else {
    // Expired or new subscriptions begin now unless a future start was
    // explicitly requested.
    startsAt = input.startsAt ?? now;
  }

  const endsAt = addPlanDuration(startsAt, input.plan);

  const renewed = await prisma.subscription.upsert({
    where: { businessId },
    create: {
      businessId,
      plan: input.plan,
      status: "ACTIVE",
      startsAt,
      endsAt,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      cancellationReason: null,
    },
    update: {
      plan: input.plan,
      status: "ACTIVE",
      startsAt,
      endsAt,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      cancellationReason: null,
    },
  });

  if (existing) {
    await prisma.businessInboxMessage.updateMany({
      where: { sourceSubscriptionId: existing.id },
      data: { expiresAt: now },
    });
  }

  return renewed;
}

export async function requireActiveSubscription(businessId: string) {
  const subscription = await getBusinessSubscription(businessId);

  if (subscription.status !== "ACTIVE" || subscription.endsAt <= new Date()) {
    throw new AppError(
      "Business subscription has expired. Please renew to continue.",
      402,
    );
  }

  return subscription;
}
