import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { EventRow } from '../api/types'
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
  const rows = q.data?.pages.flat() ?? []
  return (
    <div className="page stack">
      <h1>Activity</h1>
      <p className="muted" style={{ marginTop: -8 }}>Every change on this project, newest first. This log can't be edited.</p>
      <div className="panel" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString()}</td>
                <td>{e.actor_name ?? '—'}</td>
                <td>{describe(e)}</td>
                <td><code className="muted" style={{ fontSize: 11, wordBreak: 'break-word' }}>{JSON.stringify(e.data).slice(0, 160)}</code></td>
              </tr>
            ))}
            {rows.length === 0 && !q.isLoading && <tr><td colSpan={4} className="muted">Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {q.hasNextPage && <div><button onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>Load more</button></div>}
    </div>
  )
}
