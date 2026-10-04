/**
 * Offline upload queue. Field reports are written to IndexedDB first, then synced when there's signal
 * (app start, the 'online' event, every 30 s, or when the app comes back to the foreground).
 * Safe to retry: the server de-duplicates on client_uuid.
 */
import { api, ApiError } from '../api/client'

export interface QueuedFile {
  name: string
  type: string
  blob: Blob
}

export interface QueuedUpload {
  client_uuid: string
  project_id: string
  zone_id: string
  zone_name: string
  trade: string
  note: string
  element_ids: string[]
  captured_at: string
  files: QueuedFile[]
  reference?: QueuedFile // viewer snapshot of the zone's trade layer, for the AI check (M5)
  state: 'queued' | 'syncing' | 'failed' | 'done'
  error?: string
  attempts: number
  upload_id?: string
}

const DB = 'sitemesh-field'
const STORE = 'uploads'
type Listener = (items: QueuedUpload[]) => void
const listeners = new Set<Listener>()

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'client_uuid' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    t.oncomplete = () => db.close()
  })
}

export async function listQueue(): Promise<QueuedUpload[]> {
  const all = await tx<QueuedUpload[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedUpload[]>)
  return all.sort((a, b) => a.captured_at.localeCompare(b.captured_at))
}

async function notify() {
  const items = await listQueue()
  listeners.forEach((l) => l(items))
}

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  listQueue().then(l).catch(() => {})
  return () => listeners.delete(l)
}

export async function enqueue(item: Omit<QueuedUpload, 'state' | 'attempts' | 'client_uuid' | 'captured_at'> & Partial<QueuedUpload>): Promise<QueuedUpload> {
  const full: QueuedUpload = {
    client_uuid: item.client_uuid ?? crypto.randomUUID(),
    captured_at: item.captured_at ?? new Date().toISOString(),
    state: 'queued',
    attempts: 0,
    ...item,
  } as QueuedUpload
  await tx('readwrite', (s) => s.put(full))
  await notify()
  return full
}

export async function removeFromQueue(id: string) {
  await tx('readwrite', (s) => s.delete(id))
  await notify()
}

export async function retry(id: string) {
  const item = await tx<QueuedUpload | undefined>('readonly', (s) => s.get(id) as IDBRequest<QueuedUpload | undefined>)
  if (item) {
    await tx('readwrite', (s) => s.put({ ...item, state: 'queued', error: undefined }))
    await notify()
  }
}

let syncing: Promise<number> | null = null

/** Try to send everything queued. Returns how many were synced. */
export function syncQueue(): Promise<number> {
  syncing ??= (async () => {
    let n = 0
    for (const item of await listQueue()) {
      if (item.state !== 'queued' && item.state !== 'syncing') continue
      await tx('readwrite', (s) => s.put({ ...item, state: 'syncing' }))
      const fd = new FormData()
      fd.append('zone_id', item.zone_id)
      fd.append('trade', item.trade)
      fd.append('note', item.note)
      fd.append('client_uuid', item.client_uuid)
      fd.append('captured_at', item.captured_at)
      fd.append('element_ids', JSON.stringify(item.element_ids))
      item.files.forEach((f) => fd.append('files', new File([f.blob], f.name, { type: f.type })))
      if (item.reference) fd.append('reference', new File([item.reference.blob], item.reference.name, { type: item.reference.type }))
      try {
        await api(`/projects/${item.project_id}/uploads`, { method: 'POST', body: fd })
        await tx('readwrite', (s) => s.delete(item.client_uuid))
        n++
      } catch (e) {
        const permanent = e instanceof ApiError && e.status >= 400 && e.status < 500 && ![401, 408, 429].includes(e.status)
        await tx('readwrite', (s) => s.put({ ...item, state: permanent ? 'failed' : 'queued', error: (e as Error).message, attempts: item.attempts + 1 }))
      }
    }
    await notify()
    return n
  })().finally(() => {
    syncing = null
  })
  return syncing
}

let started = false
export function startSyncLoop(intervalMs = 30_000) {
  if (started) return
  started = true
  const kick = () => {
    if (navigator.onLine !== false) syncQueue().catch(() => {})
  }
  window.addEventListener('online', kick)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && kick())
  setInterval(kick, intervalMs)
  kick()
}
