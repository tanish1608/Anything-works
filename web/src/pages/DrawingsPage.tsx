import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { waitForJob } from '../api/jobs'
import { can, type Building, type Job, type Sheet } from '../api/types'
import { useProject } from './ProjectLayout'

const DISCIPLINES = ['architecture', 'plumbing', 'electrical', 'hvac', 'structure']

function summary(s: Sheet): string {
  const c = s.counts
  if (!c) return '—'
  if (s.discipline === 'architecture' || s.discipline === 'structure')
    return `${c.walls} walls · ${c.doors} doors · ${c.windows} windows · ${c.rooms} rooms`
  if (s.discipline === 'plumbing') return `${Object.values(c.fixtures ?? {}).reduce((a, b) => a + b, 0)} fixtures · ${c.pipe_segments} pipe segments`
  if (s.discipline === 'electrical') return `${Object.values(c.devices ?? {}).reduce((a, b) => a + b, 0)} devices`
  return '—'
}

export default function DrawingsPage() {
  const { project } = useProject()
  const qc = useQueryClient()
  const nav = useNavigate()
  const editable = can.editStructure(project.my_role)
  const sheets = useQuery({ queryKey: ['sheets', project.id], queryFn: () => api<Sheet[]>(`/projects/${project.id}/sheets`),
    refetchInterval: (q) => (q.state.data?.some((s) => s.status === 'detecting') ? 1500 : false) })
  const tree = useQuery({ queryKey: ['tree', project.id], queryFn: () => api<Building[]>(`/projects/${project.id}/tree`) })
  const levels = (tree.data ?? []).flatMap((b) => b.levels.map((l) => ({ id: l.id, label: `${b.name} › ${l.name}` })))
  const levelName = (id: string | null) => levels.find((l) => l.id === id)?.label ?? 'No level'

  const [file, setFile] = useState<File | null>(null)
  const [discipline, setDiscipline] = useState('architecture')
  const [levelId, setLevelId] = useState('')
  const [newLevel, setNewLevel] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<{ versionId: string; number: number } | null>(null)

  const ensureLevel = async (): Promise<string | null> => {
    if (levelId !== '__new') return levelId || null
    let b = tree.data?.[0]
    if (!b) b = await api<Building>(`/projects/${project.id}/buildings`, { method: 'POST', json: { name: 'Building A' } })
    const idx = b.levels?.length ?? 0
    const lv = await api<{ id: string }>(`/buildings/${b.id}/levels`, {
      method: 'POST', json: { name: newLevel || `Level ${idx + 1}`, index: idx, elevation_m: idx * 3, height_m: 3 },
    })
    qc.invalidateQueries({ queryKey: ['tree', project.id] })
    setLevelId(lv.id)
    return lv.id
  }

  const upload = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    setError(null)
    setBusy('Uploading…')
    try {
      const lid = await ensureLevel()
      const fd = new FormData()
      fd.append('file', file)
      fd.append('discipline', discipline)
      if (lid) fd.append('level_id', lid)
      const job = await api<Job>(`/projects/${project.id}/sheets`, { method: 'POST', body: fd })
      setBusy('Reading the drawing…')
      qc.invalidateQueries({ queryKey: ['sheets', project.id] })
      const done = await waitForJob(job.id)
      if (done.status === 'failed') throw new Error(done.error?.split('\n')[0] ?? 'Detection failed')
      qc.invalidateQueries({ queryKey: ['sheets', project.id] })
      setFile(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const build = async () => {
    setError(null)
    setBusy('Building the 3D model…')
    try {
      const job = await api<Job>(`/projects/${project.id}/conversions`, { method: 'POST', json: { message: 'Converted from drawings' } })
      const done = await waitForJob(job.id)
      if (done.status === 'failed') throw new Error(done.error?.split('\n')[0] ?? 'Build failed')
      setReport({ versionId: String(done.result!.version_id), number: Number(done.result!.number) })
      qc.invalidateQueries({ queryKey: ['versions', project.id] })
      qc.invalidateQueries({ queryKey: ['tree', project.id] })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const ready = (sheets.data ?? []).filter((s) => s.status === 'detected' && s.level_id)
  return (
    <div className="page stack" style={{ maxWidth: 1200 }}>
      <h1>Drawings</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Upload DXF (or vector PDF) floor plans per level and trade. Review what was detected, fix anything that's wrong, then build the 3D model.
        The model stays a draft until you approve it.
      </p>
      {error && <div className="error" role="alert">{error}</div>}
      {busy && <div className="notice">{busy}</div>}
      {report && (
        <div className="notice">
          Draft model v{report.number} is ready. <Link to={`../model?version=${report.versionId}`}>Review it in 3D and approve →</Link>
        </div>
      )}
      <div className="panel" style={{ overflowX: 'auto', padding: 0 }}>
        <table>
          <thead><tr><th>Drawing</th><th>Trade</th><th>Level</th><th>Status</th><th>Detected</th><th>To review</th><th /></tr></thead>
          <tbody>
            {sheets.data?.map((s) => (
              <tr key={s.id}>
                <td><Link to={s.id}>{s.name}</Link><div className="muted" style={{ fontSize: 12 }}>{s.filename}</div></td>
                <td>{s.discipline}</td>
                <td>{levelName(s.level_id)}</td>
                <td><span className={`badge ${s.status === 'detected' ? 'ok' : s.status === 'failed' ? 'danger' : 'warn'}`}>{s.status}</span>
                  {s.error && <div className="error" style={{ fontSize: 12 }}>{s.error.split('\n')[0]}</div>}</td>
                <td>{summary(s)}</td>
                <td>{s.review_open + s.warnings.length > 0 ? <span className="badge warn">{s.review_open} items · {s.warnings.length} notes</span> : <span className="muted">—</span>}</td>
                <td>{s.status === 'detected' && <button className="small" onClick={() => nav(s.id)}>{editable ? 'Review' : 'View'}</button>}</td>
              </tr>
            ))}
            {sheets.data?.length === 0 && <tr><td colSpan={7} className="muted">No drawings yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <form className="panel stack grow" onSubmit={upload} style={{ maxWidth: 560 }}>
            <h2>Upload a drawing</h2>
            <label>DXF or vector PDF
              <input type="file" accept=".dxf,.pdf,.dwg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            </label>
            <div className="row">
              <label className="grow">Trade / discipline
                <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
                  {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
                </select>
              </label>
              <label className="grow">Level
                <select value={levelId} onChange={(e) => setLevelId(e.target.value)} aria-label="Level">
                  <option value="">Assign later</option>
                  {levels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  <option value="__new">+ New level…</option>
                </select>
              </label>
            </div>
            {levelId === '__new' && <label>New level name<input value={newLevel} onChange={(e) => setNewLevel(e.target.value)} placeholder="Level 1" /></label>}
            <div><button className="primary" disabled={!file || !!busy}>Upload &amp; detect</button></div>
            <span className="muted" style={{ fontSize: 12 }}>DWG: in AutoCAD use SAVEAS → DXF first. PDFs: architectural plans only for now; scanned PDFs aren't supported yet.</span>
          </form>
          <div className="panel stack" style={{ maxWidth: 380 }}>
            <h2>Build 3D model</h2>
            <p className="muted" style={{ margin: 0 }}>{ready.length} processed drawing{ready.length === 1 ? '' : 's'} with a level. Walls, rooms and openings come from architecture sheets; pipes, fixtures and devices from trade sheets.</p>
            <div><button className="primary" disabled={!ready.length || !!busy} onClick={build}>Build draft model</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
