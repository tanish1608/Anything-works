import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { ISSUE_STATUS_COLOR, ISSUE_STATUS_LABEL, type Issue } from '../api/types'
import IssueFilters, { DEFAULT_FILTER, filterQuery, type IssueFilter } from '../components/IssueFilters'
import IssuePanel from '../components/IssuePanel'
import { useProject } from './ProjectLayout'

export default function IssuesPage() {
  const { project } = useProject()
  const [params, setParams] = useSearchParams()
  const selected = params.get('issue')
  const [filter, setFilter] = useState<IssueFilter>(selected ? { ...DEFAULT_FILTER, status: [] } : DEFAULT_FILTER)
  const issues = useQuery({ queryKey: ['issues', project.id, filter], queryFn: () => api<Issue[]>(`/projects/${project.id}/issues${filterQuery(filter)}`) })
  return (
    <div className="page stack" style={{ maxWidth: 1300 }}>
      <h1>Issues</h1>
      <IssueFilters projectId={project.id} value={filter} onChange={setFilter} />
      <div className="issues-split">
        <div className="panel" style={{ overflowX: 'auto', padding: 0 }}>
          <table>
            <thead><tr><th>#</th><th>Title</th><th>Status</th><th>Priority</th><th>Trade</th><th>Assignee</th><th>Due</th><th /></tr></thead>
            <tbody>
              {issues.data?.map((i) => (
                <tr key={i.id} className={i.id === selected ? 'selected' : ''} onClick={() => setParams({ issue: i.id })} style={{ cursor: 'pointer' }}>
                  <td>{i.number}</td>
                  <td>{i.title}</td>
                  <td><span className="dot" style={{ background: ISSUE_STATUS_COLOR[i.status], display: 'inline-block', marginRight: 6 }} />{ISSUE_STATUS_LABEL[i.status]}</td>
                  <td>{i.priority}</td>
                  <td>{i.trade ?? '—'}</td>
                  <td>{i.assignee_name ?? '—'}</td>
                  <td>{i.due_date ?? '—'}</td>
                  <td><Link to={`../model?issue=${i.id}`} onClick={(e) => e.stopPropagation()}>Open in 3D</Link></td>
                </tr>
              ))}
              {issues.data?.length === 0 && <tr><td colSpan={8} className="muted">No issues match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        {selected && (
          <div className="panel">
            <IssuePanel issueId={selected} projectId={project.id} role={project.my_role} onClose={() => setParams({})} />
          </div>
        )}
      </div>
    </div>
  )
}
