import { DBSchema, IDBPDatabase, openDB } from "idb";
import type {
  SubscriptionPaymentMethodOption,
  SubscriptionPaymentProviderOption,
  SubscriptionPlan,
  SubscriptionPrice,
} from "./subscriptions-api.js";

export const OFFLINE_SUBSCRIPTION_DB_NAME =
  "laundry-app-offline-subscription-payments";
export const OFFLINE_SUBSCRIPTION_DB_VERSION = 1;


const PAYMENT_STORE = "payments";
const CONFIG_STORE = "config";
export const SUBSCRIPTION_PAYMENT_QUEUE_EVENT =
  "laundryangel:subscription-payment-queue-updated";

export type OfflineSubscriptionPaymentStatus =
  | "PENDING"
  | "SYNCING"
  | "READY"
  | "COMPLETED"
  | "FAILED";

export interface OfflineSubscriptionPaymentQueueEntry {
  id?: number;
  businessId: string;
  actorUserId: string;
  plan: SubscriptionPlan;
  amount: number;
  currencyCode: string;
  providerKey: string;
  paymentMethodKey: string;
  idempotencyKey: string;
  status: OfflineSubscriptionPaymentStatus;
  intentId: string | null;
  paymentReference: string | null;
  providerCheckoutUrl: string | null;
  attemptCount: number;
  lastAttemptAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SubscriptionBillingCacheEntry {
  businessId: string;
  countryCode: string;
  currencyCode: string;
  prices: SubscriptionPrice[];
  providers: SubscriptionPaymentProviderOption[];
  methods: SubscriptionPaymentMethodOption[];
  updatedAt: number;
}

interface OfflineSubscriptionPaymentDB extends DBSchema {
  payments: {
    key: number;
    value: OfflineSubscriptionPaymentQueueEntry;
    indexes: {
      "by-business-status": [string, OfflineSubscriptionPaymentStatus];
      "by-business-idempotency": [string, string];
      "by-intent-id": string;
    };
  };
  config: {
    key: string;
    value: SubscriptionBillingCacheEntry;
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineSubscriptionPaymentDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<OfflineSubscriptionPaymentDB>(
      OFFLINE_SUBSCRIPTION_DB_NAME,
      OFFLINE_SUBSCRIPTION_DB_VERSION,
      {
        upgrade(db) {
          if (!db.objectStoreNames.contains(PAYMENT_STORE)) {
            const payments = db.createObjectStore(PAYMENT_STORE, {
              keyPath: "id",
              autoIncrement: true,
            });

            payments.createIndex("by-business-status", [
              "businessId",
              "status",
            ]);
            payments.createIndex("by-business-idempotency", [
              "businessId",
              "idempotencyKey",
            ]);
            payments.createIndex("by-intent-id", "intentId");
          }

          if (!db.objectStoreNames.contains(CONFIG_STORE)) {
            db.createObjectStore(CONFIG_STORE, {
              keyPath: "businessId",
            });
          }
        },
      },
    );
  }

  return dbPromise;
}

function notifyQueueChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SUBSCRIPTION_PAYMENT_QUEUE_EVENT));
  }
}

export async function cacheSubscriptionBillingConfig(
  entry: Omit<SubscriptionBillingCacheEntry, "updatedAt">,
) {
  const db = await getDb();

  await db.put(CONFIG_STORE, {
    ...entry,
    updatedAt: Date.now(),
  });

  notifyQueueChanged();
}

export async function getCachedSubscriptionBillingConfig(
  businessId: string,
): Promise<SubscriptionBillingCacheEntry | undefined> {
  const db = await getDb();
  return db.get(CONFIG_STORE, businessId);
}

export async function enqueueOfflineSubscriptionPayment(input: {
  businessId: string;
  actorUserId: string;
  plan: SubscriptionPlan;
  amount: number;
  currencyCode: string;
  providerKey: string;
  paymentMethodKey: string;
  idempotencyKey: string;
}): Promise<OfflineSubscriptionPaymentQueueEntry> {
  const db = await getDb();

  const existing = await db
    .transaction(PAYMENT_STORE, "readonly")
    .objectStore(PAYMENT_STORE)
    .index("by-business-idempotency")
    .get([input.businessId, input.idempotencyKey]);

  if (existing) {
    return existing;
  }

  const now = Date.now();

  const entry: OfflineSubscriptionPaymentQueueEntry = {
    ...input,
    status: "PENDING",
    intentId: null,
    paymentReference: null,
    providerCheckoutUrl: null,
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  const id = await db
    .transaction(PAYMENT_STORE, "readwrite")
    .objectStore(PAYMENT_STORE)
    .add(entry);

  const stored = {
    ...entry,
    id,
  };

  notifyQueueChanged();
  return stored;
}

export async function listOfflineSubscriptionPayments(
  businessId: string,
  status?: OfflineSubscriptionPaymentStatus,
) {
  const db = await getDb();

  if (status) {
    return db
      .transaction(PAYMENT_STORE, "readonly")
      .objectStore(PAYMENT_STORE)
      .index("by-business-status")
      .getAll([businessId, status]);
  }

  const entries = await db
    .transaction(PAYMENT_STORE, "readonly")
    .objectStore(PAYMENT_STORE)
    .getAll();

  return entries.filter((entry) => entry.businessId === businessId);
}

export async function getOfflineSubscriptionPayment(
  businessId: string,
  id: number,
) {
  const db = await getDb();
  const entry = await db.get(PAYMENT_STORE, id);

  if (!entry || entry.businessId !== businessId) {
    return undefined;
  }

  return entry;
}

export async function getOfflineSubscriptionPaymentByIntent(
  businessId: string,
  intentId: string,
) {
  const db = await getDb();

  const entry = await db
    .transaction(PAYMENT_STORE, "readonly")
    .objectStore(PAYMENT_STORE)
    .index("by-intent-id")
    .get(intentId);

  if (!entry || entry.businessId !== businessId) {
    return undefined;
  }

  return entry;
}

export async function updateOfflineSubscriptionPayment(
  id: number,
  update: Partial<
    Pick<
      OfflineSubscriptionPaymentQueueEntry,
      | "status"
      | "intentId"
      | "paymentReference"
      | "providerCheckoutUrl"
      | "attemptCount"
      | "lastAttemptAt"
      | "lastError"
    >
  >,
) {
  const db = await getDb();
  const tx = db.transaction(PAYMENT_STORE, "readwrite");
  const store = tx.objectStore(PAYMENT_STORE);
  const existing = await store.get(id);

  if (!existing) {
    throw new Error(`Offline subscription payment ${id} was not found`);
  }

  await store.put({
    ...existing,
    ...update,
    updatedAt: Date.now(),
  });

  await tx.done;
  notifyQueueChanged();
}

export async function removeOfflineSubscriptionPayment(id: number) {
  const db = await getDb();
  await db.delete(PAYMENT_STORE, id);
  notifyQueueChanged();
}

export async function clearOfflineSubscriptionPaymentQueue(
  businessId?: string,
) {
  const db = await getDb();

  const tx = db.transaction(
    [PAYMENT_STORE, CONFIG_STORE],
    "readwrite",
  );
  const payments = tx.objectStore(PAYMENT_STORE);
  const config = tx.objectStore(CONFIG_STORE);

  if (businessId === undefined) {
    await payments.clear();
    await config.clear();
  } else {
    const entries = await payments.getAll();

    for (const entry of entries) {
      if (entry.businessId === businessId && entry.id !== undefined) {
        await payments.delete(entry.id);
      }
    }

    await config.delete(businessId);
  }

  await tx.done;
  notifyQueueChanged();
}
