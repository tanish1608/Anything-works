import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { waitForJob } from '../api/jobs'
import { can, type Building, type Job, type SheetDetail } from '../api/types'
import PlanOverlay, { type Selection } from '../components/PlanOverlay'
import SheetCanvas, { type PlanPoint } from '../components/SheetCanvas'
import { useProject } from './ProjectLayout'

type Tool = 'select' | 'wall' | 'pipe' | 'reference'
const UNITS: [string, number][] = [['millimetres', 0.001], ['centimetres', 0.01], ['metres', 1], ['inches', 0.0254], ['feet', 0.3048]]
const PT = 0.0254 / 72 // one PDF point on paper, in metres
const PDF_SCALES: [string, number][] = [['1/8" = 1\'-0"', PT * 96], ['3/16" = 1\'-0"', PT * 64], ['1/4" = 1\'-0"', PT * 48],
  ['1/2" = 1\'-0"', PT * 24], ['1:200', PT * 200], ['1:100', PT * 100], ['1:50', PT * 50]]
const SYSTEMS = ['cold', 'hot', 'waste', 'vent', 'gas']

function fmtLen(m: number) {
  const ft = m / 0.3048
  return `${m.toFixed(2)} m (${Math.floor(ft)}'-${Math.round((ft % 1) * 12)}")`
}

