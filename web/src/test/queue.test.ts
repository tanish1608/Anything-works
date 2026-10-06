import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import { enqueue, listQueue, removeFromQueue, retry, syncQueue } from '../field/queue'

const base = { model_version_id: 'v1', project_id: 'p1', zone_id: 'z1', zone_name: 'Bath', trade: 'plumbing', note: 'done', element_ids: ['e1'],
  files: [{ name: 'a.jpg', type: 'image/jpeg', blob: new Blob(['x'], { type: 'image/jpeg' }) }] }
const ok = () => new Response(JSON.stringify({ id: 'u1' }), { status: 201, headers: { 'content-type': 'application/json' } })

describe('offline queue', () => {
  beforeEach(async () => {
    tokenStore.set({ access_token: 'a', refresh_token: 'r' })
    for (const i of await listQueue()) await removeFromQueue(i.client_uuid)
  })
  afterEach(() => vi.restoreAllMocks())

  it('keeps uploads while offline and sends them later', async () => {
    const item = await enqueue(base)
    const f = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await syncQueue()).toBe(0)
    let q = await listQueue()
    expect(q).toHaveLength(1)
    expect(q[0].state).toBe('queued')
    expect(q[0].attempts).toBe(1)
    f.mockResolvedValueOnce(ok())
    expect(await syncQueue()).toBe(1)
    q = await listQueue()
    expect(q).toHaveLength(0)
    const body = f.mock.calls[1][1]!.body as FormData
    expect(body.get('client_uuid')).toBe(item.client_uuid)
    expect(body.get('element_ids')).toBe('["e1"]')
    expect(body.get('model_version_id')).toBe('v1')
    expect((body.get('files') as File).name).toBe('a.jpg')
  })

  it('marks validation errors as failed (no endless retries) and can retry', async () => {
    await enqueue(base)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Photo reused' }), { status: 409, headers: { 'content-type': 'application/json' } }),
    )
    await syncQueue()
    const [item] = await listQueue()
    expect(item.state).toBe('failed')
    expect(item.error).toBe('Photo reused')
    expect(await syncQueue()).toBe(0) // failed items are left alone
    await retry(item.client_uuid)
    expect((await listQueue())[0].state).toBe('queued')
  })

  it('keeps items on server errors', async () => {
    await enqueue(base)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('oops', { status: 503 }))
    await syncQueue()
    expect((await listQueue())[0].state).toBe('queued')
  })
})
