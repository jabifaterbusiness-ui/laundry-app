import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { sendHtmlEmail } from "../invoices/providers/resend.provider.js";
import { sendWhatsAppReceipt } from "../invoices/providers/whatsapp.provider.js";
import { generateBusinessFinancialStatement } from "./business-financial-statement.persistence.service.js";
import { renderFinancialStatementEmail } from "./templates/financial-statement-email.js";
import { renderFinancialStatementImage } from "./templates/financial-statement-image.js";
import { logger } from "../../lib/logger.js";

type BusinessForScheduler = {
  id: string;
  name: string;
  timezone: string;
  currencyCode: string;
  financialStatementConfig: {
    id: string;
    businessId: string;
    enabled: boolean;
    dayOfMonth: number;
    hour: number;
    minute: number;
    emailEnabled: boolean;
    whatsappEnabled: boolean;
    dailyEnabled: boolean;
    dailyHour: number;
    dailyMinute: number;
    dailyEmailEnabled: boolean;
    dailyWhatsappEnabled: boolean;
  } | null;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const MAX_DELIVERY_ATTEMPTS = 5;
const DELIVERY_RETRY_INTERVAL_MS = 15 * 60 * 1000;

function localParts(date: Date, timezone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new Error(`Unable to determine ${type} in ${timezone}`);
    return Number(value);
  };

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function timezoneOffsetMs(date: Date, timezone: string) {
  const parts = localParts(date, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );

  return asUtc - date.getTime();
}

function zonedMidnightUtc(
  year: number,
  month: number,
  timezone: string,
) {
  let guess = new Date(Date.UTC(year, month - 1, 1));

  for (let i = 0; i < 3; i += 1) {
    guess = new Date(
      Date.UTC(year, month - 1, 1) - timezoneOffsetMs(guess, timezone),
    );
  }

  return guess;
}

function previousMonthRange(now: Date, timezone: string) {
  const current = localParts(now, timezone);

  const currentMonthStart = zonedMidnightUtc(
    current.year,
    current.month,
    timezone,
  );

  const previousMonthYear =
    current.month === 1 ? current.year - 1 : current.year;
  const previousMonth =
    current.month === 1 ? 12 : current.month - 1;

  const previousMonthStart = zonedMidnightUtc(
    previousMonthYear,
    previousMonth,
    timezone,
  );

  return {
    from: previousMonthStart,
    to: currentMonthStart,
    year: previousMonthYear,
    month: previousMonth,
  };
}

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function isDue(
  now: Date,
  business: BusinessForScheduler,
) {
  const config = business.financialStatementConfig ?? {
    id: "",
    businessId: business.id,
    enabled: true,
    dayOfMonth: 1,
    hour: 8,
    minute: 0,
    emailEnabled: true,
    whatsappEnabled: false,
    dailyEnabled: false,
    dailyHour: 8,
    dailyMinute: 0,
    dailyEmailEnabled: true,
    dailyWhatsappEnabled: false,
  };

  if (!config.enabled) return false;

  const current = localParts(now, business.timezone);

  if (current.day < config.dayOfMonth) return false;

  if (current.day === config.dayOfMonth) {
    return (
      current.hour > config.hour ||
      (current.hour === config.hour && current.minute >= config.minute)
    );
  }

  return true;
}

async function ensureOwnerRecipients(
  businessId: string,
) {
  const owners = await prisma.user.findMany({
    where: {
      businessId,
      role: "BUSINESS_OWNER",
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
    },
  });

  for (const owner of owners) {
    await prisma.financialStatementRecipient.upsert({
      where: {
        businessId_userId: {
          businessId,
          userId: owner.id,
        },
      },
      create: {
        businessId,
        userId: owner.id,
        enabled: true,
      },
      update: {
        enabled: true,
      },
    });
  }

  return owners;
}

async function deliverOne(
  statementId: string,
  recipientId: string,
  channel: "EMAIL" | "WHATSAPP",
  destination: string,
  input: {
    businessName: string;
    periodLabel: string;
    currencyCode: string;
    report: Awaited<ReturnType<typeof generateBusinessFinancialStatement>>["report"];
  },
) {
  const delivery = await prisma.financialStatementDelivery.upsert({
    where: {
      statementId_recipientId_channel: {
        statementId,
        recipientId,
        channel,
      },
    },
    create: {
      statementId,
      recipientId,
      channel,
      destination,
      status: "PENDING",
    },
    update: {
      destination,
    },
  });

  if (delivery.status === "SENT") {
    return;
  }

  if (delivery.attemptCount >= MAX_DELIVERY_ATTEMPTS) {
    return;
  }

  if (
    delivery.status === "FAILED" &&
    delivery.lastAttemptAt &&
    Date.now() - delivery.lastAttemptAt.getTime() < DELIVERY_RETRY_INTERVAL_MS
  ) {
    return;
  }

  const attemptAt = new Date();

  await prisma.financialStatementDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "PENDING",
      attemptCount: { increment: 1 },
      lastAttemptAt: attemptAt,
      failureReason: null,
    },
  });

  try {
    const result =
      channel === "EMAIL"
        ? await sendHtmlEmail({
            to: destination,
            subject: `${input.businessName} — Monthly Financial Statement — ${input.periodLabel}`,
            html: renderFinancialStatementEmail(input),
          })
        : await sendWhatsAppReceipt({
            to: destination,
            image: await renderFinancialStatementImage(input),
            caption: `${input.businessName} — Monthly Financial Statement — ${input.periodLabel}`,
          });

    await prisma.financialStatementDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SENT",
        providerMessageId: result.id,
        sentAt: new Date(),
        failureReason: null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown delivery error";

    await prisma.financialStatementDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        failureReason: message.slice(0, 1000),
      },
    });

    throw error;
  }
}

