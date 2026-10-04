import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import { STATUS_LABEL, type UploadInfo, type Verification } from '../api/types'
import AuthImage from './AuthImage'

function UploadPhotos({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ['upload', id], queryFn: () => api<UploadInfo>(`/uploads/${id}`) })
  if (!data) return null
  return (
    <div className="thumbs">
      {data.photos.map((p) => <a key={p.id} href="#" onClick={(e) => e.preventDefault()} title={p.exif_time ?? ''}><AuthImage src={p.thumb_url} alt="evidence" className="thumb" /></a>)}
    </div>
  )
}

/** Verifications (worker/AI/manager claims) for an element, with their photo evidence. */
export default function Evidence({ elementId, projectId, zoneId, canOverride, status }: {
  elementId: string
  projectId: string
  zoneId: string | null
  canOverride: boolean
  status: string
}) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['evidence', elementId], queryFn: () => api<Verification[]>(`/elements/${elementId}/evidence`) })
  const uploads = useQuery({
    queryKey: ['uploads', projectId, zoneId],
    queryFn: () => api<UploadInfo[]>(`/projects/${projectId}/uploads${zoneId ? `?zone_id=${zoneId}` : ''}`),
    enabled: canOverride,
  })
  const [open, setOpen] = useState(false)
  const [newStatus, setNewStatus] = useState('done')
  const [reason, setReason] = useState('')
  const [uploadId, setUploadId] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    setErr(null)
    try {
      await api(`/elements/${elementId}/status`, { method: 'POST', json: { status: newStatus, reason, upload_id: uploadId || null } })
      setOpen(false)
      setReason('')
      qc.invalidateQueries({ queryKey: ['evidence', elementId] })
      qc.invalidateQueries({ queryKey: ['element', elementId] })
      qc.invalidateQueries({ queryKey: ['elements', projectId] })
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const shown = (data ?? []).filter((v) => v.state !== 'superseded').slice(0, 5)
  return (
    <div className="stack" style={{ gap: 6 }}>
      <h3 style={{ margin: 0 }}>Evidence</h3>
      {shown.length === 0 && <span className="muted">No photo evidence yet.</span>}
      {shown.map((v) => (
        <div key={v.id} className="comment">
          <div style={{ fontSize: 13 }}>
            <strong>{v.source}</strong> · {v.verdict.replace('_', ' ')}{v.confidence != null && ` (${Math.round(v.confidence * 100)}%)`} · <span className="badge">{v.state}</span>
          </div>
          {(v.reason || v.override_reason) && <div className="muted" style={{ fontSize: 12 }}>{v.override_reason || v.reason}</div>}
          <div className="muted" style={{ fontSize: 11 }}>{new Date(v.created_at).toLocaleString()}</div>
          {v.upload_id && <UploadPhotos id={v.upload_id} />}
        </div>
      ))}
      {canOverride && !open && <button className="small" onClick={() => setOpen(true)}>Override status…</button>}
      {canOverride && open && (
        <div className="stack" style={{ gap: 6 }}>
          <label>New status
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k} disabled={k === status}>{v}</option>)}
            </select>
          </label>
          <label>Photo evidence {newStatus === 'done' ? '(required)' : '(optional)'}
            <select value={uploadId} onChange={(e) => setUploadId(e.target.value)}>
              <option value="">—</option>
              {uploads.data?.map((u) => <option key={u.id} value={u.id}>{new Date(u.created_at).toLocaleDateString()} · {u.user_name} · {u.photos.length} photo(s)</option>)}
            </select>
          </label>
          <label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you overriding?" /></label>
          {err && <div className="error">{err}</div>}
          <div className="row">
            <button className="primary" disabled={reason.length < 3 || (newStatus === 'done' && !uploadId)} onClick={save}>Save</button>
            <button onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
