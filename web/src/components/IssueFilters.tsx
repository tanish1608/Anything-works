import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { ISSUE_STATUS_LABEL, type Building, type IssueStatus, type Member, type Trade } from '../api/types'

export interface IssueFilter {
  status: IssueStatus[]
  trade: string
  assignee: string
  zone: string
}

export const DEFAULT_FILTER: IssueFilter = { status: ['open', 'in_progress'], trade: '', assignee: '', zone: '' }

export function filterQuery(f: IssueFilter): string {
  const p = new URLSearchParams()
  f.status.forEach((s) => p.append('status', s))
  if (f.trade) p.set('trade', f.trade)
  if (f.assignee) p.set('assignee_id', f.assignee)
  if (f.zone) p.set('zone_id', f.zone)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export default function IssueFilters({ projectId, value, onChange }: { projectId: string; value: IssueFilter; onChange: (f: IssueFilter) => void }) {
  const members = useQuery({ queryKey: ['members', projectId], queryFn: () => api<Member[]>(`/projects/${projectId}/members`) })
  const trades = useQuery({ queryKey: ['trades'], queryFn: () => api<Trade[]>('/trades') })
  const tree = useQuery({ queryKey: ['tree', projectId], queryFn: () => api<Building[]>(`/projects/${projectId}/tree`) })
  const zones = (tree.data ?? []).flatMap((b) => b.levels.flatMap((l) => l.zones.map((z) => ({ id: z.id, label: `${l.name} › ${z.name}` }))))
  const toggle = (s: IssueStatus) =>
    onChange({ ...value, status: value.status.includes(s) ? value.status.filter((x) => x !== s) : [...value.status, s] })
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" role="group" aria-label="Status filter">
        {(Object.keys(ISSUE_STATUS_LABEL) as IssueStatus[]).map((s) => (
          <label key={s} className="row" style={{ flexDirection: 'row', color: 'var(--text)', gap: 4 }}>
            <input type="checkbox" checked={value.status.includes(s)} onChange={() => toggle(s)} />{ISSUE_STATUS_LABEL[s]}
          </label>
        ))}
      </div>
      <div className="row">
        <select aria-label="Trade filter" value={value.trade} onChange={(e) => onChange({ ...value, trade: e.target.value })}>
          <option value="">All trades</option>
          {trades.data?.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
        </select>
        <select aria-label="Assignee filter" value={value.assignee} onChange={(e) => onChange({ ...value, assignee: e.target.value })}>
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          {members.data?.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
        </select>
        <select aria-label="Zone filter" value={value.zone} onChange={(e) => onChange({ ...value, zone: e.target.value })}>
          <option value="">All zones</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
        </select>
      </div>
    </div>
  )
}
