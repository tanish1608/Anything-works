import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import type { Building, EventRow } from '../api/types'
import { describe } from '../lib/events'
import { useProject } from './ProjectLayout'

const PAGE = 50

export default function ActivityPage() {
  const { project } = useProject()
  const q = useInfiniteQuery({
    queryKey: ['events', project.id],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      api<EventRow[]>(`/projects/${project.id}/events?limit=${PAGE}${pageParam ? `&before_id=${pageParam}` : ''}`),
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].id : undefined),
  })
  const tree = useQuery({ queryKey: ['tree', project.id], queryFn: () => api<Building[]>(`/projects/${project.id}/tree`) })
  const zoneName = (id: string | null) => (id ? tree.data?.flatMap((b) => b.levels.flatMap((l) => l.zones)).find((z) => z.id === id)?.name ?? '' : '')
  const [kind, setKind] = useState('')
  const [who, setWho] = useState('')
  const all = q.data?.pages.flat() ?? []
  const rows = all.filter((e) => (!kind || e.type.startsWith(kind)) && (!who || e.actor_name === who))
  const people = [...new Set(all.map((e) => e.actor_name).filter(Boolean))] as string[]
  return (
    <div className="page stack">
      <h1>Activity</h1>
      <p className="muted" style={{ marginTop: -8 }}>Every change on this project, newest first. This log can't be edited.</p>
      <div className="row">
        <select aria-label="Event type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All changes</option>
          {['element', 'upload', 'issue', 'model', 'sheet', 'conversion', 'zone', 'level', 'building', 'member', 'project'].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select aria-label="Person" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Everyone</option>
          {people.map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>
      <div className="panel" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Where</th><th>Evidence</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString()}</td>
                <td>{e.actor_name ?? 'system'}</td>
                <td>{describe(e)}</td>
                <td>{zoneName(e.zone_id)}</td>
                <td>{e.evidence_ids.length ? `${e.evidence_ids.length} file(s)` : ''}</td>
                <td><code className="muted" style={{ fontSize: 11, wordBreak: 'break-word' }}>{JSON.stringify(e.data).slice(0, 160)}</code></td>
              </tr>
            ))}
            {rows.length === 0 && !q.isLoading && <tr><td colSpan={6} className="muted">Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {q.hasNextPage && <div><button onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>Load more</button></div>}
    </div>
  )
}