export default function SheetReviewPage() {
  const { project } = useProject()
  const { sid } = useParams()
  const qc = useQueryClient()
  const key = ['sheet', sid]
  const { data: sheet, error } = useQuery({ queryKey: key, queryFn: () => api<SheetDetail>(`/sheets/${sid}`),
    refetchInterval: (q) => (q.state.data?.status === 'detecting' ? 1200 : false) })
  const meta = useQuery({ queryKey: ['layer-roles'], queryFn: () => api<{ roles: string[] }>('/meta/layer-roles') })
  const tree = useQuery({ queryKey: ['tree', project.id], queryFn: () => api<Building[]>(`/projects/${project.id}/tree`) })
  const editable = can.editStructure(project.my_role)
  const [tool, setTool] = useState<Tool>('select')
  const [sel, setSel] = useState<Selection>(null)
  const [pts, setPts] = useState<PlanPoint[]>([])
  const [hover, setHover] = useState<PlanPoint | null>(null)
  const [system, setSystem] = useState('cold')
  const [thickness, setThickness] = useState(0.15)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [roles, setRoles] = useState<Record<string, string>>({})
  const [svgVersion, setSvgVersion] = useState(0)

  useEffect(() => {
    if (sheet?.plan) setRoles(Object.fromEntries(Object.entries(sheet.plan.layers).map(([k, v]) => [k, v.role])))
  }, [sheet?.plan])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPts([]); setTool('select') }
      if (e.key === 'Enter' && tool === 'pipe' && pts.length >= 2) finishPipe()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const plan = sheet?.plan
  const levels = (tree.data ?? []).flatMap((b) => b.levels.map((l) => ({ id: l.id, label: `${b.name} › ${l.name}` })))

  const edit = async (ops: Record<string, unknown>[]) => {
    setErr(null)
    try {
      const updated = await api<SheetDetail>(`/sheets/${sid}/edits`, { method: 'POST', json: { ops } })
      qc.setQueryData(key, updated)
      qc.invalidateQueries({ queryKey: ['sheets', project.id] })
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const patch = async (json: Record<string, unknown>, label = 'Saving…') => {
    setErr(null)
    setBusy(label)
    try {
      await api(`/sheets/${sid}`, { method: 'PATCH', json })
      await qc.invalidateQueries({ queryKey: key })
      setSvgVersion((v) => v + 1)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const redetect = async () => {
    if (!window.confirm('Re-run detection from the drawing? Your edits on this sheet will be discarded.')) return
    setBusy('Re-running detection…')
    try {
      const job = await api<Job>(`/sheets/${sid}/detect`, { method: 'POST' })
      await waitForJob(job.id)
      await qc.invalidateQueries({ queryKey: key })
      setSvgVersion((v) => v + 1)
    } finally {
      setBusy(null)
    }
  }
  const finishPipe = () => {
    if (pts.length >= 2) edit([{ op: 'add_pipe', system, points: pts }])
    setPts([])
  }
  const onPoint = (p: PlanPoint) => {
    if (!editable) return setSel(null)
    if (tool === 'select') return setSel(null)
    if (tool === 'reference') {
      patch({ transform: { reference: p } }, 'Setting reference point…')
      setTool('select')
      return
    }
    if (tool === 'wall') {
      if (pts.length === 0) return setPts([p])
      // Snap to horizontal/vertical when close (most residential walls are orthogonal).
      const a = pts[0]
      const b: PlanPoint = Math.abs(p[0] - a[0]) < Math.abs(p[1] - a[1]) * 0.08 ? [a[0], p[1]] : Math.abs(p[1] - a[1]) < Math.abs(p[0] - a[0]) * 0.08 ? [p[0], a[1]] : p
      edit([{ op: 'add_wall', a, b, thickness }])
      setPts([])
      return
    }
    if (tool === 'pipe') setPts([...pts, p])
  }

  const selected = useMemo(() => {
    if (!sel || !plan) return null
    if (sel.kind === 'opening') {
      for (const w of plan.walls) { const o = w.openings.find((x) => x.id === sel.id); if (o) return { ...o, wall: w } }
      return null
    }
    const list = { wall: plan.walls, room: plan.rooms, fixture: plan.fixtures, device: plan.devices, pipe: plan.pipes }[sel.kind] as { id: string }[]
    return list.find((x) => x.id === sel.id) ?? null
  }, [sel, plan])

  if (error) return <div className="page error">{(error as Error).message}</div>
  if (!sheet) return <div className="page muted">Loading…</div>
  const longest = plan ? Math.max(0, ...plan.walls.map((w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]))) : 0
  const scales = sheet.file_type === 'pdf' ? PDF_SCALES : UNITS
  const unitName = scales.find(([, v]) => Math.abs(v - (sheet.unit_m ?? 0)) < 1e-9)?.[0] ?? `${sheet.unit_m} m/unit`
  const s = selected as Record<string, unknown> | null

  return (
    <div className="review-layout">
      <aside className="model-side left">
        <section>
          <Link to=".." relative="path">← Drawings</Link>
          <h3 className="title" style={{ marginTop: 6 }}>{sheet.name}</h3>
          <span className="muted">{sheet.discipline} · {sheet.status}</span>
          {busy && <div className="notice">{busy}</div>}
          {err && <div className="error">{err}</div>}
          {sheet.status === 'failed' && <div className="error">{sheet.error}</div>}
        </section>
        {editable && (
          <section>
            <h3>Level</h3>
            <select value={sheet.level_id ?? ''} onChange={(e) => patch({ level_id: e.target.value || null })} aria-label="Sheet level">
              <option value="">Not assigned</option>
              {levels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </section>
        )}
        {plan && (
          <section>
            <h3>Scale</h3>
            <div>{sheet.file_type === 'pdf' ? 'Scale' : 'Units'}: <strong>{unitName}</strong> <span className="muted">({sheet.units_confirmed ? 'confirmed' : plan.units.source === 'header' ? 'from file' : plan.units.source === 'title block' ? 'from title block' : 'guessed'})</span></div>
            {longest > 0 && <div className="muted" style={{ fontSize: 12 }}>Longest wall: {fmtLen(longest)}. Does that look right?</div>}
            {editable && (
              <div className="row">
                <select aria-label="Drawing units" value={scales.find(([, v]) => Math.abs(v - (sheet.unit_m ?? 0)) < 1e-9)?.[1] ?? ''} onChange={(e) => patch({ unit_m: Number(e.target.value) }, 'Re-detecting at the new scale…')}>
                  {!scales.some(([, v]) => Math.abs(v - (sheet.unit_m ?? 0)) < 1e-9) && <option value="">{unitName}</option>}
                  {scales.map(([n, v]) => <option key={n} value={v}>{n}</option>)}
                </select>
                {!sheet.units_confirmed && <button className="small primary" onClick={() => patch({ unit_m: sheet.unit_m }, 'Confirming…')}>Confirm</button>}
              </div>
            )}
          </section>
        )}
        {plan && editable && (
          <section>
            <h3>Alignment</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              Building origin = {sheet.transform.reference ? `(${sheet.transform.reference.map((v) => v.toFixed(2)).join(', ')})` : 'auto'} on this sheet ·{' '}
              {sheet.transform.confirmed ? 'confirmed' : 'auto (outside bottom-left corner)'}
            </span>
            <button className={tool === 'reference' ? 'primary' : ''} onClick={() => setTool(tool === 'reference' ? 'select' : 'reference')}>
              {tool === 'reference' ? 'Click the reference point…' : 'Pick reference point'}
            </button>
          </section>
        )}
        {plan && (plan.warnings.length > 0 || plan.review.length > 0) && (
          <section>
            <h3>Needs attention</h3>
            {plan.warnings.map((w, i) => <div key={i} className="notice warn" style={{ fontSize: 12 }}>{w}</div>)}
            {plan.review.map((r) => (
              <div key={r.id} className="row" style={{ fontSize: 13 }}>
                <button className="link grow" style={{ textAlign: 'left' }} onClick={() => setSel({ kind: r.type as 'room', id: r.id })}>{r.reason}</button>
                {editable && <button className="small" onClick={() => edit([{ op: 'resolve', id: r.id }])}>OK</button>}
              </div>
            ))}
          </section>
        )}
        {plan && editable && (
          <section>
            <h3>Layers</h3>
            {Object.entries(plan.layers).map(([layer, info]) => (
              <div key={layer} className="row" style={{ fontSize: 13 }}>
                <span className="grow" title={`${info.count} entities`}>{layer}</span>
                <select aria-label={`Role for layer ${layer}`} value={roles[layer] ?? 'auto'} onChange={(e) => setRoles({ ...roles, [layer]: e.target.value })}>
                  {meta.data?.roles.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            ))}
            <button onClick={() => patch({ layer_roles: roles }, 'Re-detecting with new layer roles…')}>Apply roles &amp; re-detect</button>
          </section>
        )}
        {plan && (
          <section>
            <h3>Detected</h3>
            <div style={{ fontSize: 13 }}>
              {plan.walls.length} walls · {plan.walls.reduce((n, w) => n + w.openings.length, 0)} openings · {plan.rooms.length} rooms ·{' '}
              {plan.fixtures.length} fixtures · {plan.devices.length} devices · {plan.pipes.length} pipe segments
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Your corrections: {sheet.corrections.added ?? 0} added, {sheet.corrections.edited ?? 0} edited, {sheet.corrections.deleted ?? 0} deleted
            </div>
            {editable && (
              <div className="row">
                <button className="small" onClick={() => edit([{ op: 'recompute_rooms' }])}>Recompute rooms</button>
                <button className="small" onClick={redetect}>Re-run detection</button>
              </div>
            )}
          </section>
        )}
      </aside>

      <div className="review-canvas">
        {editable && plan && (
          <div className="toolbar">
            {(['select', 'wall', 'pipe'] as Tool[]).map((t) => (
              <button key={t} className={tool === t ? 'primary' : ''} onClick={() => { setTool(t); setPts([]) }}>
                {t === 'select' ? 'Select' : t === 'wall' ? 'Add wall' : 'Trace pipe'}
              </button>
            ))}
            {tool === 'wall' && (
              <label className="row" style={{ flexDirection: 'row', background: 'var(--panel)', padding: '0 6px', borderRadius: 6 }}>
                t (m) <input type="number" step="0.01" value={thickness} onChange={(e) => setThickness(+e.target.value)} style={{ width: 70 }} />
              </label>
            )}
            {tool === 'pipe' && (
              <>
                <select value={system} onChange={(e) => setSystem(e.target.value)} aria-label="Pipe system">{SYSTEMS.map((x) => <option key={x}>{x}</option>)}</select>
                <button disabled={pts.length < 2} onClick={finishPipe}>Finish ({pts.length} pts)</button>
              </>
            )}
          </div>
        )}
        {sheet.status === 'detected' || sheet.status === 'detecting' ? (
          <SheetCanvas sheetId={sheet.id} version={`${svgVersion}-${sheet.updated_at}`} onPoint={onPoint} onMove={tool !== 'select' ? setHover : undefined}
            cursor={tool === 'select' ? undefined : 'crosshair'}>
            {plan && <PlanOverlay plan={plan} selected={sel} onSelect={tool === 'select' ? setSel : undefined} />}
            {pts.length > 0 && hover && (
              <polyline points={[...pts, hover].map((p) => p.join(',')).join(' ')} fill="none" stroke="#7c4dff" strokeWidth={0.05} strokeDasharray="0.15 0.1" />
            )}
            {sheet.transform.reference && (
              <g>
                <circle cx={sheet.transform.reference[0]} cy={sheet.transform.reference[1]} r={0.25} fill="none" stroke="#d81b60" strokeWidth={0.05} />
                <circle cx={sheet.transform.reference[0]} cy={sheet.transform.reference[1]} r={0.06} fill="#d81b60" />
              </g>
            )}
          </SheetCanvas>
        ) : <div className="muted" style={{ padding: 20 }}>Drawing not processed.</div>}
      </div>

      <aside className="model-side right">
        {!s && <div className="muted">Select something on the drawing to inspect or fix it. Colours: red = detected wall, orange = low confidence, green = added by you; doors orange, windows blue, plain openings purple; dashed = needs a look.</div>}
        {s && sel && (
          <div className="stack" style={{ gap: 8 }}>
            <h3 className="title">{sel.kind}{'name' in s ? `: ${s.name}` : 'kind' in s ? `: ${s.kind}` : ''}</h3>
            {'confidence' in s && <span className="muted">Confidence {Math.round(Number(s.confidence) * 100)}% {'source' in s ? `· ${s.source}` : ''}</span>}
            {sel.kind === 'wall' && editable && <WallForm wall={s} onSave={(v) => edit([{ op: 'update_wall', id: sel.id, ...v }])} />}
            {sel.kind === 'opening' && editable && (
              <label>Type
                <select value={String(s.kind)} onChange={(e) => edit([{ op: 'update_opening', id: sel.id, kind: e.target.value }])}>
                  <option value="door">Door</option><option value="window">Window</option><option value="opening">Opening (no door)</option>
                </select>
              </label>
            )}
            {sel.kind === 'room' && editable && <RenameForm name={String(s.name)} onSave={(name) => edit([{ op: 'rename_room', id: sel.id, name }])} />}
            {sel.kind === 'pipe' && (
              <div className="stack" style={{ gap: 4 }}>
                <span>System: {String(s.system)} · ⌀ {(Number(s.diameter) * 1000).toFixed(0)} mm · {String(s.fitting ?? '')}</span>
                {editable && <PipeForm pipe={s} onSave={(v) => edit([{ op: 'update_pipe', id: sel.id, ...v }])} />}
              </div>
            )}
            {editable && (
              <button className="danger" onClick={() => { edit([{ op: 'delete', kind: sel.kind, id: sel.id }]); setSel(null) }}>Delete {sel.kind}</button>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

function WallForm({ wall, onSave }: { wall: Record<string, unknown>; onSave: (v: { thickness: number; height: number | null }) => void }) {
  const [t, setT] = useState(String(wall.thickness))
  const [h, setH] = useState(wall.height == null ? '' : String(wall.height))
  useEffect(() => { setT(String(wall.thickness)); setH(wall.height == null ? '' : String(wall.height)) }, [wall])
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label>Thickness (m)<input type="number" step="0.005" value={t} onChange={(e) => setT(e.target.value)} /></label>
      <label>Height (m, blank = level default)<input type="number" step="0.05" value={h} onChange={(e) => setH(e.target.value)} /></label>
      <div><button className="primary" onClick={() => onSave({ thickness: Number(t), height: h === '' ? null : Number(h) })}>Save wall</button></div>
    </div>
  )
}

function RenameForm({ name, onSave }: { name: string; onSave: (n: string) => void }) {
  const [v, setV] = useState(name)
  useEffect(() => setV(name), [name])
  return (
    <div className="row">
      <input className="grow" value={v} onChange={(e) => setV(e.target.value)} aria-label="Room name" />
      <button className="primary" onClick={() => onSave(v)}>Rename</button>
    </div>
  )
}

function PipeForm({ pipe, onSave }: { pipe: Record<string, unknown>; onSave: (v: { z: number }) => void }) {
  const [z, setZ] = useState(String(pipe.z))
  useEffect(() => setZ(String(pipe.z)), [pipe])
  return (
    <div className="row">
      <label className="grow">Height above floor (m)<input type="number" step="0.05" value={z} onChange={(e) => setZ(e.target.value)} /></label>
      <button onClick={() => onSave({ z: Number(z) })}>Save</button>
    </div>
  )
}
