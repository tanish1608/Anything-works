import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, tokenStore } from '../api/client'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('api client', () => {
  beforeEach(() => tokenStore.set({ access_token: 'old', refresh_token: 'r1' }))
  afterEach(() => {
    vi.restoreAllMocks()
    tokenStore.set(null)
  })

  it('sends the bearer token', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { ok: true }))
    await api('/projects')
    const headers = f.mock.calls[0][1]!.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer old')
    expect(f.mock.calls[0][1]!.cache).toBe('no-store')
  })

  it('refreshes once on 401 and retries', async () => {
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(401, { detail: 'expired' }))
      .mockResolvedValueOnce(json(200, { access_token: 'new', refresh_token: 'r2' }))
      .mockResolvedValueOnce(json(200, [1, 2]))
    expect(await api('/projects')).toEqual([1, 2])
    expect(f.mock.calls[1][0]).toBe('/api/auth/refresh')
    expect(tokenStore.get()?.access_token).toBe('new')
    expect((f.mock.calls[2][1]!.headers as Headers).get('Authorization')).toBe('Bearer new')
  })

  it('logs out when refresh fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(401, { detail: 'expired' }))
      .mockResolvedValueOnce(json(401, { detail: 'reused' }))
    await expect(api('/projects')).rejects.toBeInstanceOf(ApiError)
    expect(tokenStore.get()).toBeNull()
  })

  it('surfaces FastAPI error details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(409, { detail: 'Already a member' }))
    await expect(api('/x')).rejects.toThrow('Already a member')
  })

  it('surfaces the scoped agent error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(409, { code: 'stale_revision', message: 'Approved drawing changed' }))
    await expect(api('/agent/runs/x')).rejects.toThrow('Approved drawing changed')
  })
})
