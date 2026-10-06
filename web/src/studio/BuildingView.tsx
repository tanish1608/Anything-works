import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { BuildingScene, type SceneOptions, type System } from './scene'
import { STATUS, TRADES, UNITS, unitStatus, type DemoState, type Task, type Trade } from './model'

export const SYSTEMS: { id: System; name: string; icon: string; color: string }[] = [
  { id: 'architecture', name: 'Architecture', icon: 'building', color: '#8b9588' },
  { id: 'plumbing', name: 'Plumbing', icon: 'water', color: '#4388b1' },
  { id: 'electrical', name: 'Electrical', icon: 'bolt', color: '#b9994b' },
  { id: 'hvac', name: 'HVAC', icon: 'wind', color: '#659591' },
  { id: 'furniture', name: 'Interiors', icon: 'grid', color: '#a2937a' },
]
export function StatusBadge({ status }: { status: keyof typeof STATUS }) { return <span className={`st-badge ${status}`}><i />{STATUS[status].label}</span> }
export function Avatar({ trade, small = false }: { trade: Trade; small?: boolean }) { return <span className={`st-avatar ${small ? 'small' : ''}`} style={{ background: `${TRADES[trade].color}18`, color: TRADES[trade].color }}>{TRADES[trade].initials}</span> }

