import { api } from './client'
import type { Job } from './types'

export async function waitForJob(id: string, onUpdate?: (j: Job) => void, intervalMs = 1000): Promise<Job> {
  for (;;) {
    const j = await api<Job>(`/jobs/${id}`)
    onUpdate?.(j)
    if (j.status === 'done' || j.status === 'failed') return j
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
