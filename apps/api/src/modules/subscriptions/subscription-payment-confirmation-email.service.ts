import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { EmailDeliveryError, sendEmail } from "../email/email.service.js";
import { renderSubscriptionPaymentConfirmationEmail } from "./templates/subscription-payment-confirmation-email.js";
import { isAutomatedNotificationsEnabled } from "../platform/platform-controls.middleware.js";

function sanitizeEmailError(error: unknown): string {
  return error instanceof EmailDeliveryError
    ? error.message
    : "Email submission failed.";
}

export async function sendSubscriptionPaymentConfirmationEmail(
  paymentId: string,
  actorUserId?: string | null,
  correlationId?: string | null,
): Promise<{
  submitted: boolean;
  skipped: boolean;
  messageId?: string;
}> {
  const payment = await prisma.subscriptionPayment.findUnique({
    where: { id: paymentId },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          email: true,
          paymentIdentity: {
            select: {
              businessCode: true,
              paymentCode: true,
            },
          },
        },
      },
      subscription: {
        select: {
          id: true,
          plan: true,
          startsAt: true,
          endsAt: true,
        },
      },
    },
  });

  if (!payment) {
    throw new Error("Subscription payment not found");
  }

  if (payment.status !== "SUCCESSFUL") {
    throw new Error(
      "Subscription payment confirmation email requires a successful payment",
    );
  }

  if (!(await isAutomatedNotificationsEnabled())) {
    await recordAuditEvent({
      action: "subscription.payment.confirmation_email_skipped",
      entityType: "SubscriptionPayment",
      entityId: payment.id,
      businessId: payment.businessId,
      actorUserId: actorUserId ?? null,
      correlationId: correlationId ?? null,
      metadata: {
        paymentReference: payment.paymentReference,
        reason: "automated_notifications_disabled",
      },
    });

    return {
      submitted: false,
      skipped: true,
    };
  }

  if (payment.confirmationEmailSentAt) {
    return payment.confirmationEmailProviderMessageId
      ? {
          submitted: false,
          skipped: true,
          messageId: payment.confirmationEmailProviderMessageId,
        }
      : {
          submitted: false,
          skipped: true,
        };
  }

  const attemptCount = payment.confirmationEmailAttemptCount ?? 0;
  if (attemptCount >= 5 ||
      (payment.confirmationEmailLastError && !payment.confirmationEmailRetryable)) {
    return { submitted: false, skipped: true };
  }
  if (payment.confirmationEmailLastAttemptAt &&
      Date.now() - payment.confirmationEmailLastAttemptAt.getTime() < 15 * 60 * 1000) {
    return { submitted: false, skipped: true };
  }

  if (!payment.business.email) {
    await recordAuditEvent({
      action: "subscription.payment.confirmation_email_skipped",
      entityType: "SubscriptionPayment",
      entityId: payment.id,
      businessId: payment.businessId,
      actorUserId: actorUserId ?? null,
      correlationId: correlationId ?? null,
      metadata: {
        paymentReference: payment.paymentReference,
        reason: "business_email_missing",
      },
    });

    return {
      submitted: false,
      skipped: true,
    };
  }

  if (!payment.subscription) {
    throw new Error(
      "Subscription payment has no associated subscription",
    );
  }

  try {
    const attemptAt = new Date();
    const claimed = await prisma.subscriptionPayment.updateMany({
      where: {
        id: payment.id,
        confirmationEmailSentAt: null,
        confirmationEmailAttemptCount: attemptCount,
        confirmationEmailLastAttemptAt: payment.confirmationEmailLastAttemptAt ?? null,
      },
      data: {
        confirmationEmailAttemptCount: { increment: 1 },
        confirmationEmailLastAttemptAt: attemptAt,
        confirmationEmailLastError: null,
        confirmationEmailRetryable: false,
      },
    });
    if (claimed.count !== 1) return { submitted: false, skipped: true };

    const html = renderSubscriptionPaymentConfirmationEmail({
      companyName: payment.business.name,
      paymentReference: payment.paymentReference,
      providerTransactionId: payment.providerTransactionId,
      paymentMethod: payment.paymentMethodKey,
      amount: payment.amount,
      currencyCode: payment.currencyCode,
      plan: payment.subscription.plan,
      startsAt: payment.subscription.startsAt,
      endsAt: payment.subscription.endsAt,
      businessCode: payment.business.paymentIdentity?.businessCode ?? null,
      paymentCode: payment.business.paymentIdentity?.paymentCode ?? null,
    });

    const result = await sendEmail({
      to: payment.business.email,
      subject: `Subscription payment confirmed — ${payment.business.name}`,
      html,
      fromName: payment.business.name,
      replyTo: payment.business.email,
      feature: "subscription",
      idempotencyKey: `subscription-payment:${payment.id}:confirmation`,
    });

    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        confirmationEmailSentAt: new Date(),
        confirmationEmailProviderMessageId: result.id,
        confirmationEmailLastError: null,
        confirmationEmailRetryable: false,
      },
    });

    await recordAuditEvent({
      action: "subscription.payment.confirmation_email_submitted",
      entityType: "SubscriptionPayment",
      entityId: payment.id,
      businessId: payment.businessId,
      actorUserId: actorUserId ?? null,
      correlationId: correlationId ?? null,
      metadata: {
        paymentReference: payment.paymentReference,
        providerMessageId: result.id,
      },
    });

    return {
      submitted: true,
      skipped: false,
      messageId: result.id,
    };
  } catch (error) {
    const safeError = sanitizeEmailError(error);

    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        confirmationEmailLastError: safeError,
        confirmationEmailRetryable: error instanceof EmailDeliveryError && error.retryable,
      },
    });

    await recordAuditEvent({
      action: "subscription.payment.confirmation_email_failed",
      entityType: "SubscriptionPayment",
      entityId: payment.id,
      businessId: payment.businessId,
      actorUserId: actorUserId ?? null,
      correlationId: correlationId ?? null,
      metadata: {
        paymentReference: payment.paymentReference,
        error: safeError,
      },
    });

    return {
      submitted: false,
      skipped: false,
    };
  }
}