async function processBusiness(
  business: BusinessForScheduler,
  now: Date,
) {
  if (!isDue(now, business)) return;

  const range = previousMonthRange(now, business.timezone);

  const { statement, report } =
    await generateBusinessFinancialStatement({
      businessId: business.id,
      from: range.from,
      to: range.to,
    });

  const config = business.financialStatementConfig ?? {
    emailEnabled: true,
    whatsappEnabled: false,
  };

  await ensureOwnerRecipients(business.id);

  const recipients = await prisma.financialStatementRecipient.findMany({
    where: {
      businessId: business.id,
      enabled: true,
      user: {
        isActive: true,
      },
    },
    select: {
      id: true,
      whatsappNumber: true,
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
        },
      },
    },
  });

  const periodLabel = monthLabel(range.year, range.month);

  for (const recipient of recipients) {
    if (config.emailEnabled && recipient.user.email) {
      try {
        await deliverOne(
          statement.id,
          recipient.id,
          "EMAIL",
          recipient.user.email,
          {
            businessName: business.name,
            periodLabel,
            currencyCode: business.currencyCode,
            report,
          },
        );
      } catch (error) {
        logger.error(
          error instanceof Error
            ? `Financial statement email delivery failed for ${business.id}/${recipient.user.id}: ${error.message}`
            : `Financial statement email delivery failed for ${business.id}/${recipient.user.id}`,
        );
      }
    }

    if (config.whatsappEnabled && recipient.whatsappNumber) {
      try {
        await deliverOne(
          statement.id,
          recipient.id,
          "WHATSAPP",
          recipient.whatsappNumber,
          {
            businessName: business.name,
            periodLabel,
            currencyCode: business.currencyCode,
            report,
          },
        );
      } catch (error) {
        logger.error(
          error instanceof Error
            ? `Financial statement WhatsApp delivery failed for ${business.id}/${recipient.user.id}: ${error.message}`
            : `Financial statement WhatsApp delivery failed for ${business.id}/${recipient.user.id}`,
        );
      }
    }
  }

  await recordAuditEvent({
    action: "financial_statement.monthly.processed",
    entityType: "FinancialStatement",
    entityId: statement.id,
    businessId: business.id,
    actorUserId: null,
    correlationId: null,
    metadata: {
      periodStart: range.from.toISOString(),
      periodEnd: range.to.toISOString(),
      periodLabel,
    },
  });
}

export async function processMonthlyFinancialStatements(
  now = new Date(),
) {
  const businesses = await prisma.business.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      timezone: true,
      currencyCode: true,
      financialStatementConfig: {
        select: {
          id: true,
          businessId: true,
          enabled: true,
          dayOfMonth: true,
          hour: true,
          minute: true,
          emailEnabled: true,
          whatsappEnabled: true,
          dailyEnabled: true,
          dailyHour: true,
          dailyMinute: true,
          dailyEmailEnabled: true,
          dailyWhatsappEnabled: true,
        },
      },
    },
  });

  for (const business of businesses) {
    try {
      await processBusiness(business, now);
    } catch (error) {
      logger.error(
        error instanceof Error
          ? `Monthly financial statement processing failed for ${business.id}: ${error.message}`
          : `Monthly financial statement processing failed for ${business.id}`,
      );
    }
  }

  return {
    businessesScanned: businesses.length,
  };
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startFinancialStatementScheduler() {
  if (schedulerTimer) return;

  const run = () => {
    void processMonthlyFinancialStatements().catch((error) => {
      logger.error(
        error instanceof Error
          ? `Financial statement scheduler failed: ${error.message}`
          : "Financial statement scheduler failed.",
      );
    });
  };

  schedulerTimer = setInterval(run, 60_000);
  schedulerTimer.unref?.();

  run();

  logger.info("Monthly financial statement scheduler started.");
}

export function stopFinancialStatementScheduler() {
  if (!schedulerTimer) return;

  clearInterval(schedulerTimer);
  schedulerTimer = null;
}
