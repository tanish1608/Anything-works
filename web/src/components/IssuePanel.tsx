import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import {
  ISSUE_STATUS_COLOR,
  ISSUE_STATUS_LABEL,
  PRIORITIES,
  type IssueDetail,
  type IssueStatus,
  type Member,
  type Role,
} from '../api/types'
import AuthImage from './AuthImage'

export default function IssuePanel({ issueId, projectId, role, onFlyTo, onClose }: {
  issueId: string
  projectId: string
  role: Role
  onFlyTo?: (i: IssueDetail) => void
  onClose?: () => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const key = ['issue', issueId]
  const { data: issue, error } = useQuery({ queryKey: key, queryFn: () => api<IssueDetail>(`/issues/${issueId}`) })
  const members = useQuery({ queryKey: ['members', projectId], queryFn: () => api<Member[]>(`/projects/${projectId}/members`) })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key })
    qc.invalidateQueries({ queryKey: ['issues', projectId] })
    qc.invalidateQueries({ queryKey: ['elements', projectId] })
  }
  const patch = useMutation({ mutationFn: (json: Record<string, unknown>) => api(`/issues/${issueId}`, { method: 'PATCH', json }), onSuccess: refresh })
  const [comment, setComment] = useState('')
  const addComment = useMutation({
    mutationFn: () => api(`/issues/${issueId}/comments`, { method: 'POST', json: { body: comment } }),
    onSuccess: () => {
      setComment('')
      refresh()
    },
  })
  const upload = useMutation({
    mutationFn: (files: FileList) => {
      const fd = new FormData()
      Array.from(files).forEach((f) => fd.append('files', f))
      return api(`/issues/${issueId}/attachments`, { method: 'POST', body: fd })
    },
    onSuccess: refresh,
  })

  if (error) return <div className="error">{(error as Error).message}</div>
  if (!issue) return <div className="muted">Loading…</div>
  const manager = role === 'owner' || role === 'pm'
  const isAssignee = issue.assignee_id === user?.id
  const isReporter = issue.created_by === user?.id
  const canComment = role !== 'viewer'
  const statusOptions: IssueStatus[] = manager || isReporter ? ['open', 'in_progress', 'resolved', 'closed']
    : isAssignee ? ['open', 'in_progress', 'resolved'] : []
  const err = patch.error || addComment.error || upload.error

  const submitComment = (e: FormEvent) => {
    e.preventDefault()
    if (comment.trim()) addComment.mutate()
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <h3 className="grow title" style={{ margin: 0 }}>#{issue.number} {issue.title}</h3>
        {onClose && <button className="small" onClick={onClose} aria-label="Close issue">✕</button>}
      </div>
      <div className="row">
        <span className="badge" style={{ color: ISSUE_STATUS_COLOR[issue.status], borderColor: ISSUE_STATUS_COLOR[issue.status] }}>{ISSUE_STATUS_LABEL[issue.status]}</span>
        <span className="badge">{issue.priority}</span>
        {issue.trade && <span className="badge">{issue.trade}</span>}
        {issue.due_date && <span className="badge">due {issue.due_date}</span>}
      </div>
      {err && <div className="error">{(err as Error).message}</div>}
      {issue.description && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{issue.description}</p>}
      <div className="muted" style={{ fontSize: 12 }}>
        Raised by {issue.creator_name ?? '—'} · {new Date(issue.created_at).toLocaleString()}
      </div>
      {statusOptions.length > 0 && (
        <label>Status
          <select value={issue.status} onChange={(e) => patch.mutate({ status: e.target.value })} aria-label="Issue status">
            {statusOptions.map((s) => <option key={s} value={s}>{ISSUE_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
      )}
      {manager ? (
        <div className="row">
          <label className="grow">Assignee
            <select value={issue.assignee_id ?? ''} onChange={(e) => patch.mutate({ assignee_id: e.target.value || null })}>
              <option value="">Unassigned</option>
              {members.data?.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
            </select>
          </label>
          <label>Priority
            <select value={issue.priority} onChange={(e) => patch.mutate({ priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <div>Assignee: {issue.assignee_name ?? 'Unassigned'}</div>
      )}
      {issue.viewpoint && onFlyTo && <button onClick={() => onFlyTo(issue)}>Fly to saved view</button>}
      {issue.anchor && <p className="muted" style={{ fontSize: 12 }}>Model location (metres, Y up): {issue.anchor.map((v) => v.toFixed(4)).join(', ')}. {issue.model_version_id ? 'Recorded against a specific model revision.' : 'Legacy pin: model revision unknown.'}</p>}

      {issue.attachments.length > 0 && (
        <div className="thumbs">
          {issue.attachments.map((a) =>
            a.content_type.startsWith('image/') ? (
              <AuthImage key={a.id} src={a.url} alt={a.filename} className="thumb" />
            ) : (
              <span key={a.id} className="badge">{a.filename}</span>
            ),
          )}
        </div>
      )}
      {canComment && (
        <label>Add photos
          <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => e.target.files?.length && upload.mutate(e.target.files)} />
        </label>
      )}

      <h3 style={{ margin: '8px 0 0' }}>Comments</h3>
      {issue.comments.length === 0 && <span className="muted">No comments yet.</span>}
      {issue.comments.map((c) => (
        <div key={c.id} className="comment">
          <div className="muted" style={{ fontSize: 12 }}>{c.author?.name ?? '—'} · {new Date(c.created_at).toLocaleString()}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
        </div>
      ))}
      {canComment && (
        <form className="stack" style={{ gap: 6 }} onSubmit={submitComment}>
          <textarea rows={2} placeholder="Write a comment" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Comment" />
          <div><button disabled={addComment.isPending || !comment.trim()}>Comment</button></div>
        </form>
      )}
    </div>
  )
}
