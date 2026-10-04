import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { can, elementLabel, type Building, type UploadInfo } from '../api/types'
import AuthImage from '../components/AuthImage'
import { STATUS_COLORS } from '../viewer/colors'
import { useProject } from './ProjectLayout'

const VERDICT_COLOR: Record<string, string> = { installed: STATUS_COLORS.done, missing: STATUS_COLORS.issue, not_visible: '#9e9e9e', uncertain: STATUS_COLORS.review }

function UploadCard({ u, projectId, highlight }: { u: UploadInfo; projectId: string; highlight: boolean }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState<Record<string, string>>({})
  const [big, setBig] = useState<string | null>(null)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['reviews', projectId] })
    qc.invalidateQueries({ queryKey: ['elements', projectId] })
    qc.invalidateQueries({ queryKey: ['progress', projectId] })
  }
  const act = useMutation({
    mutationFn: ({ id, action, why }: { id: string; action: 'approve' | 'reject'; why?: string }) =>
      api(`/verifications/${id}/${action}`, { method: 'POST', json: { reason: why ?? '' } }),
    onSuccess: refresh,
  })
  const all = useMutation({ mutationFn: () => api(`/uploads/${u.id}/approve-all`, { method: 'POST', json: {} }), onSuccess: refresh })
  const pending = u.verifications.filter((v) => v.state === 'proposed')
  const flags = [...new Set(u.photos.flatMap((p) => p.flags.map((f) => f.split(':')[0])))]
  return (
    <div className={`panel stack ${highlight ? 'focus' : ''}`} style={{ gap: 8 }}>
      <div className="row">
        <strong className="grow">{u.zone_name} · {u.trade}</strong>
        <span className="muted" style={{ fontSize: 12 }}>{u.user_name} · {new Date(u.captured_at ?? u.created_at).toLocaleString()}</span>
      </div>
      {u.note && <div>“{u.note}”</div>}
      {flags.includes('possible_reuse') && <div className="notice warn">⚠ A photo looks like one submitted before for another day or zone. Check it before approving.</div>}
      <div className="thumbs">
        {u.photos.map((p) => (
          <button key={p.id} className="link" onClick={() => setBig(big === p.id ? null : p.id)} title={p.exif_time ? `Taken ${new Date(p.exif_time).toLocaleString()}` : 'No EXIF time'}>
            <AuthImage src={p.thumb_url} alt="progress photo" className="thumb" />
          </button>
        ))}
      </div>
      {big && <AuthImage src={u.photos.find((p) => p.id === big)!.url} alt="photo" style={{ maxWidth: '100%', borderRadius: 8 }} />}
      {u.analysis_status !== 'none' && <div className="muted" style={{ fontSize: 12 }}>AI check: {u.analysis_status}</div>}
      <table>
        <tbody>
          {u.verifications.filter((v) => v.state !== 'superseded').map((v) => (
            <tr key={v.id}>
              <td style={{ width: 10 }}><span className="dot" style={{ background: VERDICT_COLOR[v.verdict] }} /></td>
              <td>
                {elementLabel({ name: v.element_name, ifc_class: v.element_class ?? '' })}
                <div className="muted" style={{ fontSize: 12 }}>
                  {v.source === 'ai' ? `AI: ${v.verdict.replace('_', ' ')} (${Math.round((v.confidence ?? 0) * 100)}%) ${v.reason}` : `${v.source}: ${v.verdict}`}
                </div>
              </td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                {v.state === 'proposed' && v.verdict === 'installed' ? (
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="small primary" onClick={() => act.mutate({ id: v.id, action: 'approve' })}>Approve</button>
                    <input placeholder="why?" style={{ width: 110 }} value={reason[v.id] ?? ''} onChange={(e) => setReason({ ...reason, [v.id]: e.target.value })} aria-label="Reject reason" />
                    <button className="small danger" disabled={(reason[v.id] ?? '').length < 3} onClick={() => act.mutate({ id: v.id, action: 'reject', why: reason[v.id] })}>Reject</button>
                  </div>
                ) : <span className={`badge ${v.state === 'approved' ? 'ok' : v.state === 'rejected' ? 'danger' : ''}`}>{v.state}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(act.error || all.error) && <div className="error">{((act.error || all.error) as Error).message}</div>}
      {pending.filter((v) => v.verdict === 'installed').length > 1 && (
        <div><button className="primary" onClick={() => all.mutate()}>Approve all {pending.filter((v) => v.verdict === 'installed').length}</button></div>
      )}
    </div>
  )
}

export default function ProgressPage() {
  const { project } = useProject()
  const [params] = useSearchParams()
  const manager = can.editStructure(project.my_role)
  const reviews = useQuery({ queryKey: ['reviews', project.id], queryFn: () => api<UploadInfo[]>(`/projects/${project.id}/reviews`), enabled: manager })
  const recent = useQuery({ queryKey: ['uploads', project.id], queryFn: () => api<UploadInfo[]>(`/projects/${project.id}/uploads?limit=20`) })
  const summary = useQuery({ queryKey: ['progress', project.id], queryFn: () => api<{ zones: Record<string, Record<string, Record<string, number>>>; totals: Record<string, number> }>(`/projects/${project.id}/progress`) })
  const tree = useQuery({ queryKey: ['tree', project.id], queryFn: () => api<Building[]>(`/projects/${project.id}/tree`) })
  const zoneName = (id: string) => tree.data?.flatMap((b) => b.levels.flatMap((l) => l.zones)).find((z) => z.id === id)?.name ?? (id === 'none' ? 'Outside zones' : id.slice(0, 6))
  const t = summary.data?.totals ?? {}
  const total = Object.values(t).reduce((a, b) => a + b, 0)
  return (
    <div className="page stack" style={{ maxWidth: 1100 }}>
      <div className="row">
        <h1 className="grow">Progress</h1>
        <Link to={`/field/${project.id}`} className="btn">Open field app</Link>
        {manager && <Link to="../qr" relative="path" className="btn">Print room QR codes</Link>}
      </div>
      {total > 0 && (
        <div className="panel stack" style={{ gap: 6 }}>
          <div className="progress-bar">
            {(['done', 'needs_review', 'in_progress', 'not_started'] as const).map((k) => (
              <span key={k} style={{ width: `${((t[k] ?? 0) / total) * 100}%`, background: { done: STATUS_COLORS.done, needs_review: STATUS_COLORS.review, in_progress: '#64b5f6', not_started: '#d9d9d9' }[k] }} />
            ))}
          </div>
          <span className="muted">{t.done ?? 0} done · {t.needs_review ?? 0} waiting for review · {t.not_started ?? 0} not started (trade elements on the current model)</span>
        </div>
      )}
      {manager && (
        <>
          <h2>Waiting for your review ({reviews.data?.length ?? 0})</h2>
          {reviews.data?.length === 0 && <p className="muted">Nothing to review.</p>}
          {reviews.data?.map((u) => <UploadCard key={u.id} u={u} projectId={project.id} highlight={params.get('upload') === u.id} />)}
        </>
      )}
      <h2>By zone</h2>
      <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Zone</th><th>Trade</th><th>Done</th><th>In review</th><th>Not started</th></tr></thead>
          <tbody>
            {Object.entries(summary.data?.zones ?? {}).flatMap(([zid, trades]) => Object.entries(trades).map(([trade, c]) => (
              <tr key={zid + trade}><td>{zoneName(zid)}</td><td>{trade}</td><td>{c.done ?? 0}</td><td>{c.needs_review ?? 0}</td><td>{(c.not_started ?? 0) + (c.in_progress ?? 0)}</td></tr>
            )))}
          </tbody>
        </table>
      </div>
      <h2>Recent reports</h2>
      {recent.data?.map((u) => (
        <div key={u.id} className="row panel" style={{ padding: 10 }}>
          <span className="grow">{u.zone_name} · {u.trade} · {u.user_name} · {u.photos.length} photo(s) · {u.verifications.length} item(s)</span>
          <span className="muted" style={{ fontSize: 12 }}>{new Date(u.created_at).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}
