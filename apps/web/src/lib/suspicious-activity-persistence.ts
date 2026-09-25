const STORAGE_VERSION = 1;
const STORAGE_PREFIX = "laundry-app:suspicious-activity";

export interface SuspiciousActivityReadState {
  version: typeof STORAGE_VERSION;
  userId: string;
  branchId: string;
  lastSeenEventIds: Record<string, string>;
  savedAt: number;
}

function storageKey(userId: string, branchId: string) {
  return `${STORAGE_PREFIX}:${userId}:${branchId}`;
}

export function loadSuspiciousActivityReadState(
  userId: string,
  branchId: string,
): SuspiciousActivityReadState {
  const fallback: SuspiciousActivityReadState = {
    version: STORAGE_VERSION,
    userId,
    branchId,
    lastSeenEventIds: {},
    savedAt: Date.now(),
  };

  try {
    const raw = localStorage.getItem(storageKey(userId, branchId));

    if (!raw) {
      return fallback;
    }

    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== STORAGE_VERSION ||
      !("userId" in parsed) ||
      parsed.userId !== userId ||
      !("branchId" in parsed) ||
      parsed.branchId !== branchId ||
      !("lastSeenEventIds" in parsed) ||
      typeof parsed.lastSeenEventIds !== "object" ||
      parsed.lastSeenEventIds === null
    ) {
      return fallback;
    }

    return parsed as SuspiciousActivityReadState;
  } catch {
    return fallback;
  }
}

export function markSuspiciousActivityEventSeen(
  userId: string,
  branchId: string,
  eventId: string,
  activityId: string,
) {
  const current = loadSuspiciousActivityReadState(userId, branchId);

  const next: SuspiciousActivityReadState = {
    ...current,
    lastSeenEventIds: {
      ...current.lastSeenEventIds,
      [eventId]: activityId,
    },
    savedAt: Date.now(),
  };

  localStorage.setItem(
    storageKey(userId, branchId),
    JSON.stringify(next),
  );
}
