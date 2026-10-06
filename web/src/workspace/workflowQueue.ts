/** Account-bound durable outbox. A queued photo never changes the server's reviewed work state. */
import { api, ApiError, tokenStore } from "../api/client";
import type { Draft } from "./state";

export interface PendingWorkUpdate {
  client_uuid: string;
  actor_id: string;
  project_id: string;
  work_id: string;
  model_version_id: string;
  note: string;
  claim: string;
  captured_at: string;
  files: { name: string; blob: Blob }[];
  state: "queued" | "sending" | "failed";
  error?: string;
}
const DB = "sitemesh-workflow-outbox";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("updates", { keyPath: "client_uuid" });
      req.result.createObjectStore("drafts");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function transaction<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), request = action(tx.objectStore(store));
    // Wait for commit, not merely request success: storage failures must retain the unsent draft.
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || request.error || Error("Device storage could not save this update")); };
  });
}
export function saveDraft(actor: string, project: string, draft: Draft | null) {
  const key = `${actor}:${project}`;
  return draft ? transaction("drafts", "readwrite", (s) => s.put(draft, key)) : transaction("drafts", "readwrite", (s) => s.delete(key));
}
export function getDraft(actor: string, project: string): Promise<Draft | undefined> {
  return transaction("drafts", "readonly", (s) => s.get(`${actor}:${project}`));
}
export async function queueWorkUpdate(actor: string, project: string, version: string, draft: Draft) {
  if (draft.photos.some((p) => p.sample || !p.url.startsWith("data:image/"))) throw Error("Attach actual photos to a connected project.");
  const files = await Promise.all(draft.photos.map(async (p) => ({ name: p.name, blob: await (await fetch(p.url)).blob() })));
  const item: PendingWorkUpdate = { client_uuid: draft.clientId || crypto.randomUUID(), actor_id: actor, project_id: project,
    work_id: draft.item, model_version_id: version, note: draft.note, claim: draft.claim,
    captured_at: new Date().toISOString(), files, state: "queued" };
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["updates", "drafts"], "readwrite");
    tx.objectStore("updates").put(item);
    tx.objectStore("drafts").delete(`${actor}:${project}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || Error("Unable to queue update")); };
  });
  return item;
}
export async function pendingUpdates(actor: string, project: string) {
  const items = await transaction<PendingWorkUpdate[]>("updates", "readonly", (s) => s.getAll());
  return items.filter((u) => u.actor_id === actor && u.project_id === project).sort((a, b) => a.captured_at.localeCompare(b.captured_at));
}
export function discardUpdate(id: string) {
  return transaction("updates", "readwrite", (s) => s.delete(id));
}
const running = new Map<string, Promise<number>>();
export function syncWorkUpdates(actor: string, project: string): Promise<number> {
  const key = `${actor}:${project}`;
  if (running.has(key)) return running.get(key)!.then(() => syncWorkUpdates(actor, project));
  const run = (async () => {
    if (!tokenStore.get() || navigator.onLine === false) return 0;
    const me = await api<{ id: string }>("/auth/me");
    if (me.id !== actor) return 0;
    let sent = 0;
    for (const item of await pendingUpdates(actor, project)) {
      if (item.state === "failed" || !tokenStore.get()) continue;
      await transaction("updates", "readwrite", (s) => s.put({ ...item, state: "sending" }));
      try {
        const fd = new FormData();
        for (const [field, value] of Object.entries({ client_uuid: item.client_uuid, captured_by: actor,
          model_version_id: item.model_version_id, confirmed: "true", note: item.note, claim: item.claim, captured_at: item.captured_at })) fd.append(field, value);
        item.files.forEach((f) => fd.append("files", f.blob, f.name));
        await api(`/work/${item.work_id}/updates`, { method: "POST", body: fd });
        await discardUpdate(item.client_uuid);
        sent++;
      } catch (e) {
        const permanent = e instanceof ApiError && [403, 404, 409, 413, 415, 422].includes(e.status);
        await transaction("updates", "readwrite", (s) => s.put({ ...item, state: permanent ? "failed" : "queued", error: (e as Error).message }));
        if (!permanent) break;
      }
    }
    return sent;
  })().finally(() => running.delete(key));
  running.set(key, run);
  return run;
}
