import {
  DBSchema,
  IDBPDatabase,
  openDB,
} from "idb";

export const OFFLINE_SYNC_DB_NAME = "laundry-app-offline-sync";
export const OFFLINE_SYNC_DB_VERSION = 1;
export const OFFLINE_SYNC_STORE = "operations";

export type OfflineSyncOperationType =
  | "ORDER_CREATE"
  | "ORDER_UPDATE"
  | "CUSTOMER_CREATE"
  | "CUSTOMER_UPDATE";

export type OfflineSyncOperationStatus =
  | "PENDING"
  | "PROCESSING"
  | "APPLIED"
  | "CONFLICT"
  | "REJECTED"
  | "FAILED";

export interface OfflineSyncQueueEntry {
  id?: number;
  businessId: string;
  branchId: string;
  actorUserId: string;
  clientOperationId: string;
  operationType: OfflineSyncOperationType;
  payloadVersion: number;
  payload: unknown;
  correlationId: string | null;
  status: OfflineSyncOperationStatus;
  attemptCount: number;
  lastAttemptAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

interface OfflineSyncDB extends DBSchema {
  operations: {
    key: number;
    value: OfflineSyncQueueEntry;
    indexes: {
      "by-business-branch-status": [
        string,
        string,
        OfflineSyncOperationStatus,
      ];
      "by-client-operation": [string, string];
      "by-created-at": number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineSyncDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<OfflineSyncDB>(
      OFFLINE_SYNC_DB_NAME,
      OFFLINE_SYNC_DB_VERSION,
      {
        upgrade(db) {
          if (db.objectStoreNames.contains(OFFLINE_SYNC_STORE)) {
            return;
          }

          const store = db.createObjectStore(OFFLINE_SYNC_STORE, {
            keyPath: "id",
            autoIncrement: true,
          });

          store.createIndex("by-business-branch-status", [
            "businessId",
            "branchId",
            "status",
          ]);

          store.createIndex("by-client-operation", [
            "businessId",
            "clientOperationId",
          ]);

          store.createIndex("by-created-at", "createdAt");
        },
      },
    );
  }

  return dbPromise;
}

export interface EnqueueOfflineSyncInput {
  businessId: string;
  branchId: string;
  actorUserId: string;
  clientOperationId: string;
  operationType: OfflineSyncOperationType;
  payloadVersion?: number;
  payload: unknown;
  correlationId?: string | null;
}

const SUPPORTED_OFFLINE_OPERATION_TYPES = new Set<OfflineSyncOperationType>([
  "ORDER_CREATE",
  "ORDER_UPDATE",
  "CUSTOMER_CREATE",
  "CUSTOMER_UPDATE",
]);

function assertQueueInput(input: EnqueueOfflineSyncInput) {
  if (
    !input.businessId ||
    !input.branchId ||
    !input.actorUserId ||
    !input.clientOperationId
  ) {
    throw new Error("Offline sync operations require business, branch, actor, and client operation context");
  }

  if (!SUPPORTED_OFFLINE_OPERATION_TYPES.has(input.operationType)) {
    throw new Error(
      `Operation type ${input.operationType} is not supported for offline sync`,
    );
  }
}

export async function enqueueOfflineSyncOperation(
  input: EnqueueOfflineSyncInput,
): Promise<OfflineSyncQueueEntry> {
  assertQueueInput(input);

  const db = await getDb();
  const now = Date.now();

  const existing = await db
    .transaction(OFFLINE_SYNC_STORE, "readonly")
    .objectStore(OFFLINE_SYNC_STORE)
    .index("by-client-operation")
    .get([input.businessId, input.clientOperationId]);

  if (existing) {
    return existing;
  }

  const entry: OfflineSyncQueueEntry = {
    businessId: input.businessId,
    branchId: input.branchId,
    actorUserId: input.actorUserId,
    clientOperationId: input.clientOperationId,
    operationType: input.operationType,
    payloadVersion: input.payloadVersion ?? 1,
    payload: input.payload,
    correlationId: input.correlationId ?? null,
    status: "PENDING",
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  const id = await db
    .transaction(OFFLINE_SYNC_STORE, "readwrite")
    .objectStore(OFFLINE_SYNC_STORE)
    .add(entry);

  return {
    ...entry,
    id,
  };
}

export async function listOfflineSyncOperations(
  businessId: string,
  branchId: string,
  status: OfflineSyncOperationStatus = "PENDING",
): Promise<OfflineSyncQueueEntry[]> {
  const db = await getDb();

  const entries = await db
    .transaction(OFFLINE_SYNC_STORE, "readonly")
    .objectStore(OFFLINE_SYNC_STORE)
    .getAll();

  return entries.filter(
    (entry) =>
      entry.businessId === businessId &&
      entry.branchId === branchId &&
      entry.status === status,
  );
}

export async function getOfflineSyncOperation(
  businessId: string,
  clientOperationId: string,
): Promise<OfflineSyncQueueEntry | undefined> {
  const db = await getDb();

  return db
    .transaction(OFFLINE_SYNC_STORE, "readonly")
    .objectStore(OFFLINE_SYNC_STORE)
    .index("by-client-operation")
    .get([businessId, clientOperationId]);
}

export async function updateOfflineSyncOperation(
  id: number,
  update: Partial<
    Pick<
      OfflineSyncQueueEntry,
      | "status"
      | "attemptCount"
      | "lastAttemptAt"
      | "lastError"
      | "updatedAt"
    >
  >,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(OFFLINE_SYNC_STORE, "readwrite");
  const store = tx.objectStore(OFFLINE_SYNC_STORE);

  const existing = await store.get(id);

  if (!existing) {
    throw new Error(`Offline sync operation ${id} was not found`);
  }

  await store.put({
    ...existing,
    ...update,
    updatedAt: update.updatedAt ?? Date.now(),
  });

  await tx.done;
}

export async function removeOfflineSyncOperation(
  id: number,
): Promise<void> {
  const db = await getDb();

  await db
    .transaction(OFFLINE_SYNC_STORE, "readwrite")
    .objectStore(OFFLINE_SYNC_STORE)
    .delete(id);
}

export async function clearOfflineSyncQueue(
  businessId?: string,
  branchId?: string,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(OFFLINE_SYNC_STORE, "readwrite");
  const store = tx.objectStore(OFFLINE_SYNC_STORE);

  if (businessId === undefined && branchId === undefined) {
    await store.clear();
    await tx.done;
    return;
  }

  if (!businessId || !branchId) {
    throw new Error(
      "Clearing a scoped offline sync queue requires both business and branch",
    );
  }

  const entries = await store.getAll();

  for (const entry of entries) {
    if (
      entry.businessId === businessId &&
      entry.branchId === branchId &&
      entry.id !== undefined
    ) {
      await store.delete(entry.id);
    }
  }

  await tx.done;
}
