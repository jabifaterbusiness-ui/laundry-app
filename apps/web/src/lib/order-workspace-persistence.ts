import type { OrderWorkspace } from "../state/order-workspace-store.js";

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = "laundry-app:sos-workspaces";

export interface SavedOrderWorkspaceState {
  version: typeof STORAGE_VERSION;
  savedAt: number;
  businessId: string;
  userId: string;
  branchId: string;
  workspaces: OrderWorkspace[];
  activeWorkspaceId: string | null;
}

function storageKey(
  businessId: string,
  userId: string,
  branchId: string,
) {
  return `${STORAGE_PREFIX}:${businessId}:${userId}:${branchId}`;
}

export function saveOrderWorkspaceState(
  businessId: string,
  userId: string,
  branchId: string,
  workspaces: OrderWorkspace[],
  activeWorkspaceId: string | null,
) {
  const snapshot: SavedOrderWorkspaceState = {
    version: STORAGE_VERSION,
    savedAt: Date.now(),
    businessId,
    userId,
    branchId,
    workspaces,
    activeWorkspaceId,
  };

  localStorage.setItem(
    storageKey(businessId, userId, branchId),
    JSON.stringify(snapshot),
  );
}

export function loadOrderWorkspaceState(
  businessId: string,
  userId: string,
  branchId: string,
): SavedOrderWorkspaceState | null {
  const raw = localStorage.getItem(
    storageKey(businessId, userId, branchId),
  );

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== STORAGE_VERSION ||
      !("businessId" in parsed) ||
      parsed.businessId !== businessId ||
      !("userId" in parsed) ||
      parsed.userId !== userId ||
      !("branchId" in parsed) ||
      parsed.branchId !== branchId ||
      !("workspaces" in parsed) ||
      !Array.isArray(parsed.workspaces) ||
      !("activeWorkspaceId" in parsed)
    ) {
      return null;
    }

    return parsed as SavedOrderWorkspaceState;
  } catch {
    return null;
  }
}

export function clearOrderWorkspaceState(
  businessId: string,
  userId: string,
  branchId: string,
) {
  localStorage.removeItem(
    storageKey(businessId, userId, branchId),
  );
}
