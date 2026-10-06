import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { PRIORITIES, type Issue, type Member, type Priority, type Trade } from '../api/types'

export interface IssueDraft {
  element_id?: string | null
  zone_id?: string | null
  anchor?: [number, number, number] | null
  model_version_id?: string | null
  sheet_anchor?: { sheet_id: string; x: number; y: number } | null
  viewpoint?: unknown
  trade?: string | null
}

export default function IssueForm({ projectId, draft, onCreated, onCancel }: {
  projectId: string
  draft: IssueDraft
  onCreated: (i: Issue) => void
  onCancel: () => void
}) {
  const members = useQuery({ queryKey: ['members', projectId], queryFn: () => api<Member[]>(`/projects/${projectId}/members`) })
  const trades = useQuery({ queryKey: ['trades'], queryFn: () => api<Trade[]>('/trades') })
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [trade, setTrade] = useState(draft.trade ?? '')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const issue = await api<Issue>(`/projects/${projectId}/issues`, {
        method: 'POST',
        json: { ...draft, title, description, priority, trade: trade || null, assignee_id: assignee || null, due_date: due || null },
      })
      if (files?.length) {
        const fd = new FormData()
        Array.from(files).forEach((f) => fd.append('files', f))
        await api(`/issues/${issue.id}/attachments`, { method: 'POST', body: fd })
      }
      onCreated(issue)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" style={{ gap: 8 }} onSubmit={submit}>
      <h3 className="title" style={{ margin: 0 }}>New issue</h3>
      <span className="muted" style={{ fontSize: 12 }}>
        {draft.element_id ? 'Pinned to the selected element.' : draft.anchor ? 'Pinned to a point.' : 'Not pinned to the model.'} The current view is saved with it.
      </span>
      <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus /></label>
      <label>Description<textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="row">
        <label className="grow">Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="grow">Trade
          <select value={trade} onChange={(e) => setTrade(e.target.value)}>
            <option value="">—</option>
            {trades.data?.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </label>
      </div>
      <div className="row">
        <label className="grow">Assignee
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {members.data?.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
          </select>
        </label>
        <label className="grow">Due<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
      </div>
      <label>Photos<input type="file" accept="image/*" capture="environment" multiple onChange={(e) => setFiles(e.target.files)} /></label>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="primary" disabled={busy}>Create issue</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
