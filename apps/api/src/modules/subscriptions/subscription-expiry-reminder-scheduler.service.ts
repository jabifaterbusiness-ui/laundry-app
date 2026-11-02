import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";

function localDayKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = get("year"), month = get("month"), day = get("day");
  if (!year || !month || !day) throw new Error("Unable to determine local date in " + timezone);
  return year + "-" + month + "-" + day;
}

export async function processSubscriptionExpiryReminders(now = new Date()) {
  const windowEnd = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      endsAt: { lte: windowEnd },
      business: { isActive: true, archivedAt: null },
    },
    select: { id: true, businessId: true, endsAt: true, business: { select: {
      name: true, timezone: true,
      users: { where: { securityRole: "BUSINESS_OWNER", isActive: true, deletedAt: null }, select: { id: true } },
    } } },
  });
  let recipients = 0;
  for (const subscription of subscriptions) {
    const expired = subscription.endsAt <= now;
    const dayKey = localDayKey(now, subscription.business.timezone);
    const expiresOn = new Intl.DateTimeFormat("en-NG", { timeZone: subscription.business.timezone, dateStyle: "long" }).format(subscription.endsAt);
    const owners = subscription.business.users;
    if (owners.length === 0) continue;
    const result = await prisma.businessInboxMessage.createMany({
      data: owners.map((owner) => ({
        broadcastId: expired
          ? "subscription-expired:" + subscription.id
          : "subscription-expiry:" + subscription.id + ":" + dayKey,
        notificationKey: expired
          ? "subscription-expired:" + subscription.id + ":" + owner.id
          : "subscription-expiry:" + subscription.id + ":" + owner.id + ":" + dayKey,
        sourceSubscriptionId: subscription.id,
        businessId: subscription.businessId, userId: owner.id,
        title: expired
          ? "Your LaundryAngel subscription has expired"
          : "Your LaundryAngel subscription is expiring soon",
        body: expired
          ? subscription.business.name + ": your subscription expired on " + expiresOn + ". Renew now to restore access to business operations."
          : subscription.business.name + ": your subscription expires on " + expiresOn + ". Renew before the expiry date to avoid interruption to business operations.",
        displayDurationMinutes: 10,
        publishedAt: now,
        // Keep the notice visible in the inbox for 30 days after the later
        // of now or the expiry date; it must not disappear at the moment
        // the subscription expires.
        expiresAt: new Date(Math.max(subscription.endsAt.getTime(), now.getTime()) + 30 * 24 * 60 * 60 * 1000),
        createdByPlatformAdminId: "SYSTEM",
      })),
      skipDuplicates: true,
    });
    recipients += result.count;
  }
  return { subscriptionsScanned: subscriptions.length, remindersCreated: recipients };
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;
export function startSubscriptionExpiryReminderScheduler() {
  if (schedulerTimer) return;
  const run = () => {
    if (processing) return;
    processing = true;
    void processSubscriptionExpiryReminders()
      .then((result) => { if (result.remindersCreated > 0) logger.info("Subscription expiry reminders created: " + result.remindersCreated); })
      .catch((error) => { logger.error(error instanceof Error ? "Subscription expiry reminder scheduler failed: " + error.message : "Subscription expiry reminder scheduler failed."); })
      .finally(() => { processing = false; });
  };
  schedulerTimer = setInterval(run, 60_000);
  schedulerTimer.unref?.();
  run();
  logger.info("Subscription expiry reminder scheduler started.");
}
export function stopSubscriptionExpiryReminderScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}
