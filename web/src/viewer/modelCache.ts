import { tokenStore } from "../api/client";

/**
 * Per-account cache of model metadata (components, spatial tree, floor plans) for one approved model version.
 * A version never changes once approved, so reopening a building skips those downloads. Entries are keyed by
 * account + project + version and the whole cache is cleared when the person signs out or switches account,
 * so private project data never outlives the session that fetched it. Live work records are never cached here.
 */
const DB = "placeholder-model-cache";
const STORE = "models";

function account(): string | null {
  try {
    const token = tokenStore.get()?.access_token;
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, mode);
    const req = work(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    tx.onerror = tx.onabort = () => { db.close(); resolve(undefined); };
  });
}

export function cacheKey(projectId: string, versionId: string): string | null {
  const who = account();
  return who ? `${who}:${projectId}:${versionId}` : null;
}

export async function readModel<T>(key: string | null): Promise<T | undefined> {
  return key ? run<T>("readonly", (s) => s.get(key) as IDBRequest<T>) : undefined;
}

export async function writeModel(key: string | null, value: unknown) {
  if (key) await run("readwrite", (s) => { s.put(value, key); });
}

export async function clearModels() {
  await run("readwrite", (s) => { s.clear(); });
}

// Drop everything when the signed-in account changes (sign-out, refresh to another user, switch).
let lastAccount = account();
try {
  tokenStore.subscribe(() => {
    const now = account();
    if (now !== lastAccount) void clearModels();
    lastAccount = now;
  });
} catch {
  // No session store (e.g. a test double); then nothing is cached because account() is null.
}
