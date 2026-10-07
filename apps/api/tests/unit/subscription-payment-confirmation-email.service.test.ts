import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  platformConfig: {
    upsert: vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      allowNewBusinessRegistration: true,
      maintenanceMode: false,
      whatsappMessagingEnabled: true,
      automatedNotificationsEnabled: true,
      offlineSyncEnabled: true,
      version: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
  },
  subscriptionPayment: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const auditMock = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(),
}));

const emailMock = vi.hoisted(() => ({
  sendHtmlEmail: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/lib/audit.js", () => auditMock);

vi.mock(
  "../../src/modules/invoices/providers/resend.provider.js",
  () => emailMock,
);

import { sendSubscriptionPaymentConfirmationEmail } from "../../src/modules/subscriptions/subscription-payment-confirmation-email.service.js";

describe("sendSubscriptionPaymentConfirmationEmail", () => {
  const payment = {
    id: "payment-1",
    businessId: "business-1",
    paymentReference: "LA-PAY-TEST-123",
    providerTransactionId: "transaction-123",
    providerKey: "paystack",
    paymentMethodKey: "CARD",
    amount: 15000,
    currencyCode: "NGN",
    status: "SUCCESSFUL",
    confirmationEmailSentAt: null,
    confirmationEmailProviderMessageId: null,
    confirmationEmailLastError: null,
    business: {
      id: "business-1",
      name: "Test Laundry",
      email: "owner@example.com",
      paymentIdentity: {
        businessCode: "LA-BIZ-AAAA1111",
        paymentCode: "LA-AAAA1111",
      },
    },
    subscription: {
      id: "sub-1",
      plan: "MONTHLY",
      startsAt: new Date("2026-09-17T10:00:00.000Z"),
      endsAt: new Date("2026-10-17T10:00:00.000Z"),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.subscriptionPayment.findUnique.mockResolvedValue(payment);
    prismaMock.subscriptionPayment.update.mockResolvedValue({
      ...payment,
      confirmationEmailSentAt: new Date(),
      confirmationEmailProviderMessageId: "email-123",
    });

    emailMock.sendHtmlEmail.mockResolvedValue({
      id: "email-123",
    });
  });

  it("sends and records a successful confirmation email", async () => {
    const result = await sendSubscriptionPaymentConfirmationEmail(
      "payment-1",
      "owner-1",
      "correlation-1",
    );

    expect(result).toEqual({
      sent: true,
      skipped: false,
      messageId: "email-123",
    });

    expect(emailMock.sendHtmlEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        subject: "Subscription payment confirmed — Test Laundry",
        html: expect.stringContaining("LA-PAY-TEST-123"),
      }),
    );

    expect(prismaMock.subscriptionPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment-1" },
        data: expect.objectContaining({
          confirmationEmailProviderMessageId: "email-123",
        }),
      }),
    );

    expect(auditMock.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "subscription.payment.confirmation_email_sent",
        entityId: "payment-1",
      }),
    );
  });

  it("does not send a duplicate confirmation email", async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      ...payment,
      confirmationEmailSentAt: new Date("2026-09-17T10:01:00.000Z"),
      confirmationEmailProviderMessageId: "email-existing",
    });

    const result = await sendSubscriptionPaymentConfirmationEmail(
      "payment-1",
    );

    expect(result).toEqual({
      sent: false,
      skipped: true,
      messageId: "email-existing",
    });

    expect(emailMock.sendHtmlEmail).not.toHaveBeenCalled();
    expect(prismaMock.subscriptionPayment.update).not.toHaveBeenCalled();
  });

  it("skips delivery when the business has no email", async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      ...payment,
      business: {
        ...payment.business,
        email: null,
      },
    });

    const result = await sendSubscriptionPaymentConfirmationEmail(
      "payment-1",
    );

    expect(result).toEqual({
      sent: false,
      skipped: true,
    });

    expect(emailMock.sendHtmlEmail).not.toHaveBeenCalled();

    expect(auditMock.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "subscription.payment.confirmation_email_skipped",
      }),
    );
  });

  it("does not fail payment processing when email delivery fails", async () => {
    emailMock.sendHtmlEmail.mockRejectedValueOnce(
      new Error("Resend email delivery failed: provider unavailable"),
    );

    const result = await sendSubscriptionPaymentConfirmationEmail(
      "payment-1",
    );

    expect(result).toEqual({
      sent: false,
      skipped: false,
    });

    expect(prismaMock.subscriptionPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment-1" },
        data: {
          confirmationEmailLastError:
            "Resend email delivery failed: provider unavailable",
        },
      }),
    );

    expect(auditMock.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "subscription.payment.confirmation_email_failed",
      }),
    );
  });

  it("rejects non-successful payments", async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      ...payment,
      status: "FAILED",
    });

    await expect(
      sendSubscriptionPaymentConfirmationEmail("payment-1"),
    ).rejects.toThrow(/requires a successful payment/);

    expect(emailMock.sendHtmlEmail).not.toHaveBeenCalled();
  });
});
