import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { elementLabel, STATUS_LABEL, type Building, type ChecklistItem, type ElementInfo, type Project, type Trade, type ViewerManifest } from '../api/types'
import { DISCIPLINE_COLORS, STATUS_COLORS } from '../viewer/colors'
import type { SiteViewer } from '../viewer/Viewer'
import ViewerCanvas from '../viewer/ViewerCanvas'
import { enqueue, startSyncLoop, syncQueue } from './queue'
import QueueBadge from './QueueBadge'

function FieldShell({ title, back, children }: { title: string; back?: string; children: React.ReactNode }) {
  useEffect(() => startSyncLoop(), [])
  return (
    <div className="field">
      <header className="field-head">
        {back ? <Link to={back} className="field-back" aria-label="Back">‹</Link> : <Link to="/" className="field-back" aria-label="Office view">⌂</Link>}
        <strong className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</strong>
        <QueueBadge />
      </header>
      <main className="field-main">{children}</main>
    </div>
  )
}

export function FieldHome() {
  const { data } = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') })
  return (
    <FieldShell title="Report progress">
      <QueueBadge detailed />
      <h2>Pick a project</h2>
      {data?.map((p) => (
        <Link key={p.id} to={`/field/${p.id}`} className="field-card">{p.name}<span className="muted">{p.address}</span></Link>
      ))}
    </FieldShell>
  )
}

function useProjectData(pid: string) {
  const project = useQuery({ queryKey: ['project', pid], queryFn: () => api<Project>(`/projects/${pid}`) })
  const tree = useQuery({ queryKey: ['tree', pid], queryFn: () => api<Building[]>(`/projects/${pid}/tree`) })
  const trades = useQuery({ queryKey: ['trades'], queryFn: () => api<Trade[]>('/trades') })
  return { project: project.data, tree: tree.data, trades: trades.data }
}

export function FieldZones() {
  const { pid } = useParams() as { pid: string }
  const { project, tree } = useProjectData(pid)
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const levels = (tree ?? []).flatMap((b) => b.levels.map((l) => ({ ...l, label: (tree?.length ?? 0) > 1 ? `${b.name} › ${l.name}` : l.name })))
  return (
    <FieldShell title={project?.name ?? '…'} back="/field">
      <div className="row">
        <input className="grow" placeholder="Find a room or unit…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find zone" />
        <button onClick={() => nav(`/field/${pid}/scan`)}>Scan QR</button>
      </div>
      {levels.map((l) => {
        const zs = l.zones.filter((z) => z.name.toLowerCase().includes(q.toLowerCase()))
        if (!zs.length) return null
        return (
          <section key={l.id}>
            <h3 className="muted" style={{ margin: '12px 0 6px' }}>{l.label}</h3>
            {zs.map((z) => <Link key={z.id} to={`/field/${pid}/zone/${z.id}`} className="field-card">{z.name}</Link>)}
          </section>
        )
      })}
      {levels.length === 0 && <p className="muted">No zones you can report on yet.</p>}
    </FieldShell>
  )
}

export function FieldScan() {
  const { pid } = useParams() as { pid: string }
  const nav = useNavigate()
  const video = useRef<HTMLVideoElement>(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const supported = 'BarcodeDetector' in window
  const go = async (raw: string) => {
    const token = raw.trim().split('/').pop() ?? ''
    try {
      const z = await api<{ id: string }>(`/zones/by-qr/${encodeURIComponent(token)}`)
      nav(`/field/${pid}/zone/${z.id}`, { replace: true })
    } catch {
      setMsg("That code isn't a room on this project (or not one you're assigned to).")
    }
  }
  useEffect(() => {
    if (!supported) return
    let stream: MediaStream | null = null
    let stop = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!video.current) return
        video.current.srcObject = stream
        await video.current.play()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const det = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
        while (!stop) {
          const codes = await det.detect(video.current).catch(() => [])
          if (codes[0]?.rawValue) {
            stop = true
            go(codes[0].rawValue)
            break
          }
          await new Promise((r) => setTimeout(r, 300))
        }
      } catch {
        setMsg('Camera not available. Type the code printed under the QR instead.')
      }
    })()
    return () => {
      stop = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <FieldShell title="Scan room QR" back={`/field/${pid}`}>
      {supported ? <video ref={video} className="scan-video" muted playsInline /> : <p className="muted">This browser can't scan QR codes. Type the code instead.</p>}
      {msg && <p className="error">{msg}</p>}
      <form className="row" onSubmit={(e) => { e.preventDefault(); go(code) }}>
        <input className="grow" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code under the QR" aria-label="Room code" />
        <button className="primary">Go</button>
      </form>
    </FieldShell>
  )
}

