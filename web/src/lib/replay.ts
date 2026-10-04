// Fold the project's status events up to a moment in time (timeline replay).
import type { ElementInfo } from '../api/types'

export interface Timeline {
  start: string
  end: string
  status_changes: { at: string; element_id: string; status: string; flags: string[] }[]
  issues: { element_id: string; opened_at: string; closed_at: string | null }[]
  versions: { id: string; number: number; at: string; message: string }[]
}

export function stateAt(t: Timeline, elements: Pick<ElementInfo, 'id' | 'discipline'>[], at: number) {
  const status = new Map<string, string>()
  for (const c of t.status_changes) {
    if (Date.parse(c.at) > at) break
    status.set(c.element_id, c.status)
  }
  const issues = new Map<string, number>()
  for (const i of t.issues) {
    if (Date.parse(i.opened_at) <= at && (!i.closed_at || Date.parse(i.closed_at) > at)) issues.set(i.element_id, (issues.get(i.element_id) ?? 0) + 1)
  }
  return elements.map((e) => ({ ...e, status: status.get(e.id) ?? 'not_started', open_issues: issues.get(e.id) ?? 0 }))
}