export function BuildingView({ state, selected, select, openTask, createTask, navigate }: { state: DemoState; selected: string; select: (id: string) => void; openTask: (t: Task) => void; createTask: () => void; navigate: (page: string) => void }) {
  const host = useRef<HTMLDivElement>(null), scene = useRef<BuildingScene | null>(null)
  const [floor, setFloor] = useState(0), [exploded, setExploded] = useState(false), [xray, setXray] = useState(false), [plan, setPlan] = useState(false)
  const [systems, setSystems] = useState(new Set<System>(SYSTEMS.map(s => s.id)))
  const [coloring, setColoring] = useState(true), [phase, setPhase] = useState(6)
  const [modelStats, setModelStats] = useState({ count: 0, calls: 0 }), [failed, setFailed] = useState(false), [inspector, setInspector] = useState(true)
  const options: SceneOptions = { floor, exploded, xray, plan, systems, selected, coloring, phase }
  const initial = useRef(options)
  const selectRef = useRef(select); selectRef.current = select
  useEffect(() => {
    if (!host.current) return
    try { scene.current = new BuildingScene(host.current, id => selectRef.current(id), (count, calls) => setModelStats({ count, calls }), initial.current) }
    catch { setFailed(true) }
    return () => { scene.current?.dispose(); scene.current = null }
  }, [])
  useEffect(() => { scene.current?.update({ floor, exploded, xray, plan, systems, selected, coloring, phase }) }, [floor, exploded, xray, plan, systems, selected, coloring, phase])
  useEffect(() => { scene.current?.setState(state) }, [state])
  useEffect(() => { scene.current?.frame(plan) }, [floor, exploded, plan])
  const unit = UNITS.find(u => u.id === selected)!
  const tasks = state.tasks.filter(t => t.unit === selected)
  const approved = tasks.filter(t => t.status === 'approved').length
  const issue = state.issues.find(i => i.unit === selected && !i.resolved)
  const status = unitStatus(state, selected)
  const chooseFloor = (f: number) => { setFloor(f); if (f && unit.floor !== f) select(`${f}01`) }
  const snapshot = () => {
    if (!scene.current) return
    const a = document.createElement('a'); a.href = scene.current.snapshot(); a.download = 'hawthorne-model.png'; a.click()
  }
  return <div className={`st-building-layout ${inspector ? '' : 'wide'}`}>
    <div className="st-spatial">
      <div className="st-view-head"><div><span className="st-eyebrow">SPATIAL WORKSPACE</span><h2>The whole site. One clear view.</h2></div><div className="st-segment"><button className={!plan ? 'active' : ''} onClick={() => setPlan(false)}><Icon name="cube" size={15} />3D model</button><button className={plan ? 'active' : ''} onClick={() => setPlan(true)}><Icon name="layers" size={15} />Plan view</button></div></div>
      <div className="st-canvas-wrap">
        <div className="st-canvas" ref={host} />
        {failed && <div className="st-webgl-error"><Icon name="cube" size={36} /><h3>3D is unavailable in this browser</h3><p>The room list and all project workflows are still available.</p><button onClick={() => navigate('handoffs')}>Open room readiness</button></div>}
        <div className="st-canvas-label"><span className="st-live-dot" />MODEL V1.0 <span>·</span> {floor ? `LEVEL ${String(floor).padStart(2, '0')}` : 'ALL LEVELS'}<small>Architectural + coordinated services</small></div>
        <div className="st-floor-picker" aria-label="Floor selector"><span>LEVELS</span><button className={!floor ? 'active' : ''} onClick={() => chooseFloor(0)} title="Show all floors"><Icon name="building" size={17} /></button>{[6, 5, 4, 3, 2, 1].map(f => <button key={f} className={floor === f ? 'active' : ''} onClick={() => chooseFloor(f)} aria-label={`Level ${f}`}>{String(f).padStart(2, '0')}<i className={f < 3 ? 'done' : f < 5 ? 'progress' : ''} /></button>)}</div>
        <div className="st-model-tools"><button title="Fit building" aria-label="Fit building" onClick={() => scene.current?.frame()}><Icon name="expand" /></button><button title="Zoom in" aria-label="Zoom in" onClick={() => scene.current?.zoom(.8)}><Icon name="plus" /></button><button title="Zoom out" aria-label="Zoom out" onClick={() => scene.current?.zoom(1.2)}><span className="st-minus" /></button><span /><button title="Save model image" aria-label="Save model image" onClick={snapshot}><Icon name="download" /></button><button title="Toggle room details" aria-label="Toggle room details" onClick={() => setInspector(!inspector)}><Icon name="work" /></button></div>
        <div className="st-model-switches"><button className={exploded ? 'active' : ''} onClick={() => setExploded(!exploded)} aria-pressed={exploded}><Icon name="layers" size={15} />Explode floors</button><button className={xray ? 'active' : ''} onClick={() => setXray(!xray)} aria-pressed={xray}><Icon name="eye" size={15} />X-ray</button><button className={coloring ? 'active' : ''} onClick={() => setColoring(!coloring)} aria-pressed={coloring}><span className="st-status-dot" />Readiness</button></div>
        <div className="st-compass"><Icon name="compass" size={29} /><span>N</span></div>
        <div className="st-orbit-hint">Drag to orbit <span>·</span> Scroll to zoom <span>·</span> Click a room to explore</div>
        <div className="st-model-legend">{(['approved', 'review', 'blocked', 'planned'] as const).map(s => <span key={s}><i style={{ background: STATUS[s].color }} />{s === 'approved' ? 'Ready' : s === 'review' ? 'Review' : STATUS[s].label}</span>)}</div>
      </div>
      <div className="st-layer-bar"><span>SYSTEMS</span>{SYSTEMS.map(s => <button key={s.id} className={systems.has(s.id) ? 'on' : ''} aria-pressed={systems.has(s.id)} onClick={() => setSystems(prev => { const next = new Set(prev); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); return next })}><Icon name={s.icon} size={15} style={{ color: s.color }} />{s.name}<i /></button>)}</div>
      <div className="st-model-footer"><span><Icon name="cube" size={13} />{modelStats.count.toLocaleString()} modeled parts <i />48 units <i />6 levels</span><span className="st-build-stage"><label htmlFor="build-stage">Construction sequence</label><input id="build-stage" aria-label="Construction sequence" type="range" min={1} max={6} value={phase} onChange={e => setPhase(Number(e.target.value))} /><b>{phase}/6</b></span></div>
    </div>
    {inspector && <aside className="st-inspector">
      <div className="st-inspector-heading"><span className="st-eyebrow">ROOM DETAILS</span><button className="st-icon-btn" title="Close room details" aria-label="Close room details" onClick={() => setInspector(false)}><Icon name="close" size={17} /></button></div>
      <div className="st-breadcrumb">Building A <Icon name="chevron" size={11} /> Level {String(unit.floor).padStart(2, '0')}</div>
      <div className="st-room-title"><h2>Unit {unit.id}</h2><StatusBadge status={status} /></div><p className="st-muted st-room-sub">{unit.name} apartment <span>·</span> {unit.area} m²</p>
      <div className="st-room-map"><RoomPlan selected={selected} status={status} /><button onClick={() => { chooseFloor(unit.floor); scene.current?.focus(unit.id) }}><Icon name="expand" size={14} />Focus room</button></div>
      <div className="st-room-progress"><div><strong>Ready for drywall</strong><span>{approved}/{tasks.length} checks</span></div><div className="st-progress-track"><i style={{ width: `${approved / tasks.length * 100}%` }} /></div></div>
      {issue && <button className="st-blocker" onClick={() => openTask(tasks.find(t => t.id === issue.task)!)}><Icon name="alert" size={18} /><span><strong>{issue.title}</strong><small>Resolve to release this room</small></span><Icon name="chevron" size={15} /></button>}
      <div className="st-section-heading"><h3>Handoff prerequisites</h3><span>Evidence required</span></div>
      <div className="st-prerequisites">{tasks.map(t => <button key={t.id} onClick={() => openTask(t)}><span className={`st-check-icon ${t.status}`}><Icon name={t.status === 'approved' ? 'check' : t.status === 'blocked' ? 'alert' : t.status === 'review' ? 'clock' : 'work'} size={14} /></span><span><strong>{t.title}</strong><small>{TRADES[t.trade].company}</small></span><Icon name="chevron" size={14} /></button>)}</div>
      <div className="st-next-trade"><div className="st-avatar">IW</div><div><span className="st-eyebrow">UP NEXT</span><strong>Interior Works</strong><small>Drywall · awaiting room release</small></div></div>
      <button className="st-primary st-full" onClick={() => navigate('handoffs')}>Review handoff <Icon name="arrow" size={16} /></button>
      <button className="st-text-btn st-full" onClick={createTask}><Icon name="plus" size={15} />Assign work to this room</button>
      <details className="st-unit-select"><summary>Explore another room <Icon name="down" size={13} /></summary><div>{UNITS.filter(u => !floor || u.floor === floor).map(u => <button className={selected === u.id ? 'active' : ''} key={u.id} onClick={() => select(u.id)} style={{ borderBottomColor: STATUS[unitStatus(state, u.id)].color }}>{u.id}</button>)}</div></details>
    </aside>}
  </div>
}