export function QrRedirect() {
  const { token } = useParams() as { token: string }
  const nav = useNavigate()
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    api<{ id: string; level_id: string }>(`/zones/by-qr/${encodeURIComponent(token)}`)
      .then(async (z) => {
        const projects = await api<Project[]>('/projects')
        for (const p of projects) {
          const tree = await api<Building[]>(`/projects/${p.id}/tree`)
          if (tree.some((b) => b.levels.some((l) => l.id === z.level_id))) return nav(`/field/${p.id}/zone/${z.id}`, { replace: true })
        }
        setErr('Room not found')
      })
      .catch(() => setErr("This room isn't on one of your projects."))
  }, [token, nav])
  return <FieldShell title="Opening room…">{err ? <p className="error">{err}</p> : <p className="muted">Loading…</p>}</FieldShell>
}

const ST_COLOR: Record<string, string> = { done: STATUS_COLORS.done, needs_review: STATUS_COLORS.review }

export function FieldZone() {
  const { pid, zid } = useParams() as { pid: string; zid: string }
  const { project, trades } = useProjectData(pid)
  const myTrades = project?.my_role === 'trade' ? project.my_trades : (trades ?? []).map((t) => t.code).filter((t) => t !== 'architecture')
  const [trade, setTrade] = useState<string>('')
  const activeTrade = trade || myTrades[0] || ''
  const checklist = useQuery({
    queryKey: ['checklist', zid, activeTrade],
    queryFn: () => api<{ zone: { id: string; name: string }; items: ChecklistItem[] }>(`/zones/${zid}/checklist?trade=${activeTrade}`),
    enabled: !!activeTrade,
  })
  const manifest = useQuery({ queryKey: ['manifest', pid, undefined], queryFn: () => api<ViewerManifest>(`/projects/${pid}/viewer`) })
  const elements = useQuery({ queryKey: ['elements', pid, undefined], queryFn: () => api<ElementInfo[]>(`/projects/${pid}/elements`) })
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [files, setFiles] = useState<File[]>([])
  const [note, setNote] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [viewer, setViewer] = useState<SiteViewer | null>(null)
  const [show3d, setShow3d] = useState(true)
  const items = useMemo(() => checklist.data?.items ?? [], [checklist.data])
  const zoneName = checklist.data?.zone.name ?? ''

  // Mini 3D view: this zone's trade elements + faint walls on the same level, framed on the zone.
  useEffect(() => {
    if (!viewer || !manifest.data || !elements.data || !items.length) return
    const ids = new Set(items.map((i) => i.id))
    const level = elements.data.find((e) => ids.has(e.id))?.level_id
    let cancelled = false
    Promise.all(manifest.data.layers.filter((l) => l.context || l.discipline === items[0].discipline)
      .map(async (l) => ({ ...l, data: await (await api<Blob>(l.url.replace(/^\/api/, ''))).arrayBuffer() })))
      .then((layers) => (cancelled ? undefined : viewer.loadLayers(layers)))
      .then(() => {
        if (cancelled) return
        viewer.setVisible(new Set(elements.data!.filter((e) => ids.has(e.id) || (e.discipline === 'architecture' && e.level_id === level)).map((e) => e.id)))
        viewer.frame([...ids])
      })
    return () => { cancelled = true }
  }, [viewer, manifest.data, elements.data, items])
  useEffect(() => {
    if (!viewer) return
    viewer.setColors(new Map(items.map((i) => [i.id, checked.has(i.id) ? '#7c4dff' : ST_COLOR[i.status] ?? DISCIPLINE_COLORS[i.discipline]])))
  }, [viewer, items, checked])

  const toggle = (id: string) => {
    const n = new Set(checked)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setChecked(n)
    viewer?.select(id)
  }
  const submit = async () => {
    if (!files.length) return
    let reference: { name: string; type: string; blob: Blob } | null = null
    if (viewer && show3d) {
      const blob = await (await fetch(viewer.snapshot('image/jpeg', 0.8))).blob()
      reference = { name: 'reference.jpg', type: 'image/jpeg', blob }
    }
    await enqueue({
      project_id: pid, zone_id: zid, zone_name: zoneName, trade: activeTrade, note,
      element_ids: [...checked], files: files.map((f) => ({ name: f.name, type: f.type || 'image/jpeg', blob: f })),
      ...(reference ? { reference } : {}),
    })
    setFiles([])
    setChecked(new Set())
    setNote('')
    setDone(navigator.onLine ? 'Sending…' : 'Saved on this phone. It will send when you have signal.')
    const n = await syncQueue()
    setDone(n > 0 ? 'Sent for review. Your manager will confirm it.' : 'Saved on this phone. It will send when you have signal.')
    checklist.refetch()
  }

  const counts = items.reduce((a, i) => ({ ...a, [i.status]: (a[i.status] ?? 0) + 1 }), {} as Record<string, number>)
  return (
    <FieldShell title={zoneName || 'Zone'} back={`/field/${pid}`}>
      {myTrades.length > 1 && (
        <select value={activeTrade} onChange={(e) => { setTrade(e.target.value); setChecked(new Set()) }} aria-label="Trade">
          {myTrades.map((t) => <option key={t}>{t}</option>)}
        </select>
      )}
      <div className="row" style={{ fontSize: 13 }}>
        <span className="muted grow">{items.length} {activeTrade} items · {counts.done ?? 0} done · {counts.needs_review ?? 0} in review</span>
        <button className="small" onClick={() => setShow3d(!show3d)}>{show3d ? 'Hide 3D' : 'Show 3D'}</button>
      </div>
      {show3d && <div className="field-3d"><ViewerCanvas onReady={setViewer} /></div>}
      {done && <div className="notice" role="status">{done}</div>}
      <section className="stack" style={{ gap: 4 }}>
        <h3 style={{ margin: '8px 0 0' }}>What did you finish?</h3>
        {items.length === 0 && !checklist.isLoading && <p className="muted">Nothing for {activeTrade} in this zone.</p>}
        {items.map((i) => {
          const locked = i.status === 'done' || i.status === 'needs_review'
          return (
            <label key={i.id} className={`check-item ${checked.has(i.id) ? 'on' : ''}`}>
              <input type="checkbox" disabled={locked} checked={checked.has(i.id)} onChange={() => toggle(i.id)} />
              <span className="grow">
                {elementLabel(i)}
                {i.flags.includes('possibly_missed') && <span className="badge danger" style={{ marginLeft: 6 }}>possibly missed</span>}
                {i.flags.includes('retake_photo') && <span className="badge warn" style={{ marginLeft: 6 }}>retake photo</span>}
              </span>
              <span className="badge" style={{ color: ST_COLOR[i.status], borderColor: ST_COLOR[i.status] }}>{STATUS_LABEL[i.status]}</span>
            </label>
          )
        })}
      </section>
      <section className="stack" style={{ gap: 6 }}>
        <h3 style={{ margin: '8px 0 0' }}>Photos</h3>
        <label className="photo-btn">
          📷 Take / add photos
          <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} aria-label="Add photos" />
        </label>
        {files.length > 0 && (
          <div className="thumbs">
            {files.map((f, i) => <img key={i} className="thumb" src={URL.createObjectURL(f)} alt={f.name} onClick={() => setFiles(files.filter((_, j) => j !== i))} />)}
          </div>
        )}
        <textarea rows={2} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
        <button className="primary big" disabled={!files.length} onClick={submit}>
          Submit {checked.size ? `${checked.size} item${checked.size > 1 ? 's' : ''}` : 'photos'}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>Photos are required. Items turn green only after your manager confirms them.</span>
      </section>
    </FieldShell>
  )
}
