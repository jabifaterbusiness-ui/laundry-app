import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { sendHtmlEmail } from "../invoices/providers/resend.provider.js";
import { renderSubscriptionPaymentConfirmationEmail } from "./templates/subscription-payment-confirmation-email.js";

function sanitizeEmailError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error);

  return message.length > 500 ? message.slice(0, 500) : message;
}

export async function sendSubscriptionPaymentConfirmationEmail(
  paymentId: string,
  actorUserId?: string | null,
  correlationId?: string | null,
): Promise<{
  sent: boolean;
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

  if (payment.confirmationEmailSentAt) {
    return payment.confirmationEmailProviderMessageId
      ? {
          sent: false,
          skipped: true,
          messageId: payment.confirmationEmailProviderMessageId,
        }
      : {
          sent: false,
          skipped: true,
        };
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
      sent: false,
      skipped: true,
    };
  }

  if (!payment.subscription) {
    throw new Error(
      "Subscription payment has no associated subscription",
    );
  }

  try {
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

    const result = await sendHtmlEmail({
      to: payment.business.email,
      subject: `Subscription payment confirmed — ${payment.business.name}`,
      html,
    });

    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        confirmationEmailSentAt: new Date(),
        confirmationEmailProviderMessageId: result.id,
        confirmationEmailLastError: null,
      },
    });

    await recordAuditEvent({
      action: "subscription.payment.confirmation_email_sent",
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
      sent: true,
      skipped: false,
      messageId: result.id,
    };
  } catch (error) {
    const safeError = sanitizeEmailError(error);

    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        confirmationEmailLastError: safeError,
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
      sent: false,
      skipped: false,
    };
  }
}
