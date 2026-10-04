import { describe, expect, it } from 'vitest'
import { stateAt, type Timeline } from '../lib/replay'

const t: Timeline = {
  start: '2026-10-01T00:00:00Z', end: '2026-10-05T00:00:00Z', versions: [],
  status_changes: [
    { at: '2026-10-02T10:00:00Z', element_id: 'a', status: 'needs_review', flags: [] },
    { at: '2026-10-03T10:00:00Z', element_id: 'a', status: 'done', flags: [] },
  ],
  issues: [{ element_id: 'b', opened_at: '2026-10-02T00:00:00Z', closed_at: '2026-10-04T00:00:00Z' }],
}
const els = [{ id: 'a', discipline: 'plumbing' }, { id: 'b', discipline: 'plumbing' }]

describe('timeline replay', () => {
  it('folds events up to the moment', () => {
    const at = (s: string) => stateAt(t, els, Date.parse(s))
    expect(at('2026-10-01T12:00:00Z').map((e) => [e.status, e.open_issues])).toEqual([['not_started', 0], ['not_started', 0]])
    expect(at('2026-10-02T12:00:00Z').map((e) => [e.status, e.open_issues])).toEqual([['needs_review', 0], ['not_started', 1]])
    expect(at('2026-10-04T12:00:00Z').map((e) => [e.status, e.open_issues])).toEqual([['done', 0], ['not_started', 0]])
  })
})
