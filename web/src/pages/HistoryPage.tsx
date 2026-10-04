import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { ModelVersion } from '../api/types'
import { stateAt, type Timeline } from '../lib/replay'
import { elementColor, LEGEND } from '../viewer/colors'
import { useModel } from '../viewer/useModel'
import type { SiteViewer } from '../viewer/Viewer'
import ViewerCanvas from '../viewer/ViewerCanvas'
import { useProject } from './ProjectLayout'

interface DiffRow { element_id: string; name: string | null; ifc_class: string; discipline: string; changed_fields?: string[]; distance_m?: number }
interface Diff { from: { number: number }; to: { number: number }; added: DiffRow[]; removed: DiffRow[]; moved: DiffRow[]; changed: DiffRow[]; unchanged: number }

const DIFF_COLORS = { added: '#43a047', changed: '#ffb300', moved: '#7c4dff' }

export default function HistoryPage() {
  const { project } = useProject()
  const [mode, setMode] = useState<'timeline' | 'diff'>('timeline')
  const [viewer, setViewer] = useState<SiteViewer | null>(null)
  const versions = useQuery({ queryKey: ['versions', project.id], queryFn: () => api<ModelVersion[]>(`/projects/${project.id}/models`) })
  const approved = (versions.data ?? []).filter((v) => v.status === 'approved')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  useEffect(() => {
    if (approved.length >= 2 && !from) {
      setTo(approved[0].id)
      setFrom(approved[1].id)
    }
  }, [approved, from])
  const diff = useQuery({
    queryKey: ['diff', from, to],
    queryFn: () => api<Diff>(`/projects/${project.id}/models/diff?from=${from}&to=${to}`),
    enabled: mode === 'diff' && !!from && !!to && from !== to,
  })
  const { elements, loaded } = useModel(viewer, project.id, mode === 'diff' && to ? to : undefined)

  // ---- timeline replay
  const tl = useQuery({ queryKey: ['timeline', project.id], queryFn: () => api<Timeline>(`/projects/${project.id}/timeline`) })
  const t0 = tl.data ? Date.parse(tl.data.start) : 0
  const t1 = tl.data ? Date.parse(tl.data.end) : 1
  const [at, setAt] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const now = at ?? t1
  const timer = useRef<number | null>(null)
  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => {
      setAt((a) => {
        const next = (a ?? t0) + (t1 - t0) / 120
        if (next >= t1) {
          setPlaying(false)
          return t1
        }
        return next
      })
    }, 80)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [playing, t0, t1])

  const replay = useMemo(() => (tl.data ? stateAt(tl.data, elements, now) : []), [tl.data, elements, now])
  useEffect(() => {
    if (!viewer || !loaded) return
    if (mode === 'timeline') {
      viewer.setColors(new Map(replay.map((e) => [e.id, elementColor(e, true)])))
    } else if (diff.data) {
      const c = new Map<string, string>(elements.map((e) => [e.id, '#dddddd']))
      for (const k of ['added', 'changed', 'moved'] as const) for (const r of diff.data[k]) c.set(r.element_id, DIFF_COLORS[k])
      viewer.setColors(c)
    }
  }, [viewer, loaded, mode, replay, diff.data, elements])

  const counts = replay.reduce((a, e) => ({ ...a, [e.status]: (a[e.status] ?? 0) + 1 }), {} as Record<string, number>)
  const changesSoFar = tl.data?.status_changes.filter((c) => Date.parse(c.at) <= now).length ?? 0
  return (
    <div className="model-layout history-layout">
      <aside className="model-side left">
        <div className="tabs" role="tablist">
          <button role="tab" className={mode === 'timeline' ? 'active' : ''} onClick={() => setMode('timeline')}>Timeline</button>
          <button role="tab" className={mode === 'diff' ? 'active' : ''} onClick={() => setMode('diff')}>Compare versions</button>
        </div>
        {mode === 'timeline' && tl.data && (
          <section>
            <h3>Replay progress</h3>
            <div className="row">
              <button onClick={() => { if (now >= t1) setAt(t0); setPlaying(!playing) }}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
              <button onClick={() => { setPlaying(false); setAt(null) }}>Now</button>
            </div>
            <input type="range" min={t0} max={t1} step={(t1 - t0) / 500 || 1} value={now} onChange={(e) => { setPlaying(false); setAt(+e.target.value) }} aria-label="Timeline" />
            <strong>{new Date(now).toLocaleString()}</strong>
            <span className="muted" style={{ fontSize: 13 }}>{counts.done ?? 0} done · {counts.needs_review ?? 0} in review · {changesSoFar} status changes so far</span>
            <div className="legend">{LEGEND.map((l) => <div key={l.label} className="row"><span className="swatch" style={{ background: l.color }} />{l.label}</div>)}</div>
            <h3 style={{ marginTop: 10 }}>Model versions</h3>
            {tl.data.versions.map((v) => (
              <button key={v.id} className="link" style={{ textAlign: 'left' }} onClick={() => { setPlaying(false); setAt(Date.parse(v.at)) }}>
                v{v.number} · {new Date(v.at).toLocaleDateString()} · {v.message}
              </button>
            ))}
            <span className="muted" style={{ fontSize: 12 }}>Replay colours the current model; elements added later show as not started before they existed.</span>
          </section>
        )}
        {mode === 'diff' && (
          <section>
            <h3>Compare</h3>
            <label>From<select value={from} onChange={(e) => setFrom(e.target.value)}>{approved.map((v) => <option key={v.id} value={v.id}>v{v.number} {v.branch !== 'main' ? `(${v.branch})` : ''} · {v.message}</option>)}</select></label>
            <label>To<select value={to} onChange={(e) => setTo(e.target.value)}>{approved.map((v) => <option key={v.id} value={v.id}>v{v.number} {v.branch !== 'main' ? `(${v.branch})` : ''} · {v.message}</option>)}</select></label>
            {approved.length < 2 && <span className="muted">Only one approved version so far.</span>}
            {diff.data && (
              <div className="stack" style={{ gap: 6 }}>
                <div className="legend">
                  <div className="row"><span className="swatch" style={{ background: DIFF_COLORS.added }} />{diff.data.added.length} added</div>
                  <div className="row"><span className="swatch" style={{ background: DIFF_COLORS.changed }} />{diff.data.changed.length} changed</div>
                  <div className="row"><span className="swatch" style={{ background: DIFF_COLORS.moved }} />{diff.data.moved.length} moved</div>
                  <div className="row"><span className="swatch" style={{ background: '#fff', border: '1px dashed #999' }} />{diff.data.removed.length} removed (listed below)</div>
                  <div className="row muted">{diff.data.unchanged} unchanged</div>
                </div>
                {(['added', 'changed', 'moved', 'removed'] as const).map((k) => diff.data![k].length > 0 && (
                  <details key={k} open={k !== 'added'}>
                    <summary>{k} ({diff.data![k].length})</summary>
                    {diff.data![k].map((r) => (
                      <div key={r.element_id} className="muted" style={{ fontSize: 12 }}>
                        {r.ifc_class.replace('Ifc', '')} {r.name ?? ''} {r.changed_fields?.length ? `· ${r.changed_fields.join(', ')}` : ''}{r.distance_m ? ` · moved ${r.distance_m} m` : ''}
                      </div>
                    ))}
                  </details>
                ))}
              </div>
            )}
          </section>
        )}
        <section>
          <Link to="../activity" relative="path">Full activity log →</Link>
        </section>
      </aside>
      <div className="viewer-wrap">
        <ViewerCanvas onReady={setViewer} />
        {!loaded && <div className="viewer-overlay">Loading model…</div>}
      </div>
    </div>
  )
}
