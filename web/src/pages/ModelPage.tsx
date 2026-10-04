import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { waitForJob } from '../api/jobs'
import {
  can,
  STATUS_LABEL,
  type Building,
  type ElementDetail,
  type ElementInfo,
  ISSUE_STATUS_COLOR,
  type Issue,
  type Job,
  type ModelVersion,
  type ViewerManifest,
} from '../api/types'
import IssueFilters, { DEFAULT_FILTER, filterQuery, type IssueFilter } from '../components/IssueFilters'
import IssueForm, { type IssueDraft } from '../components/IssueForm'
import IssuePanel from '../components/IssuePanel'
import { describe } from '../lib/events'
import { DISCIPLINE_COLORS, DISCIPLINE_LABELS, LEGEND } from '../viewer/colors'
import { colorMap, visibleIds } from '../viewer/filters'
import type { SectionBox, SiteViewer } from '../viewer/Viewer'
import ViewerCanvas from '../viewer/ViewerCanvas'
import { useProject } from './ProjectLayout'

const FULL: SectionBox = { min: [0, 0, 0], max: [1, 1, 1] }

function ImportPanel({ projectId, onDone }: { projectId: string; onDone: (versionId: string) => void }) {
  const [files, setFiles] = useState<FileList | null>(null)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const upload = async () => {
    if (!files?.length) return
    const fd = new FormData()
    Array.from(files).forEach((f) => fd.append('files', f))
    fd.append('message', message)
    setError(null)
    setStatus('Uploading…')
    try {
      const job = await api<Job>(`/projects/${projectId}/models/import`, { method: 'POST', body: fd })
      const done = await waitForJob(job.id, (j) => setStatus(j.status === 'running' ? 'Processing model…' : `Job ${j.status}`))
      if (done.status === 'failed') throw new Error(done.error?.split('\n')[0] ?? 'Import failed')
      setStatus(null)
      onDone(String(done.result!.version_id))
    } catch (e) {
      setStatus(null)
      setError((e as Error).message)
    }
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label>
        IFC files (one per discipline is fine)
        <input type="file" accept=".ifc" multiple onChange={(e) => setFiles(e.target.files)} />
      </label>
      <input placeholder="Message, e.g. Issued for construction rev B" value={message} onChange={(e) => setMessage(e.target.value)} />
      <button className="primary" disabled={!files?.length || !!status} onClick={upload}>Upload as draft</button>
      {status && <span className="muted">{status}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  )
}

function ElementPanel({ id, versionId, onClose }: { id: string; versionId?: string; onClose: () => void }) {
  const { data: el, error } = useQuery({
    queryKey: ['element', id, versionId],
    queryFn: () => api<ElementDetail>(`/elements/${id}${versionId ? `?version=${versionId}` : ''}`),
  })
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <h3 className="grow title" style={{ margin: 0 }}>{el?.name || el?.ifc_class || 'Element'}</h3>
        <button className="small" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {error && <div className="error">{(error as Error).message}</div>}
      {el && (
        <>
          <div className="row">
            <span className="badge" style={{ borderColor: DISCIPLINE_COLORS[el.discipline] }}>{DISCIPLINE_LABELS[el.discipline]}</span>
            <span className={`badge ${el.status === 'done' ? 'ok' : el.status === 'needs_review' ? 'warn' : ''}`}>{STATUS_LABEL[el.status]}</span>
            {el.open_issues > 0 && <span className="badge danger">{el.open_issues} open issue{el.open_issues > 1 ? 's' : ''}</span>}
            {el.flags.map((f) => <span key={f} className="badge warn">{f.replace(/_/g, ' ')}</span>)}
          </div>
          <table className="props">
            <tbody>
              <tr><th>Type</th><td>{el.ifc_class}</td></tr>
              <tr><th>Trade</th><td>{el.trade}</td></tr>
              <tr><th>Source</th><td>{el.source}{el.confidence != null && ` (confidence ${Math.round(el.confidence * 100)}%)`}</td></tr>
              <tr><th>GUID</th><td><code>{el.ifc_guid}</code></td></tr>
              {Object.entries(el.props).slice(0, 30).map(([k, v]) => (
                <tr key={k}><th>{k}</th><td>{String(v)}</td></tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ margin: 0 }}>History</h3>
          {el.history.length === 0 && <span className="muted">No changes recorded yet.</span>}
          {el.history.map((h) => (
            <div key={h.id} className="muted" style={{ fontSize: 12 }}>
              {new Date(h.at).toLocaleString()} · {h.actor_name ?? 'system'} · {describe(h)}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default function ModelPage() {
  const { project } = useProject()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const versionParam = params.get('version') ?? undefined
  const viewerRef = useRef<SiteViewer | null>(null)
  const [viewerReady, setViewerReady] = useState(false)
  const [webglFailed, setWebglFailed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [disciplines, setDisciplines] = useState<Set<string> | null>(null)
  const [levelId, setLevelId] = useState<string | null>(null)
  const [zoneId, setZoneId] = useState<string | null>(null)
  const [statusColoring, setStatusColoring] = useState(true)
  const [section, setSection] = useState<SectionBox | null>(null)
  const [walking, setWalking] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [panel, setPanel] = useState<'controls' | 'details' | null>('controls')
  const [rightTab, setRightTab] = useState<'element' | 'issues'>(params.get('issue') ? 'issues' : 'element')
  const [issueId, setIssueId] = useState<string | null>(params.get('issue'))
  const [draft, setDraft] = useState<IssueDraft | null>(null)
  const [picking, setPicking] = useState(false)
  const [issueFilter, setIssueFilter] = useState<IssueFilter>(DEFAULT_FILTER)
  const [overlay, setOverlay] = useState(false)

  const q = versionParam ? `?version=${versionParam}` : ''
  const manifest = useQuery({ queryKey: ['manifest', project.id, versionParam], queryFn: () => api<ViewerManifest>(`/projects/${project.id}/viewer${q}`) })
  const elements = useQuery({ queryKey: ['elements', project.id, versionParam], queryFn: () => api<ElementInfo[]>(`/projects/${project.id}/elements${q}`) })
  const versions = useQuery({ queryKey: ['versions', project.id], queryFn: () => api<ModelVersion[]>(`/projects/${project.id}/models`) })
  const tree = useQuery({ queryKey: ['tree', project.id], queryFn: () => api<Building[]>(`/projects/${project.id}/tree`) })
  const issues = useQuery({
    queryKey: ['issues', project.id, issueFilter],
    queryFn: () => api<Issue[]>(`/projects/${project.id}/issues${filterQuery(issueFilter)}`),
  })

  const onReady = useCallback((v: SiteViewer | null) => {
    viewerRef.current = v
    setViewerReady(!!v)
    if (import.meta.env.DEV) (window as unknown as { __viewer?: SiteViewer | null }).__viewer = v // e2e hook
    if (!v) return
    v.on('select', (id) => {
      setSelected(id)
      if (id) setPanel('details')
    })
    v.on('walkchange', setWalking)
    v.on('pick', (hit) => {
      v.setPickMode(false)
      setPicking(false)
      setDraft({ element_id: hit.elementId, anchor: hit.point, viewpoint: v.getViewpoint() })
      setRightTab('issues')
      setPanel('details')
    })
    v.on('marker', (id) => {
      setIssueId(id)
      setDraft(null)
      setRightTab('issues')
      setPanel('details')
    })
  }, [])

  // Load geometry whenever the manifest changes.
  const layerKey = manifest.data?.layers.map((l) => l.url).join('|')
  useEffect(() => {
    const v = viewerRef.current
    const layers = manifest.data?.layers
    if (!v || !layers) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    Promise.all(layers.map(async (l) => ({ ...l, data: await (await api<Blob>(l.url.replace(/^\/api/, ''))).arrayBuffer() })))
      .then((data) => (cancelled ? undefined : v.loadLayers(data)))
      .catch((e) => setLoadError((e as Error).message))
      .finally(() => !cancelled && setLoading(false))
    setDisciplines(null)
    return () => {
      cancelled = true
    }
  }, [layerKey, viewerReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const allDisciplines = useMemo(() => manifest.data?.layers.map((l) => l.discipline) ?? [], [manifest.data])
  const shown = useMemo(() => disciplines ?? new Set(allDisciplines), [disciplines, allDisciplines])
  const els = useMemo(() => elements.data ?? [], [elements.data])

  useEffect(() => {
    const v = viewerRef.current
    if (!v || loading) return
    v.setVisible(visibleIds(els, { disciplines: shown, levelId, zoneId }))
    if (overlay && issues.data) {
      const byEl = new Map<string, string>()
      for (const i of [...issues.data].reverse()) if (i.element_id) byEl.set(i.element_id, ISSUE_STATUS_COLOR[i.status])
      v.setColors(new Map(els.map((e) => [e.id, byEl.get(e.id) ?? '#d9d9d9'])))
    } else v.setColors(colorMap(els, statusColoring))
  }, [els, shown, levelId, zoneId, statusColoring, loading, overlay, issues.data])

  // Issue pins
  useEffect(() => {
    viewerRef.current?.setMarkers((issues.data ?? []).filter((i) => i.anchor).map((i) => ({ id: i.id, position: i.anchor!, color: ISSUE_STATUS_COLOR[i.status] })))
  }, [issues.data, loading])

  // Deep link: ?issue=ID flies to its saved view once the model is loaded.
  const flewTo = useRef<string | null>(null)
  useEffect(() => {
    const id = params.get('issue')
    if (!id || loading || !viewerReady || flewTo.current === id || !manifest.data?.version) return
    flewTo.current = id
    api<Issue>(`/issues/${id}`).then((i) => i.viewpoint && viewerRef.current?.flyTo(i.viewpoint as never)).catch(() => {})
  }, [params, loading, viewerReady, manifest.data])

  const startIssue = () => {
    const v = viewerRef.current
    if (!v) return
    if (picking) {
      v.setPickMode(false)
      setPicking(false)
      return
    }
    v.setPickMode(true)
    setPicking(true)
  }
  const openIssue = (i: Issue) => {
    setIssueId(i.id)
    setDraft(null)
    if (i.viewpoint) viewerRef.current?.flyTo(i.viewpoint as never)
    if (i.element_id) viewerRef.current?.select(i.element_id)
  }

  useEffect(() => viewerRef.current?.setSection(section), [section])

  const levels = (tree.data ?? []).flatMap((b) => b.levels.map((l) => ({ ...l, label: tree.data!.length > 1 ? `${b.name} › ${l.name}` : l.name })))
  const zones = levels.find((l) => l.id === levelId)?.zones ?? levels.flatMap((l) => l.zones)

  const toggle = (d: string) => {
    const next = new Set(shown)
    if (next.has(d)) next.delete(d)
    else next.add(d)
    setDisciplines(next)
  }
  const isolate = (d: string) => setDisciplines(new Set([d]))
  const focusZone = (zid: string | null) => {
    setZoneId(zid)
    if (zid) viewerRef.current?.frame(els.filter((e) => e.zone_id === zid).map((e) => e.id))
  }

  const version = manifest.data?.version
  const canApprove = can.editStructure(project.my_role)
  const approve = async () => {
    if (!version) return
    await api(`/models/${version.id}/approve`, { method: 'POST', json: { message: null } })
    setParams({})
    qc.invalidateQueries({ queryKey: ['versions', project.id] })
    qc.invalidateQueries({ queryKey: ['manifest', project.id] })
    qc.invalidateQueries({ queryKey: ['elements', project.id] })
  }
  const setSec = (axis: 0 | 1 | 2, end: 'min' | 'max', val: number) => {
    const s = structuredClone(section ?? FULL)
    s[end][axis] = val
    if (s.min[axis] > s.max[axis] - 0.01) return
    setSection(s)
  }

  const noModel = manifest.data && !manifest.data.version
  return (
    <div className="model-layout">
      <aside className={`model-side left ${panel === 'controls' ? 'open' : ''}`} aria-label="Model controls">
        <section>
          <h3>Model</h3>
          <select aria-label="Model version" value={versionParam ?? ''} onChange={(e) => setParams(e.target.value ? { version: e.target.value } : {})}>
            <option value="">Current (approved)</option>
            {versions.data?.map((v) => (
              <option key={v.id} value={v.id}>v{v.number} · {v.status}{v.is_current ? ' · current' : ''}{v.message ? ` · ${v.message.slice(0, 30)}` : ''}</option>
            ))}
          </select>
          {version?.status === 'draft' && (
            <div className="notice warn">
              Draft v{version.number}: only managers can see it.{' '}
              {canApprove && <button className="small primary" onClick={approve}>Approve &amp; publish</button>}
            </div>
          )}
        </section>
        <section>
          <h3>Layers</h3>
          {allDisciplines.map((d) => {
            const ctx = manifest.data?.layers.find((l) => l.discipline === d)?.context
            return (
              <div key={d} className="row layer-row">
                <label className="row grow" style={{ flexDirection: 'row', color: 'var(--text)' }}>
                  <input type="checkbox" checked={shown.has(d)} onChange={() => toggle(d)} />
                  <span className="swatch" style={{ background: DISCIPLINE_COLORS[d] }} />
                  {DISCIPLINE_LABELS[d] ?? d} {ctx && <span className="muted">(context)</span>}
                </label>
                <button className="small" onClick={() => isolate(d)} title={`Show only ${DISCIPLINE_LABELS[d]}`}>Isolate</button>
              </div>
            )
          })}
          {disciplines && <button className="link" onClick={() => setDisciplines(null)}>Show all layers</button>}
        </section>
        <section>
          <h3>Filter</h3>
          <label>Level
            <select value={levelId ?? ''} onChange={(e) => { setLevelId(e.target.value || null); setZoneId(null) }}>
              <option value="">All levels</option>
              {levels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
          <label>Zone
            <select value={zoneId ?? ''} onChange={(e) => focusZone(e.target.value || null)}>
              <option value="">All zones</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </label>
        </section>
        <section>
          <div className="row">
            <h3 className="grow" style={{ margin: 0 }}>Status colors</h3>
            <label className="switch"><input type="checkbox" checked={statusColoring} onChange={(e) => setStatusColoring(e.target.checked)} aria-label="Status coloring" /></label>
          </div>
          <div className="legend">
            {LEGEND.map((l) => <div key={l.label} className="row"><span className="swatch" style={{ background: l.color }} />{l.label}</div>)}
            <div className="row muted"><span className="swatch" style={{ background: '#bbb' }} />Other: color by layer</div>
          </div>
        </section>
        <section>
          <div className="row">
            <h3 className="grow" style={{ margin: 0 }}>Section box</h3>
            <label className="switch"><input type="checkbox" checked={!!section} onChange={(e) => setSection(e.target.checked ? FULL : null)} aria-label="Section box" /></label>
          </div>
          {section && (['X', 'Height', 'Z'] as const).map((name, i) => (
            <div key={name} className="stack" style={{ gap: 2 }}>
              <span className="muted" style={{ fontSize: 12 }}>{name}</span>
              <div className="row">
                <input className="grow" type="range" min={0} max={1} step={0.01} value={section.min[i]} aria-label={`${name} min`} onChange={(e) => setSec(i as 0 | 1 | 2, 'min', +e.target.value)} />
                <input className="grow" type="range" min={0} max={1} step={0.01} value={section.max[i]} aria-label={`${name} max`} onChange={(e) => setSec(i as 0 | 1 | 2, 'max', +e.target.value)} />
              </div>
            </div>
          ))}
        </section>
        <section className="row">
          <button onClick={() => viewerRef.current?.frame()}>Fit view</button>
          <button onClick={() => viewerRef.current?.setWalkMode(!walking)}>{walking ? 'Exit walk' : 'Walk mode'}</button>
        </section>
        {canApprove && (
          <section>
            <h3>Upload IFC model</h3>
            <ImportPanel projectId={project.id} onDone={(vid) => { qc.invalidateQueries({ queryKey: ['versions', project.id] }); setParams({ version: vid }) }} />
          </section>
        )}
      </aside>

      <div className="viewer-wrap">
        <ViewerCanvas onReady={onReady} onError={() => setWebglFailed(true)} />
        {project.my_role !== 'viewer' && manifest.data?.version && (
          <div className="toolbar">
            <button className={picking ? 'primary' : ''} onClick={startIssue}>{picking ? 'Click the model to pin… (cancel)' : '+ Issue'}</button>
            {selected && !picking && (
              <button onClick={() => { setDraft({ element_id: selected, viewpoint: viewerRef.current?.getViewpoint() }); setRightTab('issues'); setPanel('details') }}>
                Issue on selection
              </button>
            )}
          </div>
        )}
        {(loading || manifest.isLoading) && <div className="viewer-overlay">Loading model…</div>}
        {loadError && <div className="viewer-overlay error">{loadError}</div>}
        {webglFailed && <div className="viewer-overlay error">3D isn't available in this browser (WebGL failed to start).</div>}
        {noModel && (
          <div className="viewer-overlay">
            No approved model yet.{canApprove ? ' Upload an IFC file, or convert drawings on the Drawings page.' : ' Ask your project manager to publish one.'}
          </div>
        )}
        {walking && <div className="walk-hint">WASD / arrows to move · Shift to run · Esc to exit</div>}
        <div className="walk-pad" aria-label="Walk controls">
          <button onClick={() => viewerRef.current?.walkStep(1, 0)} aria-label="Forward">▲</button>
          <div className="row" style={{ gap: 4 }}>
            <button onClick={() => viewerRef.current?.walkStep(0, 0, 0.3)} aria-label="Turn left">⟲</button>
            <button onClick={() => viewerRef.current?.walkStep(-1, 0)} aria-label="Back">▼</button>
            <button onClick={() => viewerRef.current?.walkStep(0, 0, -0.3)} aria-label="Turn right">⟳</button>
          </div>
        </div>
        <div className="mobile-tabs">
          <button onClick={() => setPanel(panel === 'controls' ? null : 'controls')}>Controls</button>
          <button onClick={() => setPanel(panel === 'details' ? null : 'details')}>Details & issues</button>
        </div>
      </div>

      <aside className={`model-side right ${panel === 'details' ? 'open' : ''}`} aria-label="Details">
        <div className="tabs" role="tablist">
          <button role="tab" className={rightTab === 'element' ? 'active' : ''} onClick={() => setRightTab('element')}>Element</button>
          <button role="tab" className={rightTab === 'issues' ? 'active' : ''} onClick={() => setRightTab('issues')}>
            Issues {issues.data ? `(${issues.data.length})` : ''}
          </button>
        </div>
        {rightTab === 'element' && (selected ? (
          <ElementPanel id={selected} versionId={versionParam} onClose={() => { viewerRef.current?.select(null); setSelected(null) }} />
        ) : (
          <div className="muted">Click an element to see its properties, status and history.</div>
        ))}
        {rightTab === 'issues' && (draft ? (
          <IssueForm projectId={project.id} draft={draft} onCancel={() => setDraft(null)}
            onCreated={(i) => { setDraft(null); qc.invalidateQueries({ queryKey: ['issues', project.id] }); qc.invalidateQueries({ queryKey: ['elements', project.id] }); setIssueId(i.id) }} />
        ) : issueId ? (
          <IssuePanel issueId={issueId} projectId={project.id} role={project.my_role} onClose={() => setIssueId(null)}
            onFlyTo={(i) => i.viewpoint && viewerRef.current?.flyTo(i.viewpoint as never)} />
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <IssueFilters projectId={project.id} value={issueFilter} onChange={setIssueFilter} />
            <label className="row" style={{ flexDirection: 'row', color: 'var(--text)' }}>
              <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> Color the model by these issues
            </label>
            {issues.data?.length === 0 && <span className="muted">No issues match.</span>}
            {issues.data?.map((i) => (
              <div key={i.id} className="issue-row" onClick={() => openIssue(i)} role="button" tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && openIssue(i)}>
                <span className="dot" style={{ background: ISSUE_STATUS_COLOR[i.status] }} />
                <div className="grow">
                  <div>#{i.number} {i.title}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{i.priority} · {i.trade ?? 'no trade'} · {i.assignee_name ?? 'unassigned'}{i.comment_count ? ` · ${i.comment_count} 💬` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </aside>
    </div>
  )
}
