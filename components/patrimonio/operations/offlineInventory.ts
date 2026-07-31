import type { InventoryCheckResult } from "../types";

const DATABASE_NAME = "patrimonio-ops-offline";
const STORE_NAME = "inventory-checks";
const DATABASE_VERSION = 1;
const MAX_OFFLINE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type OfflineInventoryCheck = {
  id: string;
  departmentSlug: string;
  campaignId: string;
  assetId: string;
  result: Exclude<InventoryCheckResult, "pending">;
  observedLocation: string;
  note: string;
  queuedAt: string;
};

export async function queueInventoryCheck(
  check: Omit<OfflineInventoryCheck, "id" | "queuedAt">,
): Promise<OfflineInventoryCheck> {
  const record: OfflineInventoryCheck = {
    ...check,
    id: `${check.departmentSlug}:${check.campaignId}:${check.assetId}`,
    queuedAt: new Date().toISOString(),
  };
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => store.put(record));
  database.close();
  return record;
}

export async function loadInventoryQueue(departmentSlug: string): Promise<OfflineInventoryCheck[]> {
  const database = await openDatabase();
  const records = await transactionPromise<OfflineInventoryCheck[]>(database, "readonly", (store) => store.getAll());
  database.close();
  const cutoff = Date.now() - MAX_OFFLINE_AGE_MS;
  const expiredIds = records
    .filter((record) => new Date(record.queuedAt).getTime() < cutoff)
    .map((record) => record.id);
  if (expiredIds.length) await removeInventoryChecks(expiredIds);
  return records
    .filter((record) => record.departmentSlug === departmentSlug && !expiredIds.includes(record.id))
    .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
}

export async function removeInventoryChecks(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    for (const id of ids) store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha na fila offline."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Fila offline interrompida."));
  });
  database.close();
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponível."));
  });
}

function transactionPromise<T = void>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  requestFactory: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = requestFactory(transaction.objectStore(STORE_NAME));
    let result!: T;
    request.onsuccess = () => {
      result = request.result;
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("Falha na fila offline."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Fila offline interrompida."));
  });
}