export function RoomPlan({ selected, status }: { selected: string; status: keyof typeof STATUS }) {
  return <svg viewBox="0 0 300 155" role="img" aria-label={`Floor plan of Unit ${selected}`}><defs><pattern id="roomgrid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M 12 0 L 0 0 0 12" fill="none" stroke="#dce5dc" strokeWidth=".5" /></pattern></defs><rect width="300" height="155" fill="#edf1e9" /><rect width="300" height="155" fill="url(#roomgrid)" /><g stroke="#5a7265" strokeWidth="3" fill="#dce6d8"><path d="M42 27h217v104H42ZM181 27v104M42 73h100m24 0h15M106 27v46" /><path d="M140 129h28" stroke="#edf1e9" strokeWidth="6" /></g><path d="M140 128v-27a27 27 0 0 1 27 27" fill="none" stroke="#99ac9c" /><g fill="#c0d1bd" stroke="#899e88" strokeWidth="1"><rect x="197" y="44" width="44" height="64" rx="3" /><rect x="200" y="47" width="17" height="12" rx="2" fill="#edf1e9" /><rect x="220" y="47" width="17" height="12" rx="2" fill="#edf1e9" /><rect x="57" y="91" width="50" height="20" rx="3" /><rect x="64" y="115" width="36" height="9" rx="2" /><rect x="48" y="32" width="10" height="33" /><rect x="48" y="32" width="50" height="9" /><rect x="120" y="34" width="40" height="8" /></g><path d="M130 63v-16h38" fill="none" stroke="#4388b1" strokeWidth="2" /><circle cx="148" cy="55" r="8" fill={STATUS[status].color} stroke="white" strokeWidth="2" /><text x="24" y="145" fontSize="8" fill="#718074" fontFamily="sans-serif">UNIT {selected} · SCHEMATIC</text><path d="M270 120v-16m-4 4 4-4 4 4" stroke="#748576" fill="none" /><text x="267" y="99" fontSize="8" fill="#748576">N</text></svg>
}
