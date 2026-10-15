import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { createCloudBackupRun } from "./backup-cloud-runs.service.js";

type Schedule = {
  id: string;
  businessId: string;
  enabled: boolean;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  timezone: string;
  destinationConnectionId: string | null;
};

function localScheduleParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  const weekday = value("weekday");
  const day = Number(value("day"));
  const month = Number(value("month"));
  const year = Number(value("year"));
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  const weekdays: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  if (!weekday || !(weekday in weekdays) ||
      !Number.isInteger(day) || !Number.isInteger(month) ||
      !Number.isInteger(year) || !Number.isInteger(hour) ||
      !Number.isInteger(minute)) {
    throw new Error(`Unable to calculate scheduled backup time for ${timezone}.`);
  }
  return { weekday: weekdays[weekday]!, day, month, year, hour, minute };
}

export function isBackupScheduleDue(schedule: Schedule, now: Date): boolean {
  if (!schedule.enabled || !schedule.destinationConnectionId) return false;
  const local = localScheduleParts(now, schedule.timezone);
  if (local.hour !== schedule.hour || local.minute !== schedule.minute) return false;
  if (schedule.frequency === "WEEKLY" && local.weekday !== schedule.dayOfWeek) return false;
  if (schedule.frequency === "MONTHLY") {
    const lastDay = new Date(Date.UTC(local.year, local.month, 0)).getUTCDate();
    if (local.day !== Math.min(schedule.dayOfMonth, lastDay)) return false;
  }
  return true;
}

function isDuplicateSlot(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && (error as { code?: unknown }).code === "P2002";
}

export async function processScheduledCloudBackups(now = new Date()) {
  const schedules = await prisma.backupSchedule.findMany({
    where: {
      enabled: true,
      destinationConnectionId: { not: null },
      business: { isActive: true },
    },
    select: {
      id: true,
      businessId: true,
      enabled: true,
      frequency: true,
      dayOfWeek: true,
      dayOfMonth: true,
      hour: true,
      minute: true,
      timezone: true,
      destinationConnectionId: true,
    },
  });

  const scheduledFor = new Date(now);
  scheduledFor.setUTCSeconds(0, 0);
  let due = 0;
  let started = 0;

  for (const schedule of schedules) {
    try {
      if (!isBackupScheduleDue(schedule, now)) continue;
      due += 1;
      await createCloudBackupRun(schedule.businessId, schedule.destinationConnectionId!, {
        trigger: "SCHEDULED",
        scheduledFor,
        scheduleId: schedule.id,
      });
      started += 1;
    } catch (error) {
      if (isDuplicateSlot(error)) continue;
      logger.error(
        error instanceof Error
          ? `Scheduled cloud backup failed for business ${schedule.businessId}: ${error.message}`
          : `Scheduled cloud backup failed for business ${schedule.businessId}.`,
      );
    }
  }

  return { schedulesScanned: schedules.length, due, started };
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;

export function startBackupCloudScheduler() {
  if (schedulerTimer) return;

  const run = () => {
    if (processing) return;
    processing = true;
    void processScheduledCloudBackups()
      .catch((error) => {
        logger.error(
          error instanceof Error
            ? `Cloud backup scheduler failed: ${error.message}`
            : "Cloud backup scheduler failed.",
        );
      })
      .finally(() => {
        processing = false;
      });
  };

  schedulerTimer = setInterval(run, 10_000);
  schedulerTimer.unref?.();
  run();
  logger.info("Scheduled cloud backup scheduler started.");
}

export function stopBackupCloudScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}
